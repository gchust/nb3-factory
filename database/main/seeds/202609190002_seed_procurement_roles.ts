import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Application roles, demo accounts, and the page access every signed-in user needs.
 *
 * Roles are Authorization Permission Sets, which is what the built-in Users page
 * offers as assignable roles. They intentionally carry no database grants: the
 * procurement module enforces record-level access in its own routes, and these
 * sets exist to record which business role a user holds.
 *
 * Seeds are idempotent: re-running creates nothing and never overwrites an
 * assignment an administrator has since changed.
 */
const ROLE_TITLES: Readonly<Record<string, string>> = {
  'procurement-manager': '采购经理',
  'procurement-buyer': '采购员',
  'warehouse-keeper': '仓管员',
};

interface DemoUser {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly password: string;
}

const DEMO_USERS: readonly DemoUser[] = [
  {
    username: 'manager1',
    name: '采购经理',
    email: 'manager1@procurement.invalid',
    role: 'procurement-manager',
    password: 'Manager123!',
  },
  {
    username: 'buyer1',
    name: '采购员甲',
    email: 'buyer1@procurement.invalid',
    role: 'procurement-buyer',
    password: 'Buyer123!',
  },
  {
    username: 'buyer2',
    name: '采购员乙',
    email: 'buyer2@procurement.invalid',
    role: 'procurement-buyer',
    password: 'Buyer123!',
  },
  {
    username: 'warehouse1',
    name: '仓管员',
    email: 'warehouse1@procurement.invalid',
    role: 'warehouse-keeper',
    password: 'Warehouse123!',
  },
];

/**
 * The routes this module contributes. The client checks `page:<route name>:access`
 * for every top-level page, so the default set assigned to all signed-in users
 * has to name them or the pages are unreachable outside the administrator.
 */
const PROCUREMENT_PAGES = [
  'procurement',
  'procurement-dashboard',
  'procurement-suppliers',
  'procurement-materials',
  'procurement-orders',
  'procurement-todos',
  'procurement-receipts',
];

interface PermissionGrant {
  resource: { type: string; id: string };
  actions: { action: string }[];
}

const seed: SeedDefinition = defineSeed({
  name: '202609190002_seed_procurement_roles',

  async run({ query }) {
    const now = new Date();

    for (const [key, title] of Object.entries(ROLE_TITLES)) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', key)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key,
          title,
          grants: JSON.stringify([]),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    for (const user of DEMO_USERS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', user.username)
        .executeTakeFirst();
      let userId = existing ? String(existing.id) : undefined;
      if (!userId) {
        userId = crypto.randomUUID();
        await query
          .insertInto('user')
          .values({
            id: userId,
            name: user.name,
            username: user.username,
            email: user.email,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await query
          .insertInto('account')
          .values({
            id: crypto.randomUUID(),
            issuer: 'local:credential',
            accountId: userId,
            providerId: 'credential',
            userId,
            password: await hashPassword(user.password),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }

      const assignmentId = `user:${userId}:${user.role}`;
      const assignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (assignment) continue;
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'user',
          subjectId: userId,
          permissionSetKey: user.role,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    await grantPageAccess(query, now);
  },
});

async function grantPageAccess(
  query: SeedContext['query'],
  now: Date,
): Promise<void> {
  const row = await query
    .selectFrom('authorizationPermissionSets')
    .select(['key', 'grants'])
    .where('key', '=', 'default-pages')
    .executeTakeFirst();
  if (!row) return;

  const grants = parseGrants(row.grants);
  const next = addPageGrants(grants);
  if (next === grants) return;

  await query
    .updateTable('authorizationPermissionSets')
    .set({ grants: JSON.stringify(next), updatedAt: now })
    .where('key', '=', 'default-pages')
    .execute();
}

function addPageGrants(
  grants: readonly PermissionGrant[],
): readonly PermissionGrant[] {
  const index = grants.findIndex(
    (grant) => grant.resource.type === 'page' && grant.resource.id === '*',
  );
  if (index !== -1) return grants;

  const missing = PROCUREMENT_PAGES.filter(
    (page) =>
      !grants.some(
        (grant) => grant.resource.type === 'page' && grant.resource.id === page,
      ),
  );
  if (missing.length === 0) return grants;

  return [
    ...grants,
    ...missing.map((page) => ({
      resource: { type: 'page', id: page },
      actions: [{ action: 'access' }],
    })),
  ];
}

function parseGrants(value: unknown): readonly PermissionGrant[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) {
    throw new Error('Permission set grants must be an array.');
  }
  return parsed as readonly PermissionGrant[];
}

export default seed;
