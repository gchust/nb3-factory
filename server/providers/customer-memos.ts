import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, RepositoryError } from '@nocobase/db';
import type { DatabaseManager, Repository } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** A customer memo as the API returns it. */
export interface CustomerMemo {
  readonly id: number;
  readonly name: string;
  readonly note: string | null;
  readonly createdAt: string;
}

/** Writable fields of a memo, as they arrive from the request body. */
export interface CustomerMemoInput {
  readonly name?: unknown;
  readonly note?: unknown;
}

export type CustomerMemoValidationCode =
  'NAME_REQUIRED' | 'NAME_TOO_LONG' | 'NOTE_INVALID' | 'NOTE_TOO_LONG';

export class CustomerMemoValidationError extends Error {
  public constructor(
    public readonly field: 'name' | 'note',
    public readonly code: CustomerMemoValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'CustomerMemoValidationError';
  }
}

export class CustomerMemoNotFoundError extends Error {
  public constructor(public readonly id: number) {
    super(`Customer memo ${id} was not found.`);
    this.name = 'CustomerMemoNotFoundError';
  }
}

export interface CustomerMemoService {
  /** Memos ordered newest first; `search` matches the customer name partially, ignoring case. */
  list(search?: string): Promise<CustomerMemo[]>;
  get(id: number): Promise<CustomerMemo>;
  create(input: CustomerMemoInput): Promise<CustomerMemo>;
  update(id: number, input: CustomerMemoInput): Promise<CustomerMemo>;
  remove(id: number): Promise<void>;
}

export const customerMemoServiceToken: ServiceToken<CustomerMemoService> =
  createServiceToken<CustomerMemoService>('app/customer-memo-service');

const COLLECTION = 'customerMemos';
const NAME_MAX_LENGTH = 128;
const NOTE_MAX_LENGTH = 2000;

interface CustomerMemoRecord {
  readonly id: number;
  readonly name: string;
  readonly note: string | null;
  readonly createdAt: string;
}

interface NormalizedInput {
  readonly name: string;
  readonly note: string | null;
}

function normalize(input: CustomerMemoInput): NormalizedInput {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length === 0) {
    throw new CustomerMemoValidationError(
      'name',
      'NAME_REQUIRED',
      'A customer name is required.',
    );
  }
  if (name.length > NAME_MAX_LENGTH) {
    throw new CustomerMemoValidationError(
      'name',
      'NAME_TOO_LONG',
      `The customer name must be at most ${NAME_MAX_LENGTH} characters.`,
    );
  }

  const rawNote = input.note ?? null;
  if (rawNote !== null && typeof rawNote !== 'string') {
    throw new CustomerMemoValidationError(
      'note',
      'NOTE_INVALID',
      'The note must be text.',
    );
  }
  const note =
    rawNote === null || rawNote.trim() === '' ? null : rawNote.trim();
  if (note !== null && note.length > NOTE_MAX_LENGTH) {
    throw new CustomerMemoValidationError(
      'note',
      'NOTE_TOO_LONG',
      `The note must be at most ${NOTE_MAX_LENGTH} characters.`,
    );
  }

  return { name, note };
}

function toMemo(record: CustomerMemoRecord): CustomerMemo {
  return {
    id: record.id,
    name: record.name,
    note: record.note ?? null,
    createdAt: record.createdAt,
  };
}

function isRecordNotFound(error: unknown): boolean {
  return error instanceof RepositoryError && error.code === 'RECORD_NOT_FOUND';
}

/**
 * Domain operations for customer memos. It takes its database and returns domain results; reading the request and
 * choosing a status code stays in the route.
 */
export function createCustomerMemoService(
  database: DatabaseManager,
): CustomerMemoService {
  const memos: Repository<CustomerMemoRecord> =
    database.repository<CustomerMemoRecord>(COLLECTION);

  return {
    async list(search) {
      const term = search?.trim();
      const rows = await memos.findMany({
        filter: term
          ? (filter) =>
              filter.string('name').includes(term, { mode: 'insensitive' })
          : undefined,
        sort: (sort) => sort.field('createdAt').desc(),
      });
      return rows.map(toMemo);
    },

    async get(id) {
      const record = await memos.findOne({ filter: { id } });
      if (!record) {
        throw new CustomerMemoNotFoundError(id);
      }
      return toMemo(record);
    },

    async create(input) {
      const values = normalize(input);
      const result = await memos.createOne({
        values: { ...values, createdAt: new Date().toISOString() },
      });
      return toMemo(result.record);
    },

    async update(id, input) {
      const values = normalize(input);
      try {
        const result = await memos.updateOne({ filter: { id }, values });
        return toMemo(result.record);
      } catch (error: unknown) {
        if (isRecordNotFound(error)) {
          throw new CustomerMemoNotFoundError(id);
        }
        throw error;
      }
    },

    async remove(id) {
      try {
        await memos.deleteOne({ filter: { id } });
      } catch (error: unknown) {
        if (isRecordNotFound(error)) {
          throw new CustomerMemoNotFoundError(id);
        }
        throw error;
      }
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
