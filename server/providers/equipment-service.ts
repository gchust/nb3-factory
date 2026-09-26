import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import { databaseManagerToken } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

/**
 * Equipment borrowing domain service.
 *
 * The service owns the business rules — what is required, what is allowed, how
 * a borrow and a return change the ledger — and knows nothing about HTTP. The
 * route layer maps the errors below to status codes and localized copy.
 */

export type EquipmentErrorCode =
  | 'ASSET_NO_REQUIRED'
  | 'NAME_REQUIRED'
  | 'ASSET_NO_TAKEN'
  | 'BORROWER_REQUIRED'
  | 'EXPECTED_RETURN_REQUIRED'
  | 'NOT_AVAILABLE'
  | 'EQUIPMENT_NOT_FOUND'
  | 'LOAN_NOT_FOUND';

/** A business failure the route can translate; `message` is a server-side fallback, not user copy. */
export class EquipmentError extends Error {
  readonly code: EquipmentErrorCode;
  readonly field?: string;

  constructor(
    code: EquipmentErrorCode,
    message: string,
    options?: { readonly field?: string },
  ) {
    super(message);
    this.name = 'EquipmentError';
    this.code = code;
    this.field = options?.field;
  }
}

export type EquipmentStatus = 'available' | 'borrowed';
export type LoanStatus = 'active' | 'returned';

export interface EquipmentRecord {
  readonly id: number;
  readonly assetNo: string;
  readonly name: string;
  readonly category: string;
  readonly notes: string;
  readonly status: EquipmentStatus;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
}

export interface LoanRecord {
  readonly id: number;
  readonly equipmentId: number;
  readonly borrower: string;
  readonly purpose: string;
  readonly borrowedAt: string | Date;
  readonly expectedReturnAt: string | Date;
  readonly returnedAt: string | Date | null;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
}

export interface EquipmentView {
  readonly id: number;
  readonly assetNo: string;
  readonly name: string;
  readonly category: string;
  readonly notes: string;
  readonly status: EquipmentStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Borrower of the active loan, when the device is out. */
  readonly currentBorrower: string | null;
  /** Expected return of the active loan, ISO string, when the device is out. */
  readonly expectedReturnAt: string | null;
  readonly currentLoanId: number | null;
  readonly overdue: boolean;
}

export interface EquipmentStats {
  readonly total: number;
  readonly borrowed: number;
  readonly overdue: number;
}

export interface LoanView {
  readonly id: number;
  readonly equipmentId: number;
  readonly assetNo: string;
  readonly equipmentName: string;
  readonly borrower: string;
  readonly purpose: string;
  readonly borrowedAt: string;
  readonly expectedReturnAt: string;
  readonly returnedAt: string | null;
  readonly overdue: boolean;
}

export interface ListEquipmentQuery {
  readonly keyword?: string;
  readonly status?: EquipmentStatus;
}

export interface ListLoansQuery {
  readonly keyword?: string;
  readonly status?: LoanStatus;
}

export interface CreateEquipmentInput {
  readonly assetNo: string;
  readonly name: string;
  readonly category?: string;
  readonly notes?: string;
}

export interface UpdateEquipmentInput {
  readonly assetNo?: string;
  readonly name?: string;
  readonly category?: string;
  readonly notes?: string;
}

export interface BorrowInput {
  readonly borrower: string;
  readonly purpose?: string;
  /** ISO date string, or anything `new Date()` understands. */
  readonly expectedReturnAt: string;
}

export interface EquipmentService {
  listEquipment(
    query: ListEquipmentQuery,
  ): Promise<{ items: EquipmentView[]; stats: EquipmentStats }>;
  getEquipment(id: number): Promise<EquipmentView>;
  createEquipment(input: CreateEquipmentInput): Promise<EquipmentView>;
  updateEquipment(
    id: number,
    input: UpdateEquipmentInput,
  ): Promise<EquipmentView>;
  borrow(equipmentId: number, input: BorrowInput): Promise<LoanView>;
  returnLoan(loanId: number): Promise<LoanView>;
  listLoans(query: ListLoansQuery): Promise<LoanView[]>;
}

export const equipmentServiceToken = createServiceToken<EquipmentService>(
  'app/equipment-service',
);

function normalizeText(value: string | undefined | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toTimestamp(value: string | Date): number {
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

/** Whether a database error came from a unique constraint (SQLite or PostgreSQL). */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; message?: unknown };
  if (
    candidate.code === '23505' ||
    candidate.code === 'SQLITE_CONSTRAINT_UNIQUE'
  ) {
    return true;
  }
  return (
    typeof candidate.message === 'string' &&
    /unique constraint|UNIQUE constraint failed/i.test(candidate.message)
  );
}

