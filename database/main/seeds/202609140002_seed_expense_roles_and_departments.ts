import { defineSeed, type SeedDefinition } from '@nocobase/db';

type SeedQuery = Parameters<SeedDefinition['run']>[0]['query'];

/**
 * Roles, departments, and example data for the expense receipt suite.
 *
 * Idempotent: a repeat run touches nothing, and it never overwrites user edits. Every identifying value is fixed,
 * so the same seed produces the same rows on any machine.
 */
const SYSTEM_ADMINISTRATOR = 'system-administrator';
const APPLICANT_ROLE = 'expense-applicant';
const MANAGER_ROLE = 'expense-manager';
const FINANCE_ROLE = 'expense-finance';

const CLAIM_FIELDS = [
  'id',
  'number',
  'applicantId',
  'applicantName',
  'departmentId',
  'departmentName',
  'type',
  'reason',
  'appliedAt',
  'status',
  'totalAmount',
  'receiptCount',
  'rejectReason',
  'submittedAt',
  'decidedAt',
  'decidedById',
  'paidAt',
  'paidById',
  'createdAt',
  'updatedAt',
] as const;

const CLAIM_CREATE_INPUT = [
  'departmentId',
  'type',
  'reason',
  'appliedAt',
] as const;

const CLAIM_UPDATE_INPUT = [
  'status',
  'rejectReason',
  'totalAmount',
  'receiptCount',
  'submittedAt',
  'decidedAt',
  'decidedById',
  'paidAt',
  'paidById',
] as const;

const RECEIPT_FIELDS = [
  'id',
  'claimId',
  'applicantId',
  'departmentId',
  'fileId',
  'filename',
  'ext',
  'mimeType',
  'size',
  'amount',
  'invoiceDate',
  'receiptType',
  'createdAt',
  'updatedAt',
] as const;

const RECEIPT_CREATE_INPUT = [
  'claimId',
  'fileId',
  'amount',
  'invoiceDate',
  'receiptType',
] as const;

const DEPARTMENT_FIELDS = [
  'id',
  'name',
  'managerId',
  'createdAt',
  'updatedAt',
] as const;

const DEPARTMENTS = ['研发部', '销售部', '财务部', '行政部'] as const;

const EXAMPLE_CLAIMS = [
  {
    number: 'BX-EXAMPLE-001',
    type: 'travel',
    department: '研发部',
    reason: '示例：北京出差高铁票与住宿',
    appliedAt: '2026-09-01',
  },
  {
    number: 'BX-EXAMPLE-002',
    type: 'office',
    department: '销售部',
    reason: '示例：办公耗材采购',
    appliedAt: '2026-09-02',
  },
  {
    number: 'BX-EXAMPLE-003',
    type: 'hospitality',
    department: '行政部',
    reason: '示例：客户来访餐费',
    appliedAt: '2026-09-03',
  },
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609140002_seed_expense_roles_and_departments',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('authorization_permission_sets'))) {
      return;
    }

    await seedDepartments(query);
    await seedPermissionSets(query);
    await seedExampleClaims(query);
  },
});

async function seedDepartments(query: SeedQuery): Promise<void> {
  const now = new Date();
  for (const name of DEPARTMENTS) {
    const existing = await query
      .selectFrom('expenseDepartments')
      .select('id')
      .where('name', '=', name)
      .executeTakeFirst();
    if (existing) continue;
    await query
      .insertInto('expenseDepartments')
      .values({ name, createdAt: now, updatedAt: now })
      .execute();
  }
}

async function seedPermissionSets(query: SeedQuery): Promise<void> {
  await upsertPermissionSet(query, {
    key: APPLICANT_ROLE,
    title: '报销人 (Applicant)',
    grants: applicantGrants(),
  });
  await upsertPermissionSet(query, {
    key: MANAGER_ROLE,
    title: '部门主管 (Department manager)',
    grants: managerGrants(),
  });
  await upsertPermissionSet(query, {
    key: FINANCE_ROLE,
    title: '财务 (Finance)',
    grants: financeGrants(),
  });

  // Every signed-in user is an applicant by default, so a self-registered account can use the system right away.
  await ensureAssignment(query, 'authenticated', '*', APPLICANT_ROLE);

  const administrator = await query
    .selectFrom('authorizationPermissionSets')
    .select(['key', 'grants'])
    .where('key', '=', SYSTEM_ADMINISTRATOR)
    .executeTakeFirst();
  if (administrator) {
    const grants = parseGrants(administrator.grants);
    const next = mergeGrants(grants, administratorGrants());
    if (next !== grants) {
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify(next), updatedAt: new Date() })
        .where('key', '=', SYSTEM_ADMINISTRATOR)
        .execute();
    }
  }
}

