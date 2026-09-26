import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

export type EquipmentStatus = 'available' | 'borrowed';
export type LoanStatusFilter = 'all' | 'unreturned' | 'returned';
export type EquipmentStatusFilter = 'all' | EquipmentStatus;

export interface EquipmentRecord {
  id: number;
  assetNo: string;
  name: string;
  category: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentActiveLoan {
  id: number;
  borrower: string;
  dueAt: string;
  overdue: boolean;
}

export interface EquipmentItem extends EquipmentRecord {
  status: EquipmentStatus;
  activeLoan: EquipmentActiveLoan | null;
}

export interface EquipmentStats {
  total: number;
  borrowed: number;
  overdue: number;
}

export interface LoanRecord {
  id: number;
  equipmentId: number;
  borrower: string;
  purpose: string | null;
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoanItem extends LoanRecord {
  assetNo: string;
  equipmentName: string;
  overdue: boolean;
}

export interface CreateEquipmentInput {
  assetNo?: unknown;
  name?: unknown;
  category?: unknown;
  notes?: unknown;
}

export interface UpdateEquipmentInput {
  assetNo?: unknown;
  name?: unknown;
  category?: unknown;
  notes?: unknown;
}

export interface BorrowInput {
  equipmentId?: unknown;
  borrower?: unknown;
  purpose?: unknown;
  dueAt?: unknown;
}

export interface ListEquipmentQuery {
  search?: string;
  status?: EquipmentStatusFilter;
}

export interface ListLoansQuery {
  search?: string;
  status?: LoanStatusFilter;
}

export interface EquipmentListResult {
  items: EquipmentItem[];
  stats: EquipmentStats;
}

/** A business failure the HTTP layer maps to a status code and an error code. */
export class EquipmentDomainError extends Error {
  public readonly code: string;
  public readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = 'EquipmentDomainError';
    this.code = code;
    this.field = field;
  }
}

export interface EquipmentService {
  listEquipment(query?: ListEquipmentQuery): Promise<EquipmentListResult>;
  createEquipment(input: CreateEquipmentInput): Promise<EquipmentRecord>;
  updateEquipment(
    id: number,
    input: UpdateEquipmentInput,
  ): Promise<EquipmentRecord>;
  borrowEquipment(input: BorrowInput): Promise<LoanRecord>;
  returnLoan(loanId: number): Promise<LoanRecord>;
  listLoans(query?: ListLoansQuery): Promise<LoanItem[]>;
}

export const equipmentServiceToken: ServiceToken<EquipmentService> =
  createServiceToken<EquipmentService>('app/equipment-service');

const MAX_ASSET_NO = 64;
const MAX_NAME = 128;
const MAX_CATEGORY = 64;
const MAX_BORROWER = 128;

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return asText(value);
}

/** A database value read back as text, without stringifying a non-scalar into `[object Object]`. */
function asText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function optionalIso(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return toIso(value);
}

function requireText(value: unknown, field: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new EquipmentDomainError(
      'VALIDATION_ERROR',
      `Field "${field}" is required.`,
      field,
    );
  }
  if (text.length > maxLength) {
    throw new EquipmentDomainError(
      'VALIDATION_ERROR',
      `Field "${field}" must be at most ${maxLength} characters.`,
      field,
    );
  }
  return text;
}

function optionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new EquipmentDomainError(
      'VALIDATION_ERROR',
      `Field "${field}" must be a string.`,
      field,
    );
  }
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function requireDate(value: unknown, field: string): Date {
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string' || typeof value === 'number'
        ? new Date(value)
        : new Date(Number.NaN);
  if (Number.isNaN(date.getTime())) {
    throw new EquipmentDomainError(
      'VALIDATION_ERROR',
      `Field "${field}" must be a valid date.`,
      field,
    );
  }
  return date;
}

function requireId(value: unknown, code: string): number {
  const id = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new EquipmentDomainError(code, 'The requested record was not found.');
  }
  return id;
}

function isOverdue(dueAt: string, now: number): boolean {
  const due = new Date(dueAt).getTime();
  return !Number.isNaN(due) && due < now;
}

