import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** A single customer memo as the API exposes it. */
export interface CustomerMemo {
  readonly id: number;
  readonly customerName: string;
  readonly note: string | null;
  readonly createdAt: string;
}

/** Writable fields of a customer memo. */
export interface CustomerMemoInput {
  readonly customerName: string;
  readonly note?: string | null;
}

/** Raised when a memo is submitted without a usable customer name. */
export class CustomerMemoValidationError extends Error {
  public readonly code = 'CUSTOMER_NAME_REQUIRED';

  constructor() {
    super('Customer name is required.');
    this.name = 'CustomerMemoValidationError';
  }
}

export interface CustomerMemoService {
  list(search?: string): Promise<CustomerMemo[]>;
  create(input: CustomerMemoInput): Promise<CustomerMemo>;
  update(
    id: number,
    input: CustomerMemoInput,
  ): Promise<CustomerMemo | undefined>;
  remove(id: number): Promise<boolean>;
}

export const customerMemoServiceToken: ServiceToken<CustomerMemoService> =
  createServiceToken<CustomerMemoService>('app/customer-memo-service');

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }

  return '';
}

function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return `${value}`;
  }
  return '';
}

function toOptionalText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'string' ? value : null;
}

function toCustomerMemo(row: Row): CustomerMemo {
  return {
    id: Number(row.id),
    customerName: toText(row.customerName),
    note: toOptionalText(row.note),
    createdAt: toIsoString(row.createdAt),
  };
}

function normalizeInput(input: CustomerMemoInput): {
  customerName: string;
  note: string | null;
} {
  const customerName =
    typeof input.customerName === 'string' ? input.customerName.trim() : '';
  if (!customerName) {
    throw new CustomerMemoValidationError();
  }

  const note =
    typeof input.note === 'string' && input.note.trim()
      ? input.note.trim()
      : null;

  return { customerName, note };
}

/**
 * Domain logic for customer memos. The service owns the queries and the
 * validation rules; routes only translate HTTP in and out.
 */
export function createCustomerMemoService(
  database: DatabaseManager,
): CustomerMemoService {
  const query = () => database.query();

  return {
    async list(search) {
      let select = query().selectFrom('customerMemos').selectAll();

      const term = typeof search === 'string' ? search.trim() : '';
      if (term) {
        select = select.where('customerName', 'like', `%${term}%`);
      }

      select = select.orderBy('createdAt', 'desc').orderBy('id', 'desc');
      const rows = await select.execute();
      return rows.map(toCustomerMemo);
    },

    async create(input) {
      const values = normalizeInput(input);
      const result = await query()
        .insertInto('customerMemos')
        .values({ ...values, createdAt: new Date() })
        .execute();

      const id = Number(result.insertId);
      const row = await query()
        .selectFrom('customerMemos')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!row) {
        throw new Error('Customer memo could not be read back after creation.');
      }

      return toCustomerMemo(row);
    },

    async update(id, input) {
      const values = normalizeInput(input);
      const result = await query()
        .updateTable('customerMemos')
        .set(values)
        .where('id', '=', id)
        .execute();

      if ((result.updatedCount ?? 0) === 0) {
        return undefined;
      }

      const row = await query()
        .selectFrom('customerMemos')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      return row ? toCustomerMemo(row) : undefined;
    },

    async remove(id) {
      const result = await query()
        .deleteFrom('customerMemos')
        .where('id', '=', id)
        .execute();

      return (result.deletedCount ?? 0) > 0;
    },
  };
}

export default class CustomerMemoProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/customer-memo-provider';

  public override register(): void {
    this.app.container.singleton(customerMemoServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createCustomerMemoService(database);
    });
  }
}
