import {
  databaseManagerToken,
  type FilterBuilder,
  type FilterNode,
  type Repository,
  RepositoryError,
  type RepositoryRecord,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

export const opportunityStages = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof opportunityStages)[number];

export interface CustomerDto {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface ContactDto {
  readonly id: number;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly customerId: number;
  readonly customerName: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface OpportunityDto {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly customerName: string | null;
  readonly amount: number;
  readonly stage: OpportunityStage;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface CustomerDetailDto extends CustomerDto {
  readonly contacts: readonly ContactDto[];
  readonly opportunities: readonly OpportunityDto[];
  /** Sum of every opportunity owned by this customer. */
  readonly opportunityTotal: number;
}

export interface CustomerInput {
  readonly name: string;
  readonly industry?: string | null;
}

export interface ContactInput {
  readonly name: string;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly customerId: number;
}

export interface OpportunityInput {
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

export interface ListCustomerOptions {
  readonly search?: string;
}

export interface ListContactOptions {
  readonly search?: string;
  readonly customerId?: number;
}

export interface ListOpportunityOptions {
  readonly search?: string;
  readonly stage?: OpportunityStage;
  readonly customerId?: number;
}

export interface CrmService {
  listCustomers(options?: ListCustomerOptions): Promise<CustomerDto[]>;
  getCustomer(id: number): Promise<CustomerDetailDto>;
  createCustomer(input: CustomerInput): Promise<CustomerDto>;
  updateCustomer(id: number, input: CustomerInput): Promise<CustomerDto>;
  listContacts(options?: ListContactOptions): Promise<ContactDto[]>;
  getContact(id: number): Promise<ContactDto>;
  createContact(input: ContactInput): Promise<ContactDto>;
  updateContact(id: number, input: ContactInput): Promise<ContactDto>;
  listOpportunities(
    options?: ListOpportunityOptions,
  ): Promise<OpportunityDto[]>;
  getOpportunity(id: number): Promise<OpportunityDto>;
  createOpportunity(input: OpportunityInput): Promise<OpportunityDto>;
  updateOpportunity(
    id: number,
    input: OpportunityInput,
  ): Promise<OpportunityDto>;
}

export type CrmErrorCode = 'VALIDATION' | 'NOT_FOUND';

export class CrmServiceError extends Error {
  public readonly code: CrmErrorCode;
  public readonly field?: string;

  public constructor(code: CrmErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'CrmServiceError';
    this.code = code;
    this.field = field;
  }
}

export const crmServiceToken: ServiceToken<CrmService> =
  createServiceToken<CrmService>('app/crm-service');

const COLLECTIONS = {
  customers: 'customers',
  contacts: 'contacts',
  opportunities: 'opportunities',
} as const;

interface CrmDatabase {
  repository(collection: string): Repository<RepositoryRecord>;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    return String(value);
  }

  return '';
}

function toNullableText(value: unknown): string | null {
  const text = toText(value);
  return text.length === 0 ? null : text;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return toNullableText(value);
}

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CrmServiceError('VALIDATION', `${field} is required.`, field);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new CrmServiceError(
      'VALIDATION',
      `${field} must be at most ${maxLength} characters.`,
      field,
    );
  }

  return trimmed;
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new CrmServiceError('VALIDATION', `${field} must be text.`, field);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw new CrmServiceError(
      'VALIDATION',
      `${field} must be at most ${maxLength} characters.`,
      field,
    );
  }

  return trimmed;
}

function requireId(value: unknown, field: string): number {
  const parsed = toNumber(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) {
    throw new CrmServiceError(
      'VALIDATION',
      `${field} must be a positive integer.`,
      field,
    );
  }

  return parsed;
}

function requireAmount(value: unknown): number {
  const parsed = toNumber(value);
  if (parsed === null || parsed < 0) {
    throw new CrmServiceError(
      'VALIDATION',
      'amount must be a number greater than or equal to 0.',
      'amount',
    );
  }

  return roundAmount(parsed);
}

function requireStage(value: unknown): OpportunityStage {
  if (
    typeof value !== 'string' ||
    !(opportunityStages as readonly string[]).includes(value)
  ) {
    throw new CrmServiceError(
      'VALIDATION',
      `stage must be one of: ${opportunityStages.join(', ')}.`,
      'stage',
    );
  }

  return value as OpportunityStage;
}

function customerFilter(
  search?: string,
): (filter: FilterBuilder<RepositoryRecord>) => FilterNode {
  return (filter) => {
    if (!search || search.trim().length === 0) {
      return filter.string('name').notEmpty();
    }

    return filter.or([
      filter.string('name').includes(search, { mode: 'insensitive' }),
      filter.string('industry').includes(search, { mode: 'insensitive' }),
    ]);
  };
}