function mapEquipment(row: Record<string, unknown>): EquipmentRecord {
  return {
    id: Number(row.id),
    assetNo: asText(row.assetNo),
    name: asText(row.name),
    category: asText(row.category),
    notes: row.notes == null ? null : asText(row.notes),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapLoan(row: Record<string, unknown>): LoanRecord {
  return {
    id: Number(row.id),
    equipmentId: Number(row.equipmentId),
    borrower: asText(row.borrower),
    purpose: row.purpose == null ? null : asText(row.purpose),
    borrowedAt: toIso(row.borrowedAt),
    dueAt: toIso(row.dueAt),
    returnedAt: optionalIso(row.returnedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

async function findEquipment(
  database: DatabaseManager,
  id: number,
): Promise<Record<string, unknown> | undefined> {
  return database
    .query()
    .selectFrom('equipment')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
}

/**
 * Builds the equipment service from a database manager.
 *
 * Derived state — whether a device is out, and whether a loan is overdue — is
 * never stored. It is computed here from `returnedAt` and `dueAt`, so the
 * ledger and the record list can never disagree with each other.
 */
export function createEquipmentService(
  database: DatabaseManager,
): EquipmentService {
  return {
    async listEquipment(query = {}) {
      const now = Date.now();
      const [equipmentRows, activeLoanRows] = await Promise.all([
        database
          .query()
          .selectFrom('equipment')
          .selectAll()
          .orderBy('assetNo', 'asc')
          .execute(),
        database
          .query()
          .selectFrom('equipmentLoans')
          .selectAll()
          .where('returnedAt', 'is', null)
          .execute(),
      ]);

      const activeByEquipment = new Map<number, Record<string, unknown>>();
      for (const row of activeLoanRows) {
        activeByEquipment.set(Number(row.equipmentId), row);
      }

      const items: EquipmentItem[] = equipmentRows.map((row) => {
        const equipment = mapEquipment(row);
        const active = activeByEquipment.get(equipment.id);
        const activeLoan = active
          ? {
              id: Number(active.id),
              borrower: asText(active.borrower),
              dueAt: toIso(active.dueAt),
              overdue: isOverdue(toIso(active.dueAt), now),
            }
          : null;
        return {
          ...equipment,
          status: activeLoan ? 'borrowed' : 'available',
          activeLoan,
        };
      });

      const stats: EquipmentStats = {
        total: items.length,
        borrowed: items.filter((item) => item.status === 'borrowed').length,
        overdue: items.filter((item) => item.activeLoan?.overdue).length,
      };

      const status = query.status ?? 'all';
      const term = query.search?.trim().toLowerCase() ?? '';
      const filtered = items.filter((item) => {
        if (status !== 'all' && item.status !== status) {
          return false;
        }
        if (!term) {
          return true;
        }
        return (
          item.assetNo.toLowerCase().includes(term) ||
          item.name.toLowerCase().includes(term)
        );
      });

      return { items: filtered, stats };
    },

    async createEquipment(input) {
      const assetNo = requireText(input.assetNo, 'assetNo', MAX_ASSET_NO);
      const name = requireText(input.name, 'name', MAX_NAME);
      const category = requireText(input.category, 'category', MAX_CATEGORY);
      const notes = optionalText(input.notes, 'notes');

      const existing = await database
        .query()
        .selectFrom('equipment')
        .selectAll()
        .where('assetNo', '=', assetNo)
        .executeTakeFirst();
      if (existing) {
        throw new EquipmentDomainError(
          'ASSET_NO_TAKEN',
          `Asset number "${assetNo}" is already in use.`,
          'assetNo',
        );
      }

      const now = new Date().toISOString();
      const result = await database
        .query()
        .insertInto('equipment')
        .values({
          assetNo,
          name,
          category,
          notes,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      const created = await findEquipment(database, Number(result.insertId));
      if (!created) {
        throw new EquipmentDomainError(
          'EQUIPMENT_NOT_FOUND',
          'The equipment record was not found after creation.',
        );
      }
      return mapEquipment(created);
    },

    async updateEquipment(id, input) {
      const equipmentId = requireId(id, 'EQUIPMENT_NOT_FOUND');
      const current = await findEquipment(database, equipmentId);
      if (!current) {
        throw new EquipmentDomainError(
          'EQUIPMENT_NOT_FOUND',
          'The requested equipment was not found.',
        );
      }
      const record = mapEquipment(current);

      const assetNo =
        input.assetNo === undefined
          ? record.assetNo
          : requireText(input.assetNo, 'assetNo', MAX_ASSET_NO);
      const name =
        input.name === undefined
          ? record.name
          : requireText(input.name, 'name', MAX_NAME);
      const category =
        input.category === undefined
          ? record.category
          : requireText(input.category, 'category', MAX_CATEGORY);
      const notes =
        input.notes === undefined
          ? record.notes
          : optionalText(input.notes, 'notes');

      if (assetNo !== record.assetNo) {
        const duplicate = await database
          .query()
          .selectFrom('equipment')
          .selectAll()
          .where('assetNo', '=', assetNo)
          .executeTakeFirst();
        if (duplicate && Number(duplicate.id) !== equipmentId) {
          throw new EquipmentDomainError(
            'ASSET_NO_TAKEN',
            `Asset number "${assetNo}" is already in use.`,
            'assetNo',
          );
        }
      }

      await database
        .query()
        .updateTable('equipment')
        .set({
          assetNo,
          name,
          category,
          notes,
          updatedAt: new Date().toISOString(),
        })
        .where('id', '=', equipmentId)
        .execute();

      const updated = await findEquipment(database, equipmentId);
      return mapEquipment(updated ?? current);
    },

    async borrowEquipment(input) {
      const equipmentId = requireId(input.equipmentId, 'EQUIPMENT_NOT_FOUND');
      const borrower = requireText(input.borrower, 'borrower', MAX_BORROWER);
      const purpose = optionalText(input.purpose, 'purpose');
      const dueAt = requireDate(input.dueAt, 'dueAt');

      return database.transaction(async (connection) => {
        const equipment = await connection.query
          .selectFrom('equipment')
          .selectAll()
          .where('id', '=', equipmentId)
          .executeTakeFirst();
        if (!equipment) {
          throw new EquipmentDomainError(
            'EQUIPMENT_NOT_FOUND',
            'The requested equipment was not found.',
          );
        }

        const active = await connection.query
          .selectFrom('equipmentLoans')
          .selectAll()
          .where('equipmentId', '=', equipmentId)
          .where('returnedAt', 'is', null)
          .executeTakeFirst();
        if (active) {
          throw new EquipmentDomainError(
            'EQUIPMENT_ALREADY_BORROWED',
            'This equipment is already lent out and has not been returned.',
          );
        }

        const now = new Date().toISOString();
        const result = await connection.query
          .insertInto('equipmentLoans')
          .values({
            equipmentId,
            borrower,
            purpose,
            borrowedAt: now,
            dueAt: dueAt.toISOString(),
            returnedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();

        const created = await connection.query
          .selectFrom('equipmentLoans')
          .selectAll()
          .where('id', '=', Number(result.insertId))
          .executeTakeFirstOrThrow();
        return mapLoan(created);
      });
    },

    async returnLoan(loanId) {
      const id = requireId(loanId, 'LOAN_NOT_FOUND');

      return database.transaction(async (connection) => {
        const existing = await connection.query
          .selectFrom('equipmentLoans')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirst();
        if (!existing) {
          throw new EquipmentDomainError(
            'LOAN_NOT_FOUND',
            'The requested borrow record was not found.',
          );
        }

        // Idempotent: the conditional update only matches while the loan is
        // still open, so a second click leaves the confirmed return time in
        // place and returns the same row.
        await connection.query
          .updateTable('equipmentLoans')
          .set({
            returnedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where('id', '=', id)
          .where('returnedAt', 'is', null)
          .execute();

        const updated = await connection.query
          .selectFrom('equipmentLoans')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirstOrThrow();
        return mapLoan(updated);
      });
    },

    async listLoans(query = {}) {
      const now = Date.now();
      const [loanRows, equipmentRows] = await Promise.all([
        database
          .query()
          .selectFrom('equipmentLoans')
          .selectAll()
          .orderBy('borrowedAt', 'desc')
          .execute(),
        database.query().selectFrom('equipment').selectAll().execute(),
      ]);

      const equipmentById = new Map(
        equipmentRows.map((row) => [Number(row.id), mapEquipment(row)]),
      );

      const term = query.search?.trim().toLowerCase() ?? '';
      const status = query.status ?? 'all';

      return loanRows
        .map((row) => {
          const loan = mapLoan(row);
          const equipment = equipmentById.get(loan.equipmentId);
          return {
            ...loan,
            assetNo: equipment?.assetNo ?? '',
            equipmentName: equipment?.name ?? '',
            overdue: loan.returnedAt == null && isOverdue(loan.dueAt, now),
          };
        })
        .filter((item) => {
          if (status === 'unreturned' && item.returnedAt != null) {
            return false;
          }
          if (status === 'returned' && item.returnedAt == null) {
            return false;
          }
          if (!term) {
            return true;
          }
          return (
            item.borrower.toLowerCase().includes(term) ||
            item.assetNo.toLowerCase().includes(term) ||
            item.equipmentName.toLowerCase().includes(term)
          );
        });
    },
  };
}

export default class EquipmentProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/equipment-provider';

  public override register(): void {
    this.app.container.singleton(equipmentServiceToken, (container) =>
      createEquipmentService(container.resolve(databaseManagerToken)),
    );
  }
}