function toEquipmentView(record: EquipmentRecord): EquipmentView {
  return {
    id: record.id,
    assetNo: record.assetNo,
    name: record.name,
    category: record.category,
    notes: record.notes,
    status: record.status,
    createdAt: toIso(record.createdAt) ?? '',
    updatedAt: toIso(record.updatedAt) ?? '',
    currentBorrower: null,
    expectedReturnAt: null,
    currentLoanId: null,
    overdue: false,
  };
}

function toLoanView(
  loan: LoanRecord,
  equipment: EquipmentRecord | undefined,
  now: Date,
): LoanView {
  const returnedAt = toIso(loan.returnedAt);
  const overdue =
    returnedAt === null && toTimestamp(loan.expectedReturnAt) < now.getTime();
  return {
    id: loan.id,
    equipmentId: loan.equipmentId,
    assetNo: equipment?.assetNo ?? '',
    equipmentName: equipment?.name ?? '',
    borrower: loan.borrower,
    purpose: loan.purpose,
    borrowedAt: toIso(loan.borrowedAt) ?? '',
    expectedReturnAt: toIso(loan.expectedReturnAt) ?? '',
    returnedAt,
    overdue,
  };
}

function attachActiveLoan(
  view: EquipmentView,
  loan: LoanRecord | undefined,
  now: Date,
): EquipmentView {
  if (!loan) {
    return view;
  }
  return {
    ...view,
    currentBorrower: loan.borrower,
    expectedReturnAt: toIso(loan.expectedReturnAt),
    currentLoanId: loan.id,
    overdue:
      loan.returnedAt === null &&
      toTimestamp(loan.expectedReturnAt) < now.getTime(),
  };
}

class DefaultEquipmentService implements EquipmentService {
  constructor(private readonly database: DatabaseManager) {}

  async listEquipment(
    query: ListEquipmentQuery,
  ): Promise<{ items: EquipmentView[]; stats: EquipmentStats }> {
    const equipmentRepository =
      this.database.repository<EquipmentRecord>('officeEquipment');
    const loanRepository =
      this.database.repository<LoanRecord>('equipmentLoans');
    const now = new Date();
    const keyword = normalizeText(query.keyword);

    const records = await equipmentRepository.findMany({
      filter: (filter) => {
        const conditions = [];
        if (keyword) {
          conditions.push(
            filter.or([
              filter
                .string('assetNo')
                .includes(keyword, { mode: 'insensitive' }),
              filter.string('name').includes(keyword, { mode: 'insensitive' }),
            ]),
          );
        }
        if (query.status) {
          conditions.push(filter.string('status').eq(query.status));
        }
        return conditions.length > 0 ? filter.and(conditions) : filter.and([]);
      },
      sort: (sort) => sort.field('assetNo').asc(),
    });

    const activeLoans = await loanRepository.findMany({
      filter: (filter) => filter.date('returnedAt').empty(),
    });
    const activeByEquipment = new Map<number, LoanRecord>();
    for (const loan of activeLoans) {
      activeByEquipment.set(loan.equipmentId, loan);
    }

    const items = records.map((record) =>
      attachActiveLoan(
        toEquipmentView(record),
        record.status === 'borrowed'
          ? activeByEquipment.get(record.id)
          : undefined,
        now,
      ),
    );

    const [total, borrowed, overdue] = await Promise.all([
      equipmentRepository.count(),
      equipmentRepository.count({
        filter: (filter) => filter.string('status').eq('borrowed'),
      }),
      loanRepository.count({
        filter: (filter) =>
          filter.and([
            filter.date('returnedAt').empty(),
            filter.date('expectedReturnAt').before(now),
          ]),
      }),
    ]);

    return { items, stats: { total, borrowed, overdue } };
  }

  async getEquipment(id: number): Promise<EquipmentView> {
    const record = await this.database
      .repository<EquipmentRecord>('officeEquipment')
      .findOne({ filter: { id } });
    if (!record) {
      throw new EquipmentError(
        'EQUIPMENT_NOT_FOUND',
        'The equipment does not exist',
      );
    }
    const activeLoan =
      record.status === 'borrowed'
        ? await this.database.repository<LoanRecord>('equipmentLoans').findOne({
            filter: (filter) =>
              filter.and([
                filter.number('equipmentId').eq(id),
                filter.date('returnedAt').empty(),
              ]),
          })
        : undefined;
    return attachActiveLoan(
      toEquipmentView(record),
      activeLoan ?? undefined,
      new Date(),
    );
  }

