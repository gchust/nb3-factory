import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

/** A stored customer memo, in the logical field names the Collection exposes. */
export interface CustomerMemo {
  readonly id: number;
  readonly customerName: string;
  readonly notes: string | null;
  readonly createdAt: string;
}

/** The validated shape a create or update writes. */
export interface CustomerMemoInput {
  readonly customerName: string;
  readonly notes: string | null;
}

export const MAX_CUSTOMER_NAME_LENGTH = 255;
export const MAX_NOTES_LENGTH = 2000;

/** Codes the routes translate into HTTP responses; the client maps them to a field or a form-level message. */
export type CustomerMemoValidationCode =
  | 'INVALID_BODY'
  | 'CUSTOMER_NAME_REQUIRED'
  | 'CUSTOMER_NAME_TOO_LONG'
  | 'NOTES_TOO_LONG';

/** Thrown when the request body cannot be turned into a memo, so the route answers 422 instead of 500. */
export class CustomerMemoValidationError extends Error {
  readonly code: CustomerMemoValidationCode;

  constructor(code: CustomerMemoValidationCode) {
    super(code);
    this.name = 'CustomerMemoValidationError';
    this.code = code;
  }
}

export const customerMemoServiceToken = createServiceToken<CustomerMemoService>(
  'app/customer-memos-service',
);

export interface CustomerMemoService {
  /** Memos whose customer name contains `search`, newest first; an empty search returns every memo. */
  list(search: string): Promise<CustomerMemo[]>;
  find(id: number): Promise<CustomerMemo | undefined>;
  create(input: unknown): Promise<CustomerMemo>;
  /** Throws `RepositoryError` with `RECORD_NOT_FOUND` when no memo has this id. */
  update(id: number, input: unknown): Promise<CustomerMemo>;
  /** Throws `RepositoryError` with `RECORD_NOT_FOUND` when no memo has this id. */
  remove(id: number): Promise<void>;
}

/**
 * Normalizes and validates a create or update body. Kept here rather than in the route so the same rules apply
 * wherever the service is called, and so the route stays an HTTP concern.
 */
function parseInput(input: unknown): CustomerMemoInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new CustomerMemoValidationError('INVALID_BODY');
  }
  const record = input as Record<string, unknown>;

  const rawName = record.customerName;
  if (typeof rawName !== 'string' || rawName.trim() === '') {
    throw new CustomerMemoValidationError('CUSTOMER_NAME_REQUIRED');
  }
  const customerName = rawName.trim();
  if (customerName.length > MAX_CUSTOMER_NAME_LENGTH) {
    throw new CustomerMemoValidationError('CUSTOMER_NAME_TOO_LONG');
  }

  const rawNotes = record.notes;
  let notes: string | null = null;
  if (rawNotes !== undefined && rawNotes !== null) {
    if (typeof rawNotes !== 'string') {
      throw new CustomerMemoValidationError('INVALID_BODY');
    }
    const trimmed = rawNotes.trim();
    if (trimmed.length > MAX_NOTES_LENGTH) {
      throw new CustomerMemoValidationError('NOTES_TOO_LONG');
    }
    notes = trimmed === '' ? null : trimmed;
  }

  return { customerName, notes };
}

class DefaultCustomerMemoService implements CustomerMemoService {
  private readonly database: DatabaseManager;

  constructor(database: DatabaseManager) {
    this.database = database;
  }

  private repository() {
    return this.database.repository<CustomerMemo>('customerMemos');
  }

  async list(search: string): Promise<CustomerMemo[]> {
    const repository = this.repository();
    if (search) {
      const records = await repository.findMany({
        filter: (filter) => filter.string('customerName').includes(search),
        sort: (sort) => sort.field('createdAt').desc(),
      });
      return [...records];
    }
    const records = await repository.findMany({
      sort: (sort) => sort.field('createdAt').desc(),
    });
    return [...records];
  }

  async find(id: number): Promise<CustomerMemo | undefined> {
    return this.repository().findOne({
      filter: (filter) => filter.number('id').eq(id),
    });
  }

  async create(input: unknown): Promise<CustomerMemo> {
    const values = parseInput(input);
    const result = await this.repository().createOne({
      values: { ...values, createdAt: new Date().toISOString() },
    });
    return result.record;
  }

  async update(id: number, input: unknown): Promise<CustomerMemo> {
    const values = parseInput(input);
    const result = await this.repository().updateOne({
      filter: (filter) => filter.number('id').eq(id),
      values,
    });
    return result.record;
  }

  async remove(id: number): Promise<void> {
    await this.repository().deleteOne({
      filter: (filter) => filter.number('id').eq(id),
    });
  }
}

export default class CustomerMemosProvider extends ServiceProvider<Application> {
  readonly name = 'app/customer-memos-provider';

  register(): void {
    this.app.container.singleton(
      customerMemoServiceToken,
      (resolver) =>
        new DefaultCustomerMemoService(resolver.resolve(databaseManagerToken)),
    );
  }
}
