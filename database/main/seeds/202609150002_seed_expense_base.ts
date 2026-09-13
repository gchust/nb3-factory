import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Required base data for the expense system, plus a small amount of sample data so the lists and statistics are not
 * empty on a fresh installation.
 *
 * The seed is idempotent: permission sets and departments are matched by their stable key/name, the sample claims by
 * their unique claim number, and the sample loan by borrower + date + purpose. Re-running it never duplicates rows and
 * never overwrites data a user has edited.
 */
const ADMIN_USERNAME = 'nocobase';
const FINANCE_ROLE = 'expense-finance';
const MANAGER_ROLE = 'expense-manager';
const EMPLOYEE_ROLE = 'expense-employee';
const DEFAULT_PAGES = 'default-pages';

const BASE_PAGES = [
  'expense-claims',
  'expense-claim-new',
  'expense-claim-detail',
  'expense-claim-edit',
  'expense-loans',
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609150002_seed_expense_base',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    const admin = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', ADMIN_USERNAME)
      .executeTakeFirst();

    if (await client.schema.hasTable('authorization_permission_sets')) {
      await syncPermissions();
    }

    if (await client.schema.hasTable('departments')) {
      const departments = await ensureDepartments();
      if (admin) {
        await ensureAdminMembership(String(admin.id), departments.get('FIN'));
      }
    }

    if (await client.schema.hasTable('loans')) {
      await ensureSampleLoan();
    }

    if (await client.schema.hasTable('expense_claims')) {
      await ensureSampleClaims();
    }

    async function syncPermissions(): Promise<void> {
      await upsertPermissionSet(DEFAULT_PAGES, 'Default pages', [
        {
          resource: { type: 'page', id: 'home' },
          actions: [{ action: 'access' }],
        },
        ...BASE_PAGES.map((id) => ({
          resource: { type: 'page', id },
          actions: [{ action: 'access' }],
        })),
      ]);
      await upsertPermissionSet(
        EMPLOYEE_ROLE,
        'Employee',
        pageGrants(BASE_PAGES),
      );
      await upsertPermissionSet(
        MANAGER_ROLE,
        'Department manager',
        pageGrants([...BASE_PAGES, 'expense-approvals']),
      );
      await upsertPermissionSet(
        FINANCE_ROLE,
        'Finance',
        pageGrants([...BASE_PAGES, 'expense-payments', 'expense-stats']),
      );
    }

    async function upsertPermissionSet(
      key: string,
      title: string,
      grants: readonly PermissionGrantRecord[],
    ): Promise<void> {
      const now = new Date();
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', key)
        .executeTakeFirst();
      if (existing) {
        await query
          .updateTable('authorizationPermissionSets')
          .set({ title, grants: JSON.stringify(grants), updatedAt: now })
          .where('key', '=', key)
          .execute();
        return;
      }
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key,
          title,
          grants: JSON.stringify(grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    async function ensureDepartments(): Promise<ReadonlyMap<string, number>> {
      const definitions = [
        { name: '财务部', code: 'FIN' },
        { name: '技术部', code: 'ENG' },
        { name: '市场部', code: 'MKT' },
        { name: '行政部', code: 'ADM' },
      ];
      const result = new Map<string, number>();
      for (const definition of definitions) {
        const existing = await query
          .selectFrom('departments')
          .select('id')
          .where('name', '=', definition.name)
          .executeTakeFirst();
        if (existing) {
          result.set(definition.code, Number(existing.id));
          continue;
        }
        const now = new Date();
        const inserted = await query
          .insertInto('departments')
          .values({
            name: definition.name,
            code: definition.code,
            managerId: null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        result.set(definition.code, Number(inserted.insertId));
      }
      return result;
    }

    async function ensureAdminMembership(
      userId: string,
      departmentId: number | undefined,
    ): Promise<void> {
      if (departmentId === undefined) return;
      const now = new Date();
      await query
        .updateTable('departments')
        .set({ managerId: userId, updatedAt: now })
        .where('id', '=', departmentId)
        .execute();
      const membership = await query
        .selectFrom('departmentMembers')
        .select('id')
        .where('userId', '=', userId)
        .executeTakeFirst();
      if (!membership) {
        await query
          .insertInto('departmentMembers')
          .values({
            departmentId,
            userId,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }

    async function ensureSampleLoan(): Promise<void> {
      if (!admin) return;
      const existing = await query
        .selectFrom('loans')
        .select('id')
        .where('borrowerId', '=', admin.id)
        .where('loanDate', '=', '2026-09-01')
        .where('purpose', '=', '出差预借')
        .executeTakeFirst();
      if (existing) return;
      const now = new Date();
      await query
        .insertInto('loans')
        .values({
          borrowerId: admin.id,
          amountCents: 500000,
          loanDate: '2026-09-01',
          purpose: '出差预借',
          settled: false,
          settledByClaimId: null,
          settledAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    async function ensureSampleClaims(): Promise<void> {
      if (!admin) return;
      const department = await query
        .selectFrom('departments')
        .select('id')
        .where('name', '=', '技术部')
        .executeTakeFirst();
      const departmentId = department ? Number(department.id) : null;
      await insertClaimIfMissing({
        number: 'BX-20260901-0001',
        applicantId: String(admin.id),
        departmentId,
        reason: '客户拜访差旅',
        expenseDate: '2026-09-01',
        status: 'pending',
        totalCents: 150000,
        rejectReason: null,
        paymentDate: null,
        items: [
          { category: 'travel', amountCents: 120000, remark: '往返机票' },
          { category: 'meal', amountCents: 30000, remark: '工作餐' },
        ],
      });
      await insertClaimIfMissing({
        number: 'BX-20260905-0001',
        applicantId: String(admin.id),
        departmentId,
        reason: '办公用品采购',
        expenseDate: '2026-09-05',
        status: 'paid',
        totalCents: 95000,
        rejectReason: null,
        paymentDate: '2026-09-08',
        items: [
          { category: 'office', amountCents: 80000, remark: '打印纸与耗材' },
          { category: 'transport', amountCents: 15000, remark: '市内打车' },
        ],
      });
    }

    async function insertClaimIfMissing(input: SampleClaim): Promise<void> {
      const existing = await query
        .selectFrom('expenseClaims')
        .select('id')
        .where('number', '=', input.number)
        .executeTakeFirst();
      if (existing) return;
      const now = new Date();
      const inserted = await query
        .insertInto('expenseClaims')
        .values({
          number: input.number,
          applicantId: input.applicantId,
          departmentId: input.departmentId,
          reason: input.reason,
          expenseDate: input.expenseDate,
          totalCents: input.totalCents,
          status: input.status,
          rejectReason: input.rejectReason,
          paymentDate: input.paymentDate,
          loanId: null,
          createdById: input.applicantId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const claimId = Number(inserted.insertId);
      await query
        .insertInto('expenseItems')
        .values(
          input.items.map((item) => ({
            claimId,
            category: item.category,
            amountCents: item.amountCents,
            remark: item.remark,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .execute();
    }
  },
});

function pageGrants(ids: readonly string[]): readonly PermissionGrantRecord[] {
  return ids.map((id) => ({
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  }));
}

interface SampleClaim {
  readonly number: string;
  readonly applicantId: string;
  readonly departmentId: number | null;
  readonly reason: string;
  readonly expenseDate: string;
  readonly status: string;
  readonly totalCents: number;
  readonly rejectReason: string | null;
  readonly paymentDate: string | null;
  readonly items: readonly {
    readonly category: string;
    readonly amountCents: number;
    readonly remark: string | null;
  }[];
}

interface PermissionGrantRecord {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly { readonly action: string }[];
}

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