async function upsertPermissionSet(
  query: SeedQuery,
  input: { key: string; title: string; grants: PermissionGrantRecord[] },
): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select('key')
    .where('key', '=', input.key)
    .executeTakeFirst();
  // Create only. A re-run leaves an administrator's edits alone.
  if (existing) return;
  const now = new Date();
  await query
    .insertInto('authorizationPermissionSets')
    .values({
      id: crypto.randomUUID(),
      key: input.key,
      title: input.title,
      grants: JSON.stringify(input.grants),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function ensureAssignment(
  query: SeedQuery,
  subjectType: string,
  subjectId: string,
  permissionSet: string,
): Promise<void> {
  const id = `${subjectType}:${subjectId}:${permissionSet}`;
  const existing = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('id', '=', id)
    .executeTakeFirst();
  if (existing) return;
  const now = new Date();
  await query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id,
      subjectType,
      subjectId,
      permissionSetKey: permissionSet,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

function applicantGrants(): PermissionGrantRecord[] {
  return [
    pageGrant(),
    databaseGrant('expenseClaims', {
      read: { output: [...CLAIM_FIELDS], recordAccess: ['recordsIOwn'] },
      create: {
        input: [...CLAIM_CREATE_INPUT],
        output: ['id', 'number', ...CLAIM_FIELDS],
      },
      update: {
        input: [...CLAIM_UPDATE_INPUT],
        output: [...CLAIM_FIELDS],
        recordAccess: ['recordsIOwn'],
      },
      delete: { recordAccess: ['recordsIOwn'] },
    }),
    databaseGrant('expenseReceipts', {
      read: { output: [...RECEIPT_FIELDS], recordAccess: ['recordsIOwn'] },
      create: {
        input: [...RECEIPT_CREATE_INPUT],
        output: [...RECEIPT_FIELDS],
      },
      delete: { recordAccess: ['recordsIOwn'] },
    }),
    databaseGrant('expenseDepartments', {
      read: { output: [...DEPARTMENT_FIELDS], recordAccess: ['allRecords'] },
    }),
    operationGrant(['submit']),
  ];
}

function managerGrants(): PermissionGrantRecord[] {
  return [
    pageGrant(),
    // Page-id grants back the client's `useCan` checks that decide which action buttons to show.
    pageGrant('expense-approve'),
    databaseGrant('expenseClaims', {
      read: {
        output: [...CLAIM_FIELDS],
        recordAccess: ['expenseDepartment'],
      },
      update: {
        input: [...CLAIM_UPDATE_INPUT],
        output: [...CLAIM_FIELDS],
        recordAccess: ['expenseDepartment'],
      },
    }),
    databaseGrant('expenseReceipts', {
      read: {
        output: [...RECEIPT_FIELDS],
        recordAccess: ['expenseDepartment'],
      },
    }),
    databaseGrant('expenseDepartments', {
      read: { output: [...DEPARTMENT_FIELDS], recordAccess: ['allRecords'] },
    }),
    operationGrant(['approve', 'reject']),
  ];
}

function financeGrants(): PermissionGrantRecord[] {
  return [
    pageGrant(),
    pageGrant('expense-pay'),
    databaseGrant('expenseClaims', {
      read: { output: [...CLAIM_FIELDS], recordAccess: ['allRecords'] },
      update: {
        input: [...CLAIM_UPDATE_INPUT],
        output: [...CLAIM_FIELDS],
        recordAccess: ['allRecords'],
      },
    }),
    databaseGrant('expenseReceipts', {
      read: { output: [...RECEIPT_FIELDS], recordAccess: ['allRecords'] },
    }),
    databaseGrant('expenseDepartments', {
      read: { output: [...DEPARTMENT_FIELDS], recordAccess: ['allRecords'] },
    }),
    operationGrant(['pay']),
  ];
}

function administratorGrants(): PermissionGrantRecord[] {
  return [
    databaseGrant('expenseClaims', {
      read: { output: [...CLAIM_FIELDS], recordAccess: ['allRecords'] },
      create: {
        input: [...CLAIM_CREATE_INPUT],
        output: ['id', 'number', ...CLAIM_FIELDS],
      },
      update: {
        input: [...CLAIM_UPDATE_INPUT],
        output: [...CLAIM_FIELDS],
        recordAccess: ['allRecords'],
      },
      delete: { recordAccess: ['allRecords'] },
    }),
    databaseGrant('expenseReceipts', {
      read: { output: [...RECEIPT_FIELDS], recordAccess: ['allRecords'] },
      create: {
        input: [...RECEIPT_CREATE_INPUT],
        output: [...RECEIPT_FIELDS],
      },
      delete: { recordAccess: ['allRecords'] },
    }),
    databaseGrant('expenseDepartments', {
      read: { output: [...DEPARTMENT_FIELDS], recordAccess: ['allRecords'] },
      create: { input: ['name', 'managerId'], output: [...DEPARTMENT_FIELDS] },
      update: {
        input: ['name', 'managerId'],
        output: [...DEPARTMENT_FIELDS],
        recordAccess: ['allRecords'],
      },
      delete: { recordAccess: ['allRecords'] },
    }),
    operationGrant(['submit', 'approve', 'reject', 'pay', 'cancel']),
  ];
}

function pageGrant(id = 'expense-app'): PermissionGrantRecord {
  return {
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  };
}

function operationGrant(actions: readonly string[]): PermissionGrantRecord {
  return {
    resource: { type: 'expense.operation', id: '*' },
    actions: actions.map((action) => ({ action })),
  };
}

function databaseGrant(
  collection: string,
  definition: Readonly<
    Record<
      string,
      {
        input?: readonly string[];
        output?: readonly string[];
        recordAccess?: readonly string[];
      }
    >
  >,
): PermissionGrantRecord {
  return {
    resource: { type: 'database.collection', id: `main.${collection}` },
    actions: Object.entries(definition).map(([action, grant]) => ({
      action,
      policy: {
        type: 'database',
        ...(grant.input || grant.output
          ? {
              fields: {
                ...(grant.input ? { input: [...grant.input] } : {}),
                ...(grant.output ? { output: [...grant.output] } : {}),
              },
            }
          : {}),
        ...(grant.recordAccess
          ? { recordAccess: [...grant.recordAccess] }
          : {}),
      },
    })),
  };
}

async function seedExampleClaims(query: SeedQuery): Promise<void> {
  const administrator = await query
    .selectFrom('user')
    .select(['id', 'name', 'username'])
    .where('username', '=', 'nocobase')
    .limit(1)
    .executeTakeFirst();
  if (!administrator) return;

  const now = new Date();
  const applicantId = String(administrator.id);
  const applicantName =
    typeof administrator.name === 'string' && administrator.name.trim()
      ? administrator.name
      : 'System administrator';

  for (const example of EXAMPLE_CLAIMS) {
    const existing = await query
      .selectFrom('expenseClaims')
      .select('id')
      .where('number', '=', example.number)
      .executeTakeFirst();
    if (existing) continue;
    const department = await query
      .selectFrom('expenseDepartments')
      .select('id')
      .where('name', '=', example.department)
      .executeTakeFirst();
    if (!department) continue;
    await query
      .insertInto('expenseClaims')
      .values({
        number: example.number,
        applicantId,
        applicantName,
        departmentId: Number(department.id),
        departmentName: example.department,
        type: example.type,
        reason: example.reason,
        appliedAt: new Date(`${example.appliedAt}T00:00:00.000Z`),
        status: 'draft',
        totalAmount: 0,
        receiptCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }
}

function mergeGrants(
  grants: readonly PermissionGrantRecord[],
  additions: readonly PermissionGrantRecord[],
): readonly PermissionGrantRecord[] {
  const result = [...grants];
  let changed = false;
  for (const addition of additions) {
    const index = result.findIndex(
      (grant) =>
        grant.resource.type === addition.resource.type &&
        grant.resource.id === addition.resource.id,
    );
    if (index === -1) {
      result.push(addition);
      changed = true;
      continue;
    }
    const existingActions = new Set(
      result[index].actions.map(({ action }) => action),
    );
    const missing = addition.actions.filter(
      ({ action }) => !existingActions.has(action),
    );
    if (missing.length === 0) continue;
    result[index] = {
      ...result[index],
      actions: [...result[index].actions, ...missing],
    };
    changed = true;
  }
  return changed ? result : grants;
}

function parseGrants(value: unknown): readonly PermissionGrantRecord[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || !parsed.every(isPermissionGrantRecord)) {
    throw new Error(
      'System administrator grants must be a valid permission grant array.',
    );
  }
  return parsed;
}

function isPermissionGrantRecord(
  value: unknown,
): value is PermissionGrantRecord {
  if (!isRecord(value) || !isRecord(value.resource)) return false;
  if (
    typeof value.resource.type !== 'string' ||
    typeof value.resource.id !== 'string' ||
    !Array.isArray(value.actions)
  ) {
    return false;
  }
  return value.actions.every(
    (action) => isRecord(action) && typeof action.action === 'string',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface PermissionGrantRecord {
  readonly resource: {
    readonly type: string;
    readonly id: string;
  };
  readonly actions: readonly {
    readonly action: string;
    readonly policy?: unknown;
  }[];
}

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
