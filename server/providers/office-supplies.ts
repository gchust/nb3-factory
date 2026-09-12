import type { DatabaseManager } from '@nocobase/db';
import { databaseManagerToken } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface OfficeSupplyRecord {
  id: number;
  code: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  remark: string | null;
  createdAt: Date | string;
}

export interface SupplyRequisitionRecord {
  id: number;
  supplyId: number;
  requisitionedAt: Date | string;
  requisitioner: string;
  quantity: number;
  remark: string | null;
  createdAt: Date | string;
}

export interface OfficeSupplyInput {
  code: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  remark?: string | null;
}

export interface SupplyRequisitionInput {
  requisitionedAt: Date;
  requisitioner: string;
  quantity: number;
  remark?: string | null;
}

export interface SupplyDetail {
  supply: OfficeSupplyRecord;
  requisitions: readonly SupplyRequisitionRecord[];
}

export interface RequisitionResult {
  supply: OfficeSupplyRecord;
  requisition: SupplyRequisitionRecord;
}

/** A business error the route maps to an HTTP response with the same code. */
export class OfficeSuppliesError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'OfficeSuppliesError';
    this.code = code;
    this.status = status;
  }
}

export const officeSuppliesServiceToken: ServiceToken<OfficeSuppliesService> =
  createServiceToken<OfficeSuppliesService>('nb3-factory/office-supplies');

/**
 * Domain logic for the office supplies module. All reads and writes go through
 * this service; routes only parse HTTP input, call it, and shape responses.
 */
export class OfficeSuppliesService {
  public constructor(private readonly database: DatabaseManager) {}

  public async list(): Promise<readonly OfficeSupplyRecord[]> {
    const rows = await this.database
      .query()
      .selectFrom('officeSupplies')
      .selectAll()
      .orderBy('code', 'asc')
      .execute();
    return rows.map(toSupplyRecord);
  }

  public async find(supplyId: number): Promise<SupplyDetail | undefined> {
    const supply = await this.database
      .query()
      .selectFrom('officeSupplies')
      .selectAll()
      .where('id', '=', supplyId)
      .executeTakeFirst();
    if (!supply) return undefined;

    const requisitions = await this.database
      .query()
      .selectFrom('supplyRequisitions')
      .selectAll()
      .where('supplyId', '=', supplyId)
      .orderBy('requisitionedAt', 'desc')
      .orderBy('id', 'desc')
      .execute();

    return {
      supply: toSupplyRecord(supply),
      requisitions: requisitions.map(toRequisitionRecord),
    };
  }

  public async create(input: OfficeSupplyInput): Promise<OfficeSupplyRecord> {
    const value = validateSupplyInput(input);
    const query = this.database.query();

    const existing = await query
      .selectFrom('officeSupplies')
      .select('id')
      .where('code', '=', value.code)
      .executeTakeFirst();
    if (existing) {
      throw codeConflict(value.code);
    }

    try {
      const result = await query
        .insertInto('officeSupplies')
        .values({ ...value, createdAt: new Date() })
        .execute();
      const row = await query
        .selectFrom('officeSupplies')
        .selectAll()
        .where('id', '=', Number(result.insertId))
        .executeTakeFirstOrThrow();
      return toSupplyRecord(row);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw codeConflict(value.code);
      throw error;
    }
  }

  /** Applies only the provided fields; an empty update returns the row as-is. */
  public async update(
    supplyId: number,
    input: Partial<OfficeSupplyInput>,
  ): Promise<OfficeSupplyRecord | undefined> {
    const query = this.database.query();
    const existing = await query
      .selectFrom('officeSupplies')
      .selectAll()
      .where('id', '=', supplyId)
      .executeTakeFirst();
    if (!existing) return undefined;

    const value = validateSupplyInput({
      ...existing,
      ...input,
    } as OfficeSupplyInput);
    if (value.code !== existing.code) {
      const conflict = await query
        .selectFrom('officeSupplies')
        .select('id')
        .where('code', '=', value.code)
        .where('id', '!=', supplyId)
        .executeTakeFirst();
      if (conflict) throw codeConflict(value.code);
    }

    try {
      await query
        .updateTable('officeSupplies')
        .set(value as unknown as Record<string, unknown>)
        .where('id', '=', supplyId)
        .execute();
      return toSupplyRecord(value as unknown as Record<string, unknown>);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw codeConflict(value.code);
      throw error;
    }
  }

  /** Deletes the supply and everything recorded against it. */
  public async remove(supplyId: number): Promise<boolean> {
    const query = this.database.query();
    await query
      .deleteFrom('supplyRequisitions')
      .where('supplyId', '=', supplyId)
      .execute();
    const result = await query
      .deleteFrom('officeSupplies')
      .where('id', '=', supplyId)
      .execute();
    return (result.deletedCount ?? 0) > 0;
  }

