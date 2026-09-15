import type {
  DatabaseAuthorizationConditions,
  DatabaseFilter,
  DatabaseFilterOperator,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type ComparisonOperator,
  type DatabaseManager,
  type Expression,
  type ExpressionBuilder,
  type Row,
  type SqlBool,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** Collections owned by this application and registered with Authorization. */
export const CLAIM_COLLECTION = 'main.expenseClaims';
export const RECEIPT_COLLECTION = 'main.expenseReceipts';
export const DEPARTMENT_COLLECTION = 'main.expenseDepartments';

/** A receipt may be an image of an invoice or a PDF scan, and nothing else. */
export const RECEIPT_FILE_MAX_SIZE: number = 5 * 1024 * 1024;
export const RECEIPT_FILE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'pdf',
] as const;

export type ClaimStatus =
  'draft' | 'pending' | 'approved' | 'rejected' | 'paid';

export type ClaimType = 'travel' | 'hospitality' | 'office';

export const CLAIM_STATUSES: readonly ClaimStatus[] = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'paid',
];

export const CLAIM_TYPES: readonly ClaimType[] = [
  'travel',
  'hospitality',
  'office',
];

export type ReceiptType =
  'vat-invoice' | 'electronic-invoice' | 'receipt' | 'other';

export const RECEIPT_TYPES: readonly ReceiptType[] = [
  'vat-invoice',
  'electronic-invoice',
  'receipt',
  'other',
];

/**
 * Registered field lists. One definition shared by the Authorization registration and the routes keeps the
 * collections and the queries that request them from drifting apart.
 */