function contactFilter(
  options: ListContactOptions,
): (filter: FilterBuilder<RepositoryRecord>) => FilterNode {
  return (filter) => {
    const nodes: FilterNode[] = [];

    if (options.customerId !== undefined) {
      nodes.push(filter.number('customerId').eq(options.customerId));
    }

    if (options.search && options.search.trim().length > 0) {
      nodes.push(
        filter.or([
          filter.string('name').includes(options.search, {
            mode: 'insensitive',
          }),
          filter.string('phone').includes(options.search, {
            mode: 'insensitive',
          }),
          filter.string('email').includes(options.search, {
            mode: 'insensitive',
          }),
        ]),
      );
    }

    return nodes.length > 0
      ? filter.and(nodes)
      : filter.string('name').notEmpty();
  };
}

function opportunityFilter(
  options: ListOpportunityOptions,
): (filter: FilterBuilder<RepositoryRecord>) => FilterNode {
  return (filter) => {
    const nodes: FilterNode[] = [];

    if (options.customerId !== undefined) {
      nodes.push(filter.number('customerId').eq(options.customerId));
    }

    if (options.stage !== undefined) {
      nodes.push(filter.string('stage').eq(options.stage));
    }

    if (options.search && options.search.trim().length > 0) {
      nodes.push(
        filter.string('name').includes(options.search, {
          mode: 'insensitive',
        }),
      );
    }

    return nodes.length > 0
      ? filter.and(nodes)
      : filter.string('name').notEmpty();
  };
}

/**
 * Domain logic for the CRM collections. It never reads a request context and
 * never decides HTTP status codes; the route maps `CrmServiceError.code`.
 */
