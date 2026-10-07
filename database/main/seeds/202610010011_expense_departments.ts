import { defineSeed, type QueryAdapter } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';

/**
 * The page id every expense route declares in `authz`, and the id the grant below names.
 *
 * It is a page id, not a collection name: the authorization plugin gates opening the page, while who may see or change
 * which claim is decided from the claim's own department and stage by `ExpenseService`. See `server/AGENTS.md`.
 */
export const EXPENSE_CLAIMS_PAGE_ID = 'expenses.claims';

/** The subject every signed-in user resolves to, the same one the built-in member set is assigned to. */
export const EXPENSE_MEMBER_SUBJECT = {
  type: 'authenticated',
  id: '*',
} as const;

/**
 * Initial business permission configuration: every signed-in user may open the reimbursement pages.
 *
 * This set is ordinary persisted configuration, not a code-owned default. It is written once by the seed so a fresh
 * installation is usable, and an administrator may later change its grants, rename it or drop the assignment. The seed
 * never overwrites an existing set.
 *
 * The title is a plain string on purpose. A `{ key, ns }` title would be looked up in the client's locale namespace,
 * which is the application package name; a permission set is administrator-facing and one English name is enough here.
 *
 * The declaration lives in this seed rather than a shared `database/seed-data/` module on purpose. A seed is loaded as
 * raw TypeScript by `importTaskDefinition()` — under `tsx` from the CLI, but directly by Node in an in-process test —
 * and a relative `./x.js` specifier does not resolve to `x.ts` on that second path. A seed that imports nothing of its
 * own loads the same way in the CLI, the dev server and a test.
 */
const expenseMember = definePermissionSet('expense-member')
  .title('Expense member')
  .grant({
    resource: { type: 'page', id: EXPENSE_CLAIMS_PAGE_ID },
    actions: [{ action: 'access' }],
  })
  .build();

/**
 * The department tree, who belongs to it, and the page access a signed-in user needs.
 *
 * Departments are business data rather than configuration: an administrator adds, renames and re-parents them from the
 * application. This seed only lays down the shape a fresh installation needs to be usable — four departments, the
 * people in them, and one permission set that lets any signed-in user open the reimbursement pages. Every row is
 * looked up by its natural key first, so running it against an installation that already has people leaves them alone.
 */
interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  managerId: string | null;
  parentId: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MembershipRow {
  id: string;
  departmentId: string;
  userId: string;
  isPrimary: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Codes are the stable identity a seed and the finance rule agree on; names are for people. */
const DEPARTMENTS = [
  { code: 'finance', name: '财务部 Finance', manager: 'qianqi', parent: null },
  {
    code: 'engineering',
    name: '研发部 Engineering',
    manager: 'lisi',
    parent: null,
  },
  { code: 'sales', name: '销售部 Sales', manager: 'zhaoliu', parent: null },
  // A child department, so the hierarchy walk in `managesDepartment` has something to walk.
  {
    code: 'marketing',
    name: '市场部 Marketing',
    manager: 'zhaoliu',
    parent: 'sales',
  },
] as const;

const MEMBERSHIPS = [
  { department: 'engineering', user: 'zhangsan' },
  { department: 'engineering', user: 'lisi' },
  { department: 'sales', user: 'wangwu' },
  { department: 'sales', user: 'zhaoliu' },
  { department: 'finance', user: 'qianqi' },
] as const;

export default defineSeed({
  name: '202610010011_expense_departments',
  transaction: true,
  async run(context) {
    const { query } = context;
    // `context.repository` is a method on the context object; calling it off the object keeps `this` intact.
    const departments = context.repository<DepartmentRow>('expenseDepartments');
    const memberships = context.repository<MembershipRow>(
      'expenseDepartmentMembers',
    );

    /** Resolve a sample user's id, or nothing when this installation has no such person. */
    const userIdOf = async (username: string): Promise<string | null> => {
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', username)
        .limit(1)
        .executeTakeFirst();
      return user ? String(user.id) : null;
    };

    const idByCode = new Map<string, string>();
    for (const [index, definition] of DEPARTMENTS.entries()) {
      const existing = await departments.findOne({
        filter: { code: definition.code },
      });
      if (existing) {
        idByCode.set(definition.code, existing.id);
        continue;
      }
      const now = new Date();
      const parentId = definition.parent
        ? (idByCode.get(definition.parent) ?? null)
        : null;
      const managerId = definition.manager
        ? await userIdOf(definition.manager)
        : null;
      const created = await departments.createOne({
        values: {
          id: crypto.randomUUID(),
          code: definition.code,
          name: definition.name,
          managerId,
          parentId,
          sortOrder: index,
          active: true,
          createdAt: now,
          updatedAt: now,
        },
      });
      idByCode.set(definition.code, created.record.id);
    }

    for (const membership of MEMBERSHIPS) {
      const departmentId = idByCode.get(membership.department);
      const userId = await userIdOf(membership.user);
      if (!departmentId || !userId) {
        continue;
      }
      const existing = await memberships.findOne({
        filter: { departmentId, userId },
      });
      if (existing) {
        continue;
      }
      const now = new Date();
      await memberships.createOne({
        values: {
          id: crypto.randomUUID(),
          departmentId,
          userId,
          isPrimary: true,
          active: true,
          createdAt: now,
          updatedAt: now,
        } as MembershipRow,
      });
    }

    await grantExpensePageAccess(query);
  },
});

/**
 * Write the permission set once, without ever overwriting an administrator's own edits.
 *
 * The built-in root and member sets are deliberately untouched: root is a code-owned bypass, and member is the default
 * every signed-in user already resolves to. This adds a second, ordinary set beside them.
 */
async function grantExpensePageAccess(query: QueryAdapter) {
  const now = new Date();
  const existingSet = await query
    .selectFrom('authorizationPermissionSets')
    .select('key')
    .where('key', '=', expenseMember.key)
    .executeTakeFirst();
  if (!existingSet) {
    await query
      .insertInto('authorizationPermissionSets')
      .values({
        id: crypto.randomUUID(),
        key: expenseMember.key,
        title: encodeAuthorizationTitle(expenseMember.title),
        // The declaration above is the single statement of the grant; the store wants the encoded form.
        grants: JSON.stringify(expenseMember.grants),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  const assignmentId = `${EXPENSE_MEMBER_SUBJECT.type}:${EXPENSE_MEMBER_SUBJECT.id}:${expenseMember.key}`;
  const existingAssignment = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('id', '=', assignmentId)
    .executeTakeFirst();
  if (!existingAssignment) {
    await query
      .insertInto('authorizationPermissionSetAssignments')
      .values({
        id: assignmentId,
        subjectType: EXPENSE_MEMBER_SUBJECT.type,
        subjectId: EXPENSE_MEMBER_SUBJECT.id,
        permissionSetKey: expenseMember.key,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }
}