  /**
   * Records a requisition and deducts the supply's stock in the same
   * transaction. The conditional update (`quantity >= requested`) guards
   * against concurrent requests racing past the initial check, so stock can
   * never go negative.
   */
  public async requisition(
    supplyId: number,
    input: SupplyRequisitionInput,
  ): Promise<RequisitionResult> {
    const value = validateRequisitionInput(input);

    return this.database.transaction(async (connection) => {
      const query = connection.query;
      const supply = await query
        .selectFrom('officeSupplies')
        .selectAll()
        .where('id', '=', supplyId)
        .executeTakeFirst();
      if (!supply) {
        throw new OfficeSuppliesError(
          'SUPPLY_NOT_FOUND',
          'The office supply does not exist.',
          404,
        );
      }
      if (Number(supply.quantity) < value.quantity) {
        throw insufficientStock({
          name: String(supply.name),
          quantity: Number(supply.quantity),
        });
      }

      const update = await query
        .updateTable('officeSupplies')
        .set({ quantity: Number(supply.quantity) - value.quantity })
        .where('id', '=', supplyId)
        .where('quantity', '>=', value.quantity)
        .execute();
      if ((update.updatedCount ?? 1) === 0) {
        throw insufficientStock({
          name: String(supply.name),
          quantity: Number(supply.quantity),
        });
      }

      const result = await query
        .insertInto('supplyRequisitions')
        .values({ supplyId, ...value, createdAt: new Date() })
        .execute();
      const requisition = await query
        .selectFrom('supplyRequisitions')
        .selectAll()
        .where('id', '=', Number(result.insertId))
        .executeTakeFirstOrThrow();

      return {
        supply: {
          ...toSupplyRecord(supply),
          quantity: Number(supply.quantity) - value.quantity,
        },
        requisition: toRequisitionRecord(requisition),
      };
    });
  }
}

function codeConflict(code: string): OfficeSuppliesError {
  return new OfficeSuppliesError(
    'CODE_CONFLICT',
    `An office supply with the code "${code}" already exists.`,
    409,
  );
}

function insufficientStock(supply: {
  name: string;
  quantity: number;
}): OfficeSuppliesError {
  return new OfficeSuppliesError(
    'INSUFFICIENT_STOCK',
    `Insufficient stock for "${supply.name}": only ${supply.quantity} left.`,
    409,
  );
}

function validateSupplyInput(input: OfficeSupplyInput): OfficeSupplyInput {
  const code = requiredString(input.code, 'code', 32);
  const name = requiredString(input.name, 'name', 128);
  const category = requiredString(input.category, 'category', 32);
  const unit = requiredString(input.unit, 'unit', 16);
  const quantity = integerAtLeast(input.quantity, 'quantity', 0);
  const remark = optionalString(input.remark, 'remark');
  return { code, name, category, quantity, unit, remark };
}

function validateRequisitionInput(
  input: SupplyRequisitionInput,
): SupplyRequisitionInput {
  const requisitionedAt = validDate(input.requisitionedAt, 'requisitionedAt');
  const requisitioner = requiredString(
    input.requisitioner,
    'requisitioner',
    64,
  );
  const quantity = integerAtLeast(input.quantity, 'quantity', 1);
  const remark = optionalString(input.remark, 'remark');
  return { requisitionedAt, requisitioner, quantity, remark };
}

function requiredString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidInput(`${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw invalidInput(`${field} must be at most ${maxLength} characters.`);
  }
  return trimmed;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw invalidInput(`${field} must be a string.`);
  }
  return value.trim() === '' ? null : value.trim();
}

function integerAtLeast(
  value: unknown,
  field: string,
  minimum: number,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw invalidInput(`${field} must be an integer.`);
  }
  if (value < minimum) {
    throw invalidInput(`${field} must be at least ${minimum}.`);
  }
  return value;
}

function validDate(value: unknown, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw invalidInput(`${field} must be a valid date.`);
  }
  return value;
}

function invalidInput(message: string): OfficeSuppliesError {
  return new OfficeSuppliesError('INVALID_INPUT', message, 400);
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    message.includes('UNIQUE constraint failed') ||
    message.includes('duplicate key') ||
    message.includes('Duplicate entry')
  );
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : '';
}

function toSupplyRecord(row: Record<string, unknown>): OfficeSupplyRecord {
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    category: String(row.category),
    quantity: Number(row.quantity),
    unit: String(row.unit),
    remark: toNullableString(row.remark),
    createdAt: row.createdAt as OfficeSupplyRecord['createdAt'],
  };
}

function toRequisitionRecord(
  row: Record<string, unknown>,
): SupplyRequisitionRecord {
  return {
    id: Number(row.id),
    supplyId: Number(row.supplyId),
    requisitionedAt:
      row.requisitionedAt as SupplyRequisitionRecord['requisitionedAt'],
    requisitioner: String(row.requisitioner),
    quantity: Number(row.quantity),
    remark: toNullableString(row.remark),
    createdAt: row.createdAt as SupplyRequisitionRecord['createdAt'],
  };
}

export default class OfficeSuppliesProvider extends ServiceProvider<Application> {
  public readonly name = 'app/office-supplies';

  public override register(): void {
    this.app.container.singleton(officeSuppliesServiceToken, (resolver) => {
      return new OfficeSuppliesService(resolver.resolve(databaseManagerToken));
    });
  }
}