export function createCrmService(database: CrmDatabase): CrmService {
  const customers = database.repository(COLLECTIONS.customers);
  const contacts = database.repository(COLLECTIONS.contacts);
  const opportunities = database.repository(COLLECTIONS.opportunities);

  async function assertCustomerExists(id: number): Promise<void> {
    const exists = await customers.exists({ filter: { id } });
    if (!exists) {
      throw new CrmServiceError(
        'NOT_FOUND',
        'Customer not found.',
        'customerId',
      );
    }
  }

  function mapCustomer(record: RepositoryRecord): CustomerDto {
    return {
      id: Number(record.id),
      name: toText(record.name),
      industry: toNullableText(record.industry),
      createdAt: toIso(record.createdAt),
      updatedAt: toIso(record.updatedAt),
    };
  }

  function mapContact(
    record: RepositoryRecord,
    customerNames: Map<number, string>,
  ): ContactDto {
    const customerId = Number(record.customerId);
    return {
      id: Number(record.id),
      name: toText(record.name),
      phone: toNullableText(record.phone),
      email: toNullableText(record.email),
      customerId,
      customerName: customerNames.get(customerId) ?? null,
      createdAt: toIso(record.createdAt),
      updatedAt: toIso(record.updatedAt),
    };
  }

  function mapOpportunity(
    record: RepositoryRecord,
    customerNames: Map<number, string>,
  ): OpportunityDto {
    const customerId = Number(record.customerId);
    return {
      id: Number(record.id),
      name: toText(record.name),
      customerId,
      customerName: customerNames.get(customerId) ?? null,
      amount: toNumber(record.amount) ?? 0,
      stage: toText(record.stage) as OpportunityStage,
      createdAt: toIso(record.createdAt),
      updatedAt: toIso(record.updatedAt),
    };
  }

  async function customerNameMap(): Promise<Map<number, string>> {
    const records = await customers.findMany();
    return new Map(
      records.map((record) => [Number(record.id), toText(record.name)]),
    );
  }

  async function fetchCustomer(id: number): Promise<RepositoryRecord> {
    const record = await customers.findOne({ filter: { id } });
    if (!record) {
      throw new CrmServiceError('NOT_FOUND', 'Customer not found.');
    }

    return record;
  }

  return {
    async listCustomers(options = {}) {
      const records = await customers.findMany({
        filter: customerFilter(options.search),
        sort: (sort) => [
          sort.field('updatedAt').desc(),
          sort.field('id').desc(),
        ],
      });

      return records.map(mapCustomer);
    },

    async getCustomer(id) {
      const customer = await fetchCustomer(requireId(id, 'id'));
      const names = await customerNameMap();

      const contactRecords = await contacts.findMany({
        filter: { customerId: customer.id as number },
        sort: (sort) => [sort.field('id').asc()],
      });
      const opportunityRecords = await opportunities.findMany({
        filter: { customerId: customer.id as number },
        sort: (sort) => [sort.field('id').asc()],
      });

      const mappedOpportunities = opportunityRecords.map((record) =>
        mapOpportunity(record, names),
      );
      const total = roundAmount(
        mappedOpportunities.reduce((sum, item) => sum + item.amount, 0),
      );

      return {
        ...mapCustomer(customer),
        contacts: contactRecords.map((record) => mapContact(record, names)),
        opportunities: mappedOpportunities,
        opportunityTotal: total,
      };
    },

    async createCustomer(input) {
      const now = new Date();
      const { record } = await customers.createOne({
        values: {
          name: requireText(input.name, 'name', 120),
          industry: optionalText(input.industry, 'industry', 120),
          createdAt: now,
          updatedAt: now,
        },
      });

      return mapCustomer(record);
    },

    async updateCustomer(id, input) {
      const customerId = requireId(id, 'id');
      try {
        const { record } = await customers.updateOne({
          filter: { id: customerId },
          values: {
            name: requireText(input.name, 'name', 120),
            industry: optionalText(input.industry, 'industry', 120),
            updatedAt: new Date(),
          },
        });

        return mapCustomer(record);
      } catch (error) {
        throw translateRepositoryError(error);
      }
    },

    async listContacts(options = {}) {
      const names = await customerNameMap();
      const records = await contacts.findMany({
        filter: contactFilter(options),
        sort: (sort) => [
          sort.field('updatedAt').desc(),
          sort.field('id').desc(),
        ],
      });

      return records.map((record) => mapContact(record, names));
    },

    async getContact(id) {
      const contactId = requireId(id, 'id');
      const record = await contacts.findOne({ filter: { id: contactId } });
      if (!record) {
        throw new CrmServiceError('NOT_FOUND', 'Contact not found.');
      }

      return mapContact(record, await customerNameMap());
    },

    async createContact(input) {
      const customerId = requireId(input.customerId, 'customerId');
      await assertCustomerExists(customerId);
      const now = new Date();

      const { record } = await contacts.createOne({
        values: {
          name: requireText(input.name, 'name', 120),
          phone: optionalText(input.phone, 'phone', 60),
          email: optionalText(input.email, 'email', 160),
          customerId,
          createdAt: now,
          updatedAt: now,
        },
      });

      return mapContact(record, await customerNameMap());
    },

    async updateContact(id, input) {
      const contactId = requireId(id, 'id');
      const customerId = requireId(input.customerId, 'customerId');
      await assertCustomerExists(customerId);

      try {
        const { record } = await contacts.updateOne({
          filter: { id: contactId },
          values: {
            name: requireText(input.name, 'name', 120),
            phone: optionalText(input.phone, 'phone', 60),
            email: optionalText(input.email, 'email', 160),
            customerId,
            updatedAt: new Date(),
          },
        });

        return mapContact(record, await customerNameMap());
      } catch (error) {
        throw translateRepositoryError(error);
      }
    },

    async listOpportunities(options = {}) {
      const names = await customerNameMap();
      const records = await opportunities.findMany({
        filter: opportunityFilter(options),
        sort: (sort) => [
          sort.field('updatedAt').desc(),
          sort.field('id').desc(),
        ],
      });

      return records.map((record) => mapOpportunity(record, names));
    },

    async getOpportunity(id) {
      const opportunityId = requireId(id, 'id');
      const record = await opportunities.findOne({
        filter: { id: opportunityId },
      });
      if (!record) {
        throw new CrmServiceError('NOT_FOUND', 'Opportunity not found.');
      }

      return mapOpportunity(record, await customerNameMap());
    },

    async createOpportunity(input) {
      const customerId = requireId(input.customerId, 'customerId');
      await assertCustomerExists(customerId);
      const now = new Date();

      const { record } = await opportunities.createOne({
        values: {
          name: requireText(input.name, 'name', 160),
          customerId,
          amount: requireAmount(input.amount),
          stage: requireStage(input.stage),
          createdAt: now,
          updatedAt: now,
        },
      });

      return mapOpportunity(record, await customerNameMap());
    },

    async updateOpportunity(id, input) {
      const opportunityId = requireId(id, 'id');
      const customerId = requireId(input.customerId, 'customerId');
      await assertCustomerExists(customerId);

      try {
        const { record } = await opportunities.updateOne({
          filter: { id: opportunityId },
          values: {
            name: requireText(input.name, 'name', 160),
            customerId,
            amount: requireAmount(input.amount),
            stage: requireStage(input.stage),
            updatedAt: new Date(),
          },
        });

        return mapOpportunity(record, await customerNameMap());
      } catch (error) {
        throw translateRepositoryError(error);
      }
    },
  } satisfies CrmService;
}

function translateRepositoryError(error: unknown): unknown {
  if (error instanceof RepositoryError && error.code === 'RECORD_NOT_FOUND') {
    return new CrmServiceError('NOT_FOUND', 'Record not found.');
  }

  return error;
}

export default class CrmProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/crm-provider';

  public override register(): void {
    this.app.container.singleton(crmServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createCrmService(database);
    });
  }
}
