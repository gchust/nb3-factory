import { databaseManagerToken } from '@nocobase/db';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

/** A row of the `equipment` collection, as the Repository returns it. */
export interface EquipmentRow {
  id: number;
  assetCode: string;
  name: string;
  category: string | null;
  notes: string | null;
  createdAt: string;
}

/** A row of the `equipmentLoans` collection, as the Repository returns it. */
export interface EquipmentLoanRow {
  id: number;
  equipmentId: number;
  borrower: string;
  purpose: string | null;
  borrowedAt: string;
  expectedReturnAt: string;
  returnedAt: string | null;
  createdAt: string;
}

export type EquipmentStatus = 'available' | 'borrowed' | 'overdue';
export type LoanStatus = 'borrowed' | 'returned' | 'overdue';

export interface ActiveLoanSummary {
  id: number;
  borrower: string;
  borrowedAt: string;
  expectedReturnAt: string;
  isOverdue: boolean;
}

export interface EquipmentView {
  id: number;
  assetCode: string;
  name: string;
  category: string | null;
  notes: string | null;
  status: EquipmentStatus;
  activeLoan: ActiveLoanSummary | null;
  createdAt: string;
}

export interface BorrowRecordEquipmentView {
  id: number;
  assetCode: string;
  name: string;
  category: string | null;
}

export interface BorrowRecordView {
  id: number;
  equipmentId: number;
  equipment: BorrowRecordEquipmentView | null;
  borrower: string;
  purpose: string | null;
  borrowedAt: string;
  expectedReturnAt: string;
  returnedAt: string | null;
  status: LoanStatus;
  createdAt: string;
}

export interface CreateEquipmentInput {
  assetCode: string;
  name: string;
  category?: string | null;
  notes?: string | null;
}

export interface UpdateEquipmentInput {
  assetCode: string;
  name: string;
  category?: string | null;
  notes?: string | null;
}

export interface BorrowEquipmentInput {
  equipmentId: number;
  borrower: string;
  purpose?: string | null;
  expectedReturnAt: Date;
}

export type EquipmentErrorCode =
  | 'VALIDATION_ERROR'
  | 'ASSET_CODE_TAKEN'
  | 'EQUIPMENT_NOT_FOUND'
  | 'LOAN_NOT_FOUND'
  | 'EQUIPMENT_UNAVAILABLE';

/**
 * A business failure the caller can act on. The route layer maps `code` to an
 * HTTP status and the browser maps it to a translated message, so the message
 * itself is diagnostic text rather than something a user is expected to read.
 */
export class EquipmentError extends Error {
  constructor(
    public readonly code: EquipmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EquipmentError';
  }
}

export interface EquipmentService {
  listEquipment(): Promise<EquipmentView[]>;
  getEquipment(id: number): Promise<EquipmentView>;
  createEquipment(input: CreateEquipmentInput): Promise<EquipmentView>;
  updateEquipment(
    id: number,
    input: UpdateEquipmentInput,
  ): Promise<EquipmentView>;
  listLoans(): Promise<BorrowRecordView[]>;
  borrow(input: BorrowEquipmentInput): Promise<BorrowRecordView>;
  /** Records the return of one loan. Calling it again returns the same record. */
  returnLoan(id: number): Promise<BorrowRecordView>;
}

export const equipmentServiceToken = createServiceToken<EquipmentService>(
  'nb3-factory/equipment',
);

const LIMITS = {
  assetCode: 64,
  name: 255,
  category: 128,
  notes: 2000,
  borrower: 255,
  purpose: 2000,
} as const;

/** Upper bound for the small, unpaginated lists this application serves. */
const LIST_LIMIT = 1000;

function requiredText(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new EquipmentError('VALIDATION_ERROR', `${label} is required.`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new EquipmentError(
      'VALIDATION_ERROR',
      `${label} must be at most ${maxLength} characters.`,
    );
  }
  return text;
}

function optionalText(
  value: unknown,
  label: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new EquipmentError('VALIDATION_ERROR', `${label} must be text.`);
  }
  const text = value.trim();
  if (text.length === 0) {
    return null;
  }
  if (text.length > maxLength) {
    throw new EquipmentError(
      'VALIDATION_ERROR',
      `${label} must be at most ${maxLength} characters.`,
    );
  }
  return text;
}

function requiredPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new EquipmentError(
      'VALIDATION_ERROR',
      `${label} must be a positive integer.`,
    );
  }
  return value;
}

