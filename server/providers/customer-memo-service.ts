import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface CustomerMemo {
  readonly id: number;
  readonly customerName: string;
  readonly remark: string | null;
  readonly createdAt: string;
}

export interface CreateCustomerMemoInput {
  readonly customerName: string;
  readonly remark?: string | null;
}

export interface UpdateCustomerMemoInput {
  readonly customerName?: string;
  readonly remark?: string | null;
}

export interface ListCustomerMemosOptions {
  readonly search?: string;
}

export interface CustomerMemoService {
  list(options?: ListCustomerMemosOptions): Promise<CustomerMemo[]>;
  get(id: number): Promise<CustomerMemo | undefined>;
  create(input: CreateCustomerMemoInput): Promise<CustomerMemo>;
  update(
    id: number,
    input: UpdateCustomerMemoInput,
  ): Promise<CustomerMemo | undefined>;
  remove(id: number): Promise<boolean>;
}

/** Shape the repository returns; `createdAt` may be decoded as a `Date`. */
interface CustomerMemoRow {
  readonly id: number;
  readonly customerName: string;
  readonly remark?: string | null;
  readonly createdAt: string | Date;
}

const COLLECTION = 'customerMemos';

function toCustomerMemo(row: CustomerMemoRow): CustomerMemo {
  return {
    id: row.id,
    customerName: row.customerName,
    remark: row.remark ?? null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}

function repositoryFor(database: DatabaseManager) {
  return database.repository<CustomerMemoRow>(COLLECTION);
}

export function createCustomerMemoService(
  database: DatabaseManager,
): CustomerMemoService {
  return {
    async list(options) {
      const search = options?.search?.trim();

      const rows = await repositoryFor(database).findMany({
        ...(search
          ? {
              filter: (filter) =>
                filter.string('customerName').includes(search),
            }
          : {}),
        sort: (sort) => sort.field('createdAt').desc(),
      });

      return rows.map(toCustomerMemo);
    },

    async get(id) {
      const row = await repositoryFor(database).findOne({ filter: { id } });
      return row ? toCustomerMemo(row) : undefined;
    },

    async create(input) {
      const result = await repositoryFor(database).createOne({
        values: {
          customerName: input.customerName,
          remark: input.remark ?? null,
          createdAt: new Date().toISOString(),
        },
      });

      return toCustomerMemo(result.record);
    },

    async update(id, input) {
      const repository = repositoryFor(database);
      const existing = await repository.findOne({ filter: { id } });
      if (!existing) {
        return undefined;
      }

      const values: { customerName?: string; remark?: string | null } = {};
      if (input.customerName !== undefined) {
        values.customerName = input.customerName;
      }
      if (input.remark !== undefined) {
        values.remark = input.remark;
      }

      const result = await repository.updateOne({
        filter: { id },
        values,
      });

      return toCustomerMemo(result.record);
    },

    async remove(id) {
      const repository = repositoryFor(database);
      const existing = await repository.findOne({ filter: { id } });
      if (!existing) {
        return false;
      }

      await repository.deleteOne({ filter: { id } });
      return true;
    },
  };
}

export const customerMemoServiceToken: ServiceToken<CustomerMemoService> =
  createServiceToken<CustomerMemoService>('app/customer-memo-service');

export default class CustomerMemoProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/customer-memo-provider';

  public override register(): void {
    this.app.container.singleton(customerMemoServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createCustomerMemoService(database);
    });
  }
}
