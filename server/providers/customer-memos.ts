import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type Repository } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** A row of the `customerMemos` collection as the database returns it. */
export interface CustomerMemoRecord {
  readonly id: number;
  readonly name: string;
  readonly note: string | null;
  readonly createdAt: string | Date;
}

/** A memo as the HTTP API exposes it: `createdAt` is always an ISO 8601 string. */
export interface CustomerMemo {
  readonly id: number;
  readonly name: string;
  readonly note: string | null;
  readonly createdAt: string;
}

/**
 * The values a client may create a memo from.
 *
 * `name` and `note` are `unknown` because this is the boundary that validates them: the HTTP route forwards whatever
 * the request body held, and `normalizeName`/`normalizeNote` decide whether it is acceptable.
 */
export interface CustomerMemoInput {
  readonly name: unknown;
  readonly note?: unknown;
}

/** The values a client may change on an existing memo; an omitted field is left as it is. */
export interface CustomerMemoPatch {
  readonly name?: unknown;
  readonly note?: unknown;
}

export const CUSTOMER_MEMO_NAME_MAX_LENGTH = 200;
export const CUSTOMER_MEMO_NOTE_MAX_LENGTH = 2000;

export type CustomerMemoErrorCode =
  | 'CUSTOMER_MEMO_NAME_REQUIRED'
  | 'CUSTOMER_MEMO_NAME_TOO_LONG'
  | 'CUSTOMER_MEMO_NOTE_TOO_LONG';

/** Rejected input, carrying the code the HTTP layer answers with. */
export class CustomerMemoValidationError extends Error {
  public readonly code: CustomerMemoErrorCode;

  constructor(code: CustomerMemoErrorCode) {
    super(code);
    this.name = 'CustomerMemoValidationError';
    this.code = code;
  }
}

/** The Repository methods this service uses; a test substitutes a fake with the same shape. */
export type CustomerMemoRepository = Pick<
  Repository<CustomerMemoRecord>,
  'findMany' | 'findOne' | 'createOne' | 'updateOne' | 'deleteOne'
>;

/** The domain rules for a customer memo. HTTP concerns live in the route, not here. */
export interface CustomerMemoService {
  list(): Promise<CustomerMemo[]>;
  get(id: number): Promise<CustomerMemo | undefined>;
  create(input: CustomerMemoInput): Promise<CustomerMemo>;
  update(
    id: number,
    patch: CustomerMemoPatch,
  ): Promise<CustomerMemo | undefined>;
  /** Returns `false` when no memo with that id exists. */
  remove(id: number): Promise<boolean>;
}

export function createCustomerMemoService(
  repository: CustomerMemoRepository,
): CustomerMemoService {
  return {
    async list(): Promise<CustomerMemo[]> {
      const records = await repository.findMany();
      // Newest first; a small table is sorted in memory rather than through a sort builder.
      return records
        .map(toCustomerMemo)
        .sort((left, right) => right.id - left.id);
    },

    async get(id: number): Promise<CustomerMemo | undefined> {
      const record = await repository.findOne({ filter: { id } });
      return record ? toCustomerMemo(record) : undefined;
    },

    async create(input: CustomerMemoInput): Promise<CustomerMemo> {
      const { record } = await repository.createOne({
        values: {
          name: normalizeName(input.name),
          note: normalizeNote(input.note),
          createdAt: new Date(),
        },
      });
      return toCustomerMemo(record);
    },

    async update(
      id: number,
      patch: CustomerMemoPatch,
    ): Promise<CustomerMemo | undefined> {
      const existing = await repository.findOne({ filter: { id } });
      if (!existing) {
        return undefined;
      }

      const values: { name?: string; note?: string | null } = {};
      // Only the fields the caller sent are validated and written.
      if (patch.name !== undefined) {
        values.name = normalizeName(patch.name);
      }
      if (patch.note !== undefined) {
        values.note = normalizeNote(patch.note);
      }
      if (Object.keys(values).length === 0) {
        return toCustomerMemo(existing);
      }

      const { record } = await repository.updateOne({
        filter: { id },
        values,
      });
      return toCustomerMemo(record);
    },

    async remove(id: number): Promise<boolean> {
      const existing = await repository.findOne({ filter: { id } });
      if (!existing) {
        return false;
      }

      await repository.deleteOne({ filter: { id } });
      return true;
    },
  };
}

function normalizeName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) {
    throw new CustomerMemoValidationError('CUSTOMER_MEMO_NAME_REQUIRED');
  }
  if (name.length > CUSTOMER_MEMO_NAME_MAX_LENGTH) {
    throw new CustomerMemoValidationError('CUSTOMER_MEMO_NAME_TOO_LONG');
  }
  return name;
}

function normalizeNote(value: unknown): string | null {
  const note = typeof value === 'string' ? value.trim() : '';
  if (note.length > CUSTOMER_MEMO_NOTE_MAX_LENGTH) {
    throw new CustomerMemoValidationError('CUSTOMER_MEMO_NOTE_TOO_LONG');
  }
  return note || null;
}

function toCustomerMemo(record: CustomerMemoRecord): CustomerMemo {
  return {
    id: record.id,
    name: record.name,
    note: record.note ?? null,
    createdAt: new Date(record.createdAt).toISOString(),
  };
}

/** The service holding the application's customer-memo rules. */
export const customerMemoServiceToken: ServiceToken<CustomerMemoService> =
  createServiceToken<CustomerMemoService>('app/customer-memos');

export default class CustomerMemoProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/customer-memos';

  public override register(): void {
    this.app.container.singleton(customerMemoServiceToken, (resolver) =>
      createCustomerMemoService(
        resolver
          .resolve(databaseManagerToken)
          .repository<CustomerMemoRecord>('customerMemos'),
      ),
    );
  }
}