export const CLAIM_FIELDS = [
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

export const CLAIM_CREATE_FIELDS = [
  'departmentId',
  'type',
  'reason',
  'appliedAt',
] as const;

export const CLAIM_UPDATE_FIELDS = [
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

export const RECEIPT_FIELDS = [
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

export const RECEIPT_CREATE_FIELDS = [
  'claimId',
  'fileId',
  'amount',
  'invoiceDate',
  'receiptType',
] as const;

export const DEPARTMENT_FIELDS = [
  'id',
  'name',
  'managerId',
  'createdAt',
  'updatedAt',
] as const;

export interface ExpenseReceiptRecord {
  id: number;
  claimId: number;
  applicantId: string;
  departmentId: number;
  fileId: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  amount: number;
  invoiceDate: string;
  receiptType: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseClaimRecord {
  id: number;
  number: string;
  applicantId: string;
  applicantName: string;
  departmentId: number;
  departmentName: string;
  type: ClaimType;
  reason: string;
  appliedAt: string;
  status: ClaimStatus;
  totalAmount: number;
  receiptCount: number;
  rejectReason: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedById: string | null;
  paidAt: string | null;
  paidById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseDepartmentRecord {
  id: number;
  name: string;
  managerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseFileRecord {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseService {
  listClaims(conditions: DatabaseAuthorizationConditions): Promise<Row[]>;
  getClaim(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ExpenseClaimRecord | undefined>;
  createClaim(values: Row): Promise<number>;
  updateClaim(
    id: number,
    patch: Row,
    conditions: DatabaseAuthorizationConditions,
    expectedStatus?: ClaimStatus,
  ): Promise<number>;
  deleteClaim(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number>;
  listReceipts(conditions: DatabaseAuthorizationConditions): Promise<Row[]>;
  listReceiptsForClaim(
    claimId: number,
    conditions?: DatabaseAuthorizationConditions,
  ): Promise<ExpenseReceiptRecord[]>;
  deleteReceiptsForClaim(
    claimId: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number>;
  findReceiptByFileId(
    fileId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ExpenseReceiptRecord | undefined>;
  /** True when any receipt references the file, whether or not the caller may read that receipt. */
  isReceiptFileAttached(fileId: string): Promise<boolean>;
  findReceiptById(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ExpenseReceiptRecord | undefined>;
  createReceipt(values: Row): Promise<number>;
  deleteReceipt(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number>;
  recalculateClaim(claimId: number): Promise<{ count: number; total: number }>;
  statistics(conditions: DatabaseAuthorizationConditions): Promise<
    readonly {
      key: string;
      type: ClaimType | null;
      departmentName: string | null;
      claimCount: number;
      receiptCount: number;
      totalAmount: number;
    }[]
  >;
  getFileRecord(fileId: string): Promise<ExpenseFileRecord | undefined>;
  deleteFileRecord(fileId: string): Promise<void>;
  listDepartments(): Promise<ExpenseDepartmentRecord[]>;
  getDepartment(id: number): Promise<ExpenseDepartmentRecord | undefined>;
  insertDepartment(values: Row): Promise<number>;
  updateDepartment(
    id: number,
    patch: Row,
    conditions?: DatabaseAuthorizationConditions,
  ): Promise<number>;
  deleteDepartment(
    id: number,
    conditions?: DatabaseAuthorizationConditions,
  ): Promise<number>;
  findDepartmentByName(
    name: string,
  ): Promise<ExpenseDepartmentRecord | undefined>;
  listClaimNumbers(
    ids: readonly number[],
  ): Promise<readonly { id: number; number: string }[]>;
}

export const expenseServiceToken: ServiceToken<ExpenseService> =
  createServiceToken<ExpenseService>('app/expense-service');

const filterOperators: Readonly<
  Record<DatabaseFilterOperator, ComparisonOperator>
> = {
  $eq: '=',
  $ne: '!=',
  $in: 'in',
  $notIn: 'not in',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};

/**
 * Translates an Authorization filter AST into the query builder. Keeping it in one place means record-level
 * conditions are always applied by the database, never by filtering an over-broad result in memory.
 */
export function compileFilter(
  eb: ExpressionBuilder,
  filter: DatabaseFilter,
): Expression<SqlBool> {
  const expressions: Expression<SqlBool>[] = [];
  for (const [field, value] of Object.entries(filter)) {
    if (field === '$and' || field === '$or') {
      if (!Array.isArray(value)) {
        throw new TypeError(`${field} must be an array`);
      }
      const nested = (value as readonly DatabaseFilter[]).map((item) =>
        compileFilter(eb, item),
      );
      expressions.push(field === '$and' ? eb.and(nested) : eb.or(nested));
      continue;
    }
    if (!value || Array.isArray(value)) {
      throw new TypeError(`Invalid filter for ${field}`);
    }
    const comparisons = Object.entries(value).map(([operator, expected]) => {
      const comparison = filterOperators[operator as DatabaseFilterOperator];
      if (!comparison) {
        throw new TypeError(`Unknown filter operator: ${operator}`);
      }
      return eb(field, comparison, expected);
    });
    expressions.push(eb.and(comparisons));
  }
  return eb.and(expressions);
}

export function createExpenseService(
  database: DatabaseManager,
): ExpenseService {
  return {
    async listClaims(conditions) {
      return database
        .query()
        .selectFrom('expenseClaims')
        .selectAll()
        .where((eb) => compileFilter(eb, conditions.filter))
        .orderBy('createdAt', 'desc')
        .execute();
    },

    async getClaim(id, conditions) {
      const row = await database
        .query()
        .selectFrom('expenseClaims')
        .selectAll()
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, conditions.filter))
        .executeTakeFirst();
      return row ? (row as unknown as ExpenseClaimRecord) : undefined;
    },

    async createClaim(values) {
      const result = await database
        .query()
        .insertInto('expenseClaims')
        .values(values)
        .execute();
      return Number(result.insertId);
    },

    async updateClaim(id, patch, conditions, expectedStatus) {
      let query = database
        .query()
        .updateTable('expenseClaims')
        .set(patch)
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, conditions.filter));
      if (expectedStatus) {
        query = query.where('status', '=', expectedStatus);
      }
      const result = await query.execute();
      return result.updatedCount ?? 0;
    },

    async deleteClaim(id, conditions) {
      const result = await database
        .query()
        .deleteFrom('expenseClaims')
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, conditions.filter))
        .execute();
      return result.deletedCount ?? 0;
    },

    async listReceipts(conditions) {
      return database
        .query()
        .selectFrom('expenseReceipts')
        .selectAll()
        .where((eb) => compileFilter(eb, conditions.filter))
        .orderBy('createdAt', 'desc')
        .execute();
    },

    async listReceiptsForClaim(claimId, conditions) {
      let query = database
        .query()
        .selectFrom('expenseReceipts')
        .selectAll()
        .where('claimId', '=', claimId);
      if (conditions) {
        query = query.where((eb) => compileFilter(eb, conditions.filter));
      }
      const rows = await query.orderBy('id', 'asc').execute();
      return rows as unknown as ExpenseReceiptRecord[];
    },

    async deleteReceiptsForClaim(claimId, conditions) {
      const result = await database
        .query()
        .deleteFrom('expenseReceipts')
        .where('claimId', '=', claimId)
        .where((eb) => compileFilter(eb, conditions.filter))
        .execute();
      return result.deletedCount ?? 0;
    },

    async findReceiptByFileId(fileId, conditions) {
      const row = await database
        .query()
        .selectFrom('expenseReceipts')
        .selectAll()
        .where('fileId', '=', fileId)
        .where((eb) => compileFilter(eb, conditions.filter))
        .executeTakeFirst();
      return row ? (row as unknown as ExpenseReceiptRecord) : undefined;
    },

    async isReceiptFileAttached(fileId) {
      const row = await database
        .query()
        .selectFrom('expenseReceipts')
        .select('id')
        .where('fileId', '=', fileId)
        .executeTakeFirst();
      return row !== undefined;
    },

    async findReceiptById(id, conditions) {
      const row = await database
        .query()
        .selectFrom('expenseReceipts')
        .selectAll()
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, conditions.filter))
        .executeTakeFirst();
      return row ? (row as unknown as ExpenseReceiptRecord) : undefined;
    },

    async createReceipt(values) {
      const result = await database
        .query()
        .insertInto('expenseReceipts')
        .values(values)
        .execute();
      return Number(result.insertId);
    },

    async deleteReceipt(id, conditions) {
      const result = await database
        .query()
        .deleteFrom('expenseReceipts')
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, conditions.filter))
        .execute();
      return result.deletedCount ?? 0;
    },

    async recalculateClaim(claimId) {
      const rows = await database
        .query()
        .selectFrom('expenseReceipts')
        .select(['amount'])
        .where('claimId', '=', claimId)
        .execute();
      const total = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      return { count: rows.length, total: Math.round(total * 100) / 100 };
    },

    async statistics(conditions) {
      const rows = await database
        .query()
        .selectFrom('expenseClaims')
        .select([
          'departmentId',
          'departmentName',
          'type',
          'totalAmount',
          'receiptCount',
        ])
        .where((eb) => compileFilter(eb, conditions.filter))
        .execute();

      const byDepartment = new Map<
        number,
        {
          key: string;
          type: ClaimType | null;
          departmentName: string | null;
          claimCount: number;
          receiptCount: number;
          totalAmount: number;
        }
      >();
      const byType = new Map<
        string,
        {
          key: string;
          type: ClaimType | null;
          departmentName: string | null;
          claimCount: number;
          receiptCount: number;
          totalAmount: number;
        }
      >();

      for (const row of rows) {
        const amount = Number(row.totalAmount ?? 0);
        const receipts = Number(row.receiptCount ?? 0);
        const departmentKey = Number(row.departmentId);
        const department = byDepartment.get(departmentKey) ?? {
          key: `department:${departmentKey}`,
          type: null,
          departmentName: asText(row.departmentName),
          claimCount: 0,
          receiptCount: 0,
          totalAmount: 0,
        };
        department.claimCount += 1;
        department.receiptCount += receipts;
        department.totalAmount = round(department.totalAmount + amount);
        byDepartment.set(departmentKey, department);

        const typeKey = asText(row.type);
        const type = byType.get(typeKey) ?? {
          key: `type:${typeKey}`,
          type: (row.type as ClaimType) ?? null,
          departmentName: null,
          claimCount: 0,
          receiptCount: 0,
          totalAmount: 0,
        };
        type.claimCount += 1;
        type.receiptCount += receipts;
        type.totalAmount = round(type.totalAmount + amount);
        byType.set(typeKey, type);
      }

      return [...byDepartment.values(), ...byType.values()].sort(
        (left, right) => left.key.localeCompare(right.key),
      );
    },

    async getFileRecord(fileId) {
      const row = await database
        .query()
        .selectFrom('expenseReceiptFiles')
        .selectAll()
        .where('id', '=', fileId)
        .executeTakeFirst();
      return row ? (row as unknown as ExpenseFileRecord) : undefined;
    },

    async deleteFileRecord(fileId) {
      await database
        .query()
        .deleteFrom('expenseReceiptFiles')
        .where('id', '=', fileId)
        .execute();
    },

    async listDepartments() {
      const rows = await database
        .query()
        .selectFrom('expenseDepartments')
        .selectAll()
        .orderBy('id', 'asc')
        .execute();
      return rows as unknown as ExpenseDepartmentRecord[];
    },

    async getDepartment(id) {
      const row = await database
        .query()
        .selectFrom('expenseDepartments')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      return row ? (row as unknown as ExpenseDepartmentRecord) : undefined;
    },

    async insertDepartment(values) {
      const result = await database
        .query()
        .insertInto('expenseDepartments')
        .values(values)
        .execute();
      return Number(result.insertId);
    },

    async updateDepartment(id, patch, conditions) {
      let query = database
        .query()
        .updateTable('expenseDepartments')
        .set(patch)
        .where('id', '=', id);
      if (conditions) {
        query = query.where((eb) => compileFilter(eb, conditions.filter));
      }
      const result = await query.execute();
      return result.updatedCount ?? 0;
    },

    async deleteDepartment(id, conditions) {
      let query = database
        .query()
        .deleteFrom('expenseDepartments')
        .where('id', '=', id);
      if (conditions) {
        query = query.where((eb) => compileFilter(eb, conditions.filter));
      }
      const result = await query.execute();
      return result.deletedCount ?? 0;
    },

    async findDepartmentByName(name) {
      const row = await database
        .query()
        .selectFrom('expenseDepartments')
        .selectAll()
        .where('name', '=', name)
        .executeTakeFirst();
      return row ? (row as unknown as ExpenseDepartmentRecord) : undefined;
    },

    async listClaimNumbers(ids) {
      if (ids.length === 0) return [];
      const rows = await database
        .query()
        .selectFrom('expenseClaims')
        .select(['id', 'number'])
        .where('id', 'in', [...ids])
        .execute();
      return rows.map((row) => ({
        id: Number(row.id),
        number: String(row.number),
      }));
    },
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Coerces an untrusted query result to text without ever stringifying an object. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export default class ExpenseServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/expense-service-provider';

  public override register(): void {
    this.app.container.singleton(expenseServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createExpenseService(database);
    });
  }
}
