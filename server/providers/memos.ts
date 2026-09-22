import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** Maximum length of a customer name; mirrors the migration column length. */
export const MAX_CUSTOMER_NAME_LENGTH = 128;

export interface CustomerMemo {
  readonly id: number;
  readonly customerName: string;
  readonly content: string | null;
  readonly createdAt: Date | string;
}

export interface CustomerMemoInput {
  readonly customerName: string;
  readonly content: string | null;
}

/** Raised when a create or update payload is not a valid memo. */
export class MemoValidationError extends Error {
  public readonly code: string = 'VALIDATION_ERROR';

  public constructor(message: string) {
    super(message);
    this.name = 'MemoValidationError';
  }
}

export interface CustomerMemoService {
  /** List memos, optionally filtered by a partial, case-insensitive name. */
  list(search?: string): Promise<CustomerMemo[]>;
  create(input: unknown): Promise<CustomerMemo>;
  update(id: number, input: unknown): Promise<CustomerMemo | undefined>;
  remove(id: number): Promise<boolean>;
}

export const customerMemoServiceToken: ServiceToken<CustomerMemoService> =
  createServiceToken<CustomerMemoService>('app/customer-memo-service');

const MEMO_SELECTION = ['id', 'customerName', 'content', 'createdAt'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Trim and validate a memo payload, rejecting a missing or empty customer name. */
export function normalizeMemoInput(input: unknown): CustomerMemoInput {
  const record = isRecord(input) ? input : {};
  const customerName =
    typeof record.customerName === 'string' ? record.customerName.trim() : '';

  if (!customerName) {
    throw new MemoValidationError('Customer name is required.');
  }
  if (customerName.length > MAX_CUSTOMER_NAME_LENGTH) {
    throw new MemoValidationError(
      `Customer name must be at most ${MAX_CUSTOMER_NAME_LENGTH} characters.`,
    );
  }

  const content =
    typeof record.content === 'string' ? record.content.trim() : '';

  return { customerName, content: content || null };
}

export function createCustomerMemoService(
  database: DatabaseManager,
): CustomerMemoService {
  async function findById(id: number): Promise<CustomerMemo | undefined> {
    const row = await database
      .query()
      .selectFrom('customerMemos')
      .select(MEMO_SELECTION)
      .where('id', '=', id)
      .executeTakeFirst<CustomerMemo>();
    return row;
  }

  return {
    async list(search = '') {
      const term = search.trim();
      let builder = database
        .query()
        .selectFrom('customerMemos')
        .select(MEMO_SELECTION)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc');

      if (term) {
        builder = builder.where('customerName', 'like', `%${term}%`);
      }

      return builder.execute<CustomerMemo>();
    },

    async create(input) {
      const values = normalizeMemoInput(input);
      const result = await database
        .query()
        .insertInto('customerMemos')
        .values({
          customerName: values.customerName,
          content: values.content,
          createdAt: new Date(),
        })
        .execute();

      const id = Number(result.insertId);
      const memo = Number.isFinite(id) ? await findById(id) : undefined;
      if (memo) {
        return memo;
      }

      // Fall back to the most recent matching row when the driver did not
      // report an insert id.
      const fallback = await database
        .query()
        .selectFrom('customerMemos')
        .select(MEMO_SELECTION)
        .where('customerName', '=', values.customerName)
        .where('content', '=', values.content)
        .orderBy('id', 'desc')
        .executeTakeFirst<CustomerMemo>();
      if (!fallback) {
        throw new Error('Failed to load the created memo.');
      }
      return fallback;
    },

    async update(id, input) {
      const values = normalizeMemoInput(input);
      const existing = await findById(id);
      if (!existing) {
        return undefined;
      }

      await database
        .query()
        .updateTable('customerMemos')
        .set({ customerName: values.customerName, content: values.content })
        .where('id', '=', id)
        .execute();

      return findById(id);
    },

    async remove(id) {
      const existing = await findById(id);
      if (!existing) {
        return false;
      }

      await database
        .query()
        .deleteFrom('customerMemos')
        .where('id', '=', id)
        .execute();

      return true;
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
