import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  RepositoryError,
  type DatabaseManager,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** A customer memo as the API and the browser see it. */
export interface CustomerMemo {
  readonly id: number;
  readonly name: string;
  readonly notes: string | null;
  readonly createdAt: string;
}

/** Writable fields of a customer memo. */
export interface CustomerMemoInput {
  readonly name: string;
  readonly notes?: string | null;
}

/** Domain operations over the customer memo table. */
export interface CustomerMemoService {
  list(): Promise<CustomerMemo[]>;
  get(id: number): Promise<CustomerMemo | undefined>;
  create(input: CustomerMemoInput): Promise<CustomerMemo>;
  update(
    id: number,
    input: CustomerMemoInput,
  ): Promise<CustomerMemo | undefined>;
  /** Returns `true` when a record was deleted, `false` when the id matched none. */
  remove(id: number): Promise<boolean>;
}

interface CustomerMemoRecord {
  id: number;
  name: string;
  notes: string | null;
  createdAt: Date | string;
}

export interface CreateCustomerMemoServiceOptions {
  readonly database: DatabaseManager;
}

/** Normalizes a stored timestamp to an ISO string for a stable JSON shape. */
function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toMemo(record: CustomerMemoRecord): CustomerMemo {
  return {
    id: record.id,
    name: record.name,
    notes: record.notes ?? null,
    createdAt: toIsoString(record.createdAt),
  };
}

/** Business logic for customer memos, independent of HTTP. */
export function createCustomerMemoService(
  options: CreateCustomerMemoServiceOptions,
): CustomerMemoService {
  const memos = () =>
    options.database.repository<CustomerMemoRecord>('customerMemos');

  return {
    async list() {
      const records = await memos().findMany({
        sort: (sort) => sort.field('createdAt').desc(),
      });
      return records.map(toMemo);
    },

    async get(id) {
      const record = await memos().findOne({ filter: { id } });
      return record ? toMemo(record) : undefined;
    },

    async create(input) {
      const result = await memos().createOne({
        values: {
          name: input.name,
          notes: input.notes ?? null,
          createdAt: new Date(),
        },
      });
      return toMemo(result.record);
    },

    async update(id, input) {
      try {
        const result = await memos().updateOne({
          filter: { id },
          values: {
            name: input.name,
            notes: input.notes ?? null,
          },
        });
        return toMemo(result.record);
      } catch (error) {
        if (
          error instanceof RepositoryError &&
          error.code === 'RECORD_NOT_FOUND'
        ) {
          return undefined;
        }
        throw error;
      }
    },

    async remove(id) {
      try {
        await memos().deleteOne({ filter: { id } });
        return true;
      } catch (error) {
        if (
          error instanceof RepositoryError &&
          error.code === 'RECORD_NOT_FOUND'
        ) {
          return false;
        }
        throw error;
      }
    },
  };
}

export const customerMemoServiceToken: ServiceToken<CustomerMemoService> =
  createServiceToken<CustomerMemoService>('app/customer-memo-service');

/** Binds the customer memo service to the application database. */
export default class CustomerMemoServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/customer-memo-service-provider';

  public override register(): void {
    this.app.container.singleton(customerMemoServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createCustomerMemoService({ database });
    });
  }
}