  async createEquipment(input: CreateEquipmentInput): Promise<EquipmentView> {
    const assetNo = normalizeText(input.assetNo);
    const name = normalizeText(input.name);
    if (!assetNo) {
      throw new EquipmentError(
        'ASSET_NO_REQUIRED',
        'Asset number is required',
        { field: 'assetNo' },
      );
    }
    if (!name) {
      throw new EquipmentError('NAME_REQUIRED', 'Equipment name is required', {
        field: 'name',
      });
    }

    const repository =
      this.database.repository<EquipmentRecord>('officeEquipment');
    const duplicate = await repository.findOne({ filter: { assetNo } });
    if (duplicate) {
      throw new EquipmentError(
        'ASSET_NO_TAKEN',
        'This asset number already exists',
        { field: 'assetNo' },
      );
    }

    const now = new Date();
    try {
      const created = await repository.createOne({
        values: {
          assetNo,
          name,
          category: normalizeText(input.category),
          notes: normalizeText(input.notes),
          status: 'available',
          createdAt: now,
          updatedAt: now,
        },
      });
      return toEquipmentView(created.record);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new EquipmentError(
          'ASSET_NO_TAKEN',
          'This asset number already exists',
          { field: 'assetNo' },
        );
      }
      throw error;
    }
  }

  async updateEquipment(
    id: number,
    input: UpdateEquipmentInput,
  ): Promise<EquipmentView> {
    const repository =
      this.database.repository<EquipmentRecord>('officeEquipment');
    const existing = await repository.findOne({ filter: { id } });
    if (!existing) {
      throw new EquipmentError(
        'EQUIPMENT_NOT_FOUND',
        'The equipment does not exist',
      );
    }

    const values: {
      assetNo?: string;
      name?: string;
      category?: string;
      notes?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (input.assetNo !== undefined) {
      const assetNo = normalizeText(input.assetNo);
      if (!assetNo) {
        throw new EquipmentError(
          'ASSET_NO_REQUIRED',
          'Asset number is required',
          { field: 'assetNo' },
        );
      }
      if (assetNo !== existing.assetNo) {
        const duplicate = await repository.findOne({ filter: { assetNo } });
        if (duplicate && duplicate.id !== id) {
          throw new EquipmentError(
            'ASSET_NO_TAKEN',
            'This asset number already exists',
            { field: 'assetNo' },
          );
        }
      }
      values.assetNo = assetNo;
    }

    if (input.name !== undefined) {
      const name = normalizeText(input.name);
      if (!name) {
        throw new EquipmentError(
          'NAME_REQUIRED',
          'Equipment name is required',
          { field: 'name' },
        );
      }
      values.name = name;
    }

    if (input.category !== undefined) {
      values.category = normalizeText(input.category);
    }
    if (input.notes !== undefined) {
      values.notes = normalizeText(input.notes);
    }

    try {
      await repository.updateOne({ filter: { id }, values });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new EquipmentError(
          'ASSET_NO_TAKEN',
          'This asset number already exists',
          { field: 'assetNo' },
        );
      }
      throw error;
    }

    const updated = await repository.findOne({ filter: { id } });
    if (!updated) {
      throw new EquipmentError(
        'EQUIPMENT_NOT_FOUND',
        'The equipment does not exist',
      );
    }
    const activeLoan = await this.database
      .repository<LoanRecord>('equipmentLoans')
      .findOne({
        filter: (filter) =>
          filter.and([
            filter.number('equipmentId').eq(id),
            filter.date('returnedAt').empty(),
          ]),
      });
    return attachActiveLoan(toEquipmentView(updated), activeLoan, new Date());
  }

  async borrow(equipmentId: number, input: BorrowInput): Promise<LoanView> {
    const borrower = normalizeText(input.borrower);
    if (!borrower) {
      throw new EquipmentError('BORROWER_REQUIRED', 'Borrower is required', {
        field: 'borrower',
      });
    }
    const expected = new Date(input.expectedReturnAt);
    if (!input.expectedReturnAt || Number.isNaN(expected.getTime())) {
      throw new EquipmentError(
        'EXPECTED_RETURN_REQUIRED',
        'Expected return date is required',
        { field: 'expectedReturnAt' },
      );
    }

    const now = new Date();
    return this.database.transaction(async (connection) => {
      const equipmentRepository =
        connection.repository<EquipmentRecord>('officeEquipment');
      const loanRepository =
        connection.repository<LoanRecord>('equipmentLoans');

      // Conditional update: only the request that finds the device available
      // wins, so two people cannot borrow the same device at the same moment.
      const claimed = await equipmentRepository.updateMany({
        filter: { id: equipmentId, status: 'available' },
        values: { status: 'borrowed', updatedAt: now },
      });
      if (claimed.updatedCount === 0) {
        const equipment = await equipmentRepository.findOne({
          filter: { id: equipmentId },
        });
        if (!equipment) {
          throw new EquipmentError(
            'EQUIPMENT_NOT_FOUND',
            'The equipment does not exist',
          );
        }
        throw new EquipmentError(
          'NOT_AVAILABLE',
          'The equipment is already borrowed',
        );
      }

      const created = await loanRepository.createOne({
        values: {
          equipmentId,
          borrower,
          purpose: normalizeText(input.purpose),
          borrowedAt: now,
          expectedReturnAt: expected,
          returnedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      });
      const equipment = await equipmentRepository.findOne({
        filter: { id: equipmentId },
      });
      return toLoanView(created.record, equipment, now);
    });
  }

  async returnLoan(loanId: number): Promise<LoanView> {
    const now = new Date();
    return this.database.transaction(async (connection) => {
      const equipmentRepository =
        connection.repository<EquipmentRecord>('officeEquipment');
      const loanRepository =
        connection.repository<LoanRecord>('equipmentLoans');

      const loan = await loanRepository.findOne({ filter: { id: loanId } });
      if (!loan) {
        throw new EquipmentError('LOAN_NOT_FOUND', 'The loan does not exist');
      }

      // Repeated returns are no-ops: the original record and its return time
      // are kept exactly as they are.
      if (loan.returnedAt !== null && loan.returnedAt !== undefined) {
        const equipment = await equipmentRepository.findOne({
          filter: { id: loan.equipmentId },
        });
        return toLoanView(loan, equipment, now);
      }

      const returned = await loanRepository.updateMany({
        filter: (filter) =>
          filter.and([
            filter.number('id').eq(loanId),
            filter.date('returnedAt').empty(),
          ]),
        values: { returnedAt: now, updatedAt: now },
      });

      if (returned.updatedCount > 0) {
        // The device becomes available again only when this was its active loan.
        await equipmentRepository.updateMany({
          filter: { id: loan.equipmentId, status: 'borrowed' },
          values: { status: 'available', updatedAt: now },
        });
      }

      const current = await loanRepository.findOne({ filter: { id: loanId } });
      if (!current) {
        throw new EquipmentError('LOAN_NOT_FOUND', 'The loan does not exist');
      }
      const equipment = await equipmentRepository.findOne({
        filter: { id: current.equipmentId },
      });
      return toLoanView(current, equipment, now);
    });
  }

  async listLoans(query: ListLoansQuery): Promise<LoanView[]> {
    const loanRepository =
      this.database.repository<LoanRecord>('equipmentLoans');
    const equipmentRepository =
      this.database.repository<EquipmentRecord>('officeEquipment');
    const now = new Date();
    const keyword = normalizeText(query.keyword);

    const loans = await loanRepository.findMany({
      filter: (filter) => {
        const conditions = [];
        if (keyword) {
          conditions.push(
            filter
              .string('borrower')
              .includes(keyword, { mode: 'insensitive' }),
          );
        }
        if (query.status === 'active') {
          conditions.push(filter.date('returnedAt').empty());
        } else if (query.status === 'returned') {
          conditions.push(filter.date('returnedAt').notEmpty());
        }
        return conditions.length > 0 ? filter.and(conditions) : filter.and([]);
      },
      sort: (sort) => sort.field('borrowedAt').desc(),
    });

    const equipmentIds = [...new Set(loans.map((loan) => loan.equipmentId))];
    const equipmentRecords =
      equipmentIds.length === 0
        ? []
        : await equipmentRepository.findMany({
            filter: (filter) =>
              filter.or(equipmentIds.map((id) => filter.number('id').eq(id))),
          });
    const equipmentById = new Map<number, EquipmentRecord>();
    for (const record of equipmentRecords) {
      equipmentById.set(record.id, record);
    }

    return loans.map((loan) =>
      toLoanView(loan, equipmentById.get(loan.equipmentId), now),
    );
  }
}

export function createEquipmentService(
  database: DatabaseManager,
): EquipmentService {
  return new DefaultEquipmentService(database);
}

export class EquipmentProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/equipment';

  public override register(): void {
    const database = this.app.container.resolve(databaseManagerToken);
    this.app.container.instance(
      equipmentServiceToken,
      createEquipmentService(database),
    );
  }
}

/** Exposed so the route layer can type the transaction connection without importing the manager. */
export type { DatabaseConnection };