function requiredDate(value: unknown, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new EquipmentError(
      'VALIDATION_ERROR',
      `${label} must be a valid date.`,
    );
  }
  return value;
}

interface EquipmentServiceDependencies {
  readonly database: DatabaseManager;
}

export function createEquipmentService({
  database,
}: EquipmentServiceDependencies): EquipmentService {
  function equipmentRepository(connection?: DatabaseConnection) {
    return (connection ?? database).repository<EquipmentRow>('equipment');
  }

  function loanRepository(connection?: DatabaseConnection) {
    return (connection ?? database).repository<EquipmentLoanRow>(
      'equipmentLoans',
    );
  }

  function isOverdue(row: EquipmentLoanRow, now: number): boolean {
    return row.returnedAt === null && Date.parse(row.expectedReturnAt) < now;
  }

  function loanStatus(row: EquipmentLoanRow, now: number): LoanStatus {
    if (row.returnedAt !== null) {
      return 'returned';
    }
    return Date.parse(row.expectedReturnAt) < now ? 'overdue' : 'borrowed';
  }

  function toEquipmentView(
    row: EquipmentRow,
    activeLoan: EquipmentLoanRow | undefined,
    now: number,
  ): EquipmentView {
    if (!activeLoan) {
      return {
        id: row.id,
        assetCode: row.assetCode,
        name: row.name,
        category: row.category,
        notes: row.notes,
        status: 'available',
        activeLoan: null,
        createdAt: row.createdAt,
      };
    }
    const overdue = isOverdue(activeLoan, now);
    return {
      id: row.id,
      assetCode: row.assetCode,
      name: row.name,
      category: row.category,
      notes: row.notes,
      status: overdue ? 'overdue' : 'borrowed',
      activeLoan: {
        id: activeLoan.id,
        borrower: activeLoan.borrower,
        borrowedAt: activeLoan.borrowedAt,
        expectedReturnAt: activeLoan.expectedReturnAt,
        isOverdue: overdue,
      },
      createdAt: row.createdAt,
    };
  }

  function toBorrowRecordView(
    row: EquipmentLoanRow,
    equipment: EquipmentRow | undefined,
    now: number,
  ): BorrowRecordView {
    return {
      id: row.id,
      equipmentId: row.equipmentId,
      equipment: equipment
        ? {
            id: equipment.id,
            assetCode: equipment.assetCode,
            name: equipment.name,
            category: equipment.category,
          }
        : null,
      borrower: row.borrower,
      purpose: row.purpose,
      borrowedAt: row.borrowedAt,
      expectedReturnAt: row.expectedReturnAt,
      returnedAt: row.returnedAt,
      status: loanStatus(row, now),
      createdAt: row.createdAt,
    };
  }

  async function loadEquipmentById(
    connection?: DatabaseConnection,
  ): Promise<Map<number, EquipmentRow>> {
    const rows = await equipmentRepository(connection).findMany({
      limit: LIST_LIMIT,
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  async function loadActiveLoans(
    connection?: DatabaseConnection,
  ): Promise<Map<number, EquipmentLoanRow>> {
    const rows = await loanRepository(connection).findMany({
      filter: (filter) => filter.date('returnedAt').empty(),
      limit: LIST_LIMIT,
    });
    return new Map(rows.map((row) => [row.equipmentId, row]));
  }

  async function findEquipmentOrThrow(
    connection: DatabaseConnection | undefined,
    id: number,
  ): Promise<EquipmentRow> {
    const row = await equipmentRepository(connection).findOne({
      filter: { id },
    });
    if (!row) {
      throw new EquipmentError('EQUIPMENT_NOT_FOUND', 'Equipment not found.');
    }
    return row;
  }

  function normalizedEquipmentInput(
    input: CreateEquipmentInput | UpdateEquipmentInput,
  ) {
    return {
      assetCode: requiredText(input.assetCode, 'Asset code', LIMITS.assetCode),
      name: requiredText(input.name, 'Equipment name', LIMITS.name),
      category: optionalText(input.category, 'Category', LIMITS.category),
      notes: optionalText(input.notes, 'Notes', LIMITS.notes),
    };
  }

  return {
    async listEquipment() {
      const equipment = await equipmentRepository().findMany({
        sort: (sort) => sort.field('assetCode').asc(),
        limit: LIST_LIMIT,
      });
      const activeLoans = await loadActiveLoans();
      const now = Date.now();
      return equipment.map((row) =>
        toEquipmentView(row, activeLoans.get(row.id), now),
      );
    },

    async getEquipment(id) {
      const row = await findEquipmentOrThrow(undefined, id);
      const activeLoans = await loadActiveLoans();
      return toEquipmentView(row, activeLoans.get(id), Date.now());
    },

    async createEquipment(input) {
      const values = normalizedEquipmentInput(input);
      return database.transaction(async (connection) => {
        const repository = equipmentRepository(connection);
        const duplicate = await repository.findOne({
          filter: { assetCode: values.assetCode },
        });
        if (duplicate) {
          throw new EquipmentError(
            'ASSET_CODE_TAKEN',
            'An equipment with this asset code already exists.',
          );
        }
        const created = await repository.createOne({
          values: { ...values, createdAt: new Date().toISOString() },
        });
        return toEquipmentView(created.record, undefined, Date.now());
      });
    },

    async updateEquipment(id, input) {
      const values = normalizedEquipmentInput(input);
      return database.transaction(async (connection) => {
        const repository = equipmentRepository(connection);
        await findEquipmentOrThrow(connection, id);
        const duplicate = await repository.findOne({
          filter: { assetCode: values.assetCode },
        });
        if (duplicate && duplicate.id !== id) {
          throw new EquipmentError(
            'ASSET_CODE_TAKEN',
            'An equipment with this asset code already exists.',
          );
        }
        await repository.updateOne({
          filter: { id },
          values,
        });
        const refreshed = await findEquipmentOrThrow(connection, id);
        const activeLoans = await loadActiveLoans(connection);
        return toEquipmentView(refreshed, activeLoans.get(id), Date.now());
      });
    },

    async listLoans() {
      const loans = await loanRepository().findMany({
        sort: (sort) => sort.field('borrowedAt').desc(),
        limit: LIST_LIMIT,
      });
      const equipmentById = await loadEquipmentById();
      const now = Date.now();
      return loans.map((row) =>
        toBorrowRecordView(row, equipmentById.get(row.equipmentId), now),
      );
    },

    async borrow(input) {
      const equipmentId = requiredPositiveInteger(
        input.equipmentId,
        'Equipment',
      );
      const borrower = requiredText(
        input.borrower,
        'Borrower',
        LIMITS.borrower,
      );
      const purpose = optionalText(input.purpose, 'Purpose', LIMITS.purpose);
      const expectedReturnAt = requiredDate(
        input.expectedReturnAt,
        'Expected return date',
      );
      const borrowedAt = new Date();

      if (expectedReturnAt.getTime() < borrowedAt.getTime()) {
        throw new EquipmentError(
          'VALIDATION_ERROR',
          'Expected return date cannot be before the borrow time.',
        );
      }

      return database.transaction(async (connection) => {
        const equipment = await findEquipmentOrThrow(connection, equipmentId);
        const activeCount = await loanRepository(connection).count({
          filter: (filter) =>
            filter.and([
              filter.number('equipmentId').eq(equipmentId),
              filter.date('returnedAt').empty(),
            ]),
        });
        if (activeCount > 0) {
          throw new EquipmentError(
            'EQUIPMENT_UNAVAILABLE',
            'This equipment is currently borrowed and cannot be borrowed again.',
          );
        }
        const created = await loanRepository(connection).createOne({
          values: {
            equipmentId,
            borrower,
            purpose,
            borrowedAt: borrowedAt.toISOString(),
            expectedReturnAt: expectedReturnAt.toISOString(),
            returnedAt: null,
            createdAt: borrowedAt.toISOString(),
          },
        });
        return toBorrowRecordView(created.record, equipment, Date.now());
      });
    },

    async returnLoan(id) {
      return database.transaction(async (connection) => {
        const repository = loanRepository(connection);
        await repository.updateMany({
          filter: (filter) =>
            filter.and([
              filter.number('id').eq(id),
              filter.date('returnedAt').empty(),
            ]),
          values: { returnedAt: new Date().toISOString() },
        });
        const row = await repository.findOne({ filter: { id } });
        if (!row) {
          throw new EquipmentError(
            'LOAN_NOT_FOUND',
            'Borrow record not found.',
          );
        }
        const equipment = await equipmentRepository(connection).findOne({
          filter: { id: row.equipmentId },
        });
        return toBorrowRecordView(row, equipment, Date.now());
      });
    },
  };
}

/** Registers the equipment service so routes can resolve it from the container. */
export class EquipmentProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nb3-factory/equipment';

  public register(): void {
    this.app.container.singleton(equipmentServiceToken, (resolver) =>
      createEquipmentService({
        database: resolver.resolve(databaseManagerToken),
      }),
    );
  }
}
