import {
  databaseManagerToken,
  type DatabaseManager,
  type FilterBuilder,
  type FilterNode,
  type Repository,
  type RepositoryFilter,
  type RepositoryMutationScalarValue,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

/** The three stages an opportunity moves through. The stored codes are stable; the labels are translated in the app. */
export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

/** A customer as the API returns it. `id` is a string and `industry` may be absent. */
export interface CustomerView {
  readonly id: string;
  readonly name: string;
  readonly industry: string | null;
}

/** A contact as the API returns it, with the name of the customer it belongs to. */
export interface ContactView {
  readonly id: string;
  readonly name: string;
  readonly contactInfo: string | null;
  readonly customerId: string;
  readonly customerName: string;
}

/**
 * An opportunity as the API returns it. `amount` is a JSON number or `null`; the column is a decimal, so the stored
 * value is normalized on the way out.
 */
export interface OpportunityView {
  readonly id: string;
  readonly name: string | null;
  readonly customerId: string;
  readonly customerName: string;
  readonly amount: number | null;
  readonly stage: OpportunityStage;
}

/** A customer with everything the detail view shows: its contacts, its opportunities and the sum of their amounts. */
export interface CustomerDetailView extends CustomerView {
  readonly contacts: readonly ContactView[];
  readonly opportunities: readonly OpportunityView[];
  readonly opportunityTotal: number;
}

/** One page of records and where it sits among all matching records. */
export interface Page<T> {
  readonly rows: readonly T[];
  readonly total: number;
}

export interface ListQuery {
  readonly q?: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListContactsQuery extends ListQuery {
  readonly customerId?: string;
}

export interface ListOpportunitiesQuery extends ListQuery {
  readonly customerId?: string;
  readonly stage?: OpportunityStage;
}

export interface CreateCustomerInput {
  readonly name: string;
  readonly industry: string | null;
}

export interface UpdateCustomerInput {
  readonly name?: string;
  readonly industry?: string | null;
}

export interface CreateContactInput {
  readonly name: string;
  readonly contactInfo: string | null;
  readonly customerId: string;
}

export interface UpdateContactInput {
  readonly name?: string;
  readonly contactInfo?: string | null;
  readonly customerId?: string;
}

export interface CreateOpportunityInput {
  readonly name: string | null;
  readonly customerId: string;
  readonly amount: number | null;
  readonly stage: OpportunityStage;
}

export interface UpdateOpportunityInput {
  readonly name?: string | null;
  readonly customerId?: string;
  readonly amount?: number | null;
  readonly stage?: OpportunityStage;
}

/** A record the operation addressed does not exist or is outside the caller's scope. */
export class SalesNotFoundError extends Error {
  readonly code = 'SALES_NOT_FOUND';

  constructor(
    readonly resource: 'customer' | 'contact' | 'opportunity',
    readonly id: string,
  ) {
    super(`${resource} "${id}" was not found.`);
    this.name = 'SalesNotFoundError';
  }
}

/** A record the request body refers to does not exist, so the request cannot be fulfilled as written. */
export class SalesReferenceError extends Error {
  readonly code = 'SALES_REFERENCE';

  constructor(
    readonly field: string,
    readonly id: string,
  ) {
    super(`The referenced record "${id}" for "${field}" was not found.`);
    this.name = 'SalesReferenceError';
  }
}

/** A unique business value is already taken. */
export class SalesConflictError extends Error {
  readonly code = 'SALES_CONFLICT';

  constructor(
    readonly field: string,
    readonly value: string,
  ) {
    super(`"${value}" is already taken for "${field}".`);
    this.name = 'SalesConflictError';
  }
}

interface CustomerRecord {
  id: number;
  name: string;
  industry: string | null;
}

interface ContactRecord {
  id: number;
  name: string;
  contactInfo: string | null;
  customerId: number;
}

interface OpportunityRecord {
  id: number;
  name: string | null;
  customerId: number;
  amount: RepositoryMutationScalarValue;
  stage: OpportunityStage;
}

/** `q` matches a customer name, case-insensitively. */
function customerFilter(
  q?: string,
): RepositoryFilter<CustomerRecord> | undefined {
  if (!q) return undefined;
  return (f: FilterBuilder<CustomerRecord>) =>
    f.string('name').includes(q, { mode: 'insensitive' });
}

/** `q` matches a contact name or its contact info; `customerId` narrows to one customer. */
function contactFilter(
  q?: string,
  customerId?: number,
): RepositoryFilter<ContactRecord> | undefined {
  if (!q && customerId === undefined) return undefined;
  return (f: FilterBuilder<ContactRecord>) => {
    const nodes: FilterNode[] = [];
    if (q) {
      nodes.push(
        f.or([
          f.string('name').includes(q, { mode: 'insensitive' }),
          f.string('contactInfo').includes(q, { mode: 'insensitive' }),
        ]),
      );
    }
    if (customerId !== undefined) {
      nodes.push(f.number('customerId').eq(customerId));
    }
    return nodes.length === 1 ? nodes[0] : f.and(nodes);
  };
}

/** `q` matches an opportunity name; `customerId` and `stage` narrow the list. */
function opportunityFilter(
  q?: string,
  customerId?: number,
  stage?: OpportunityStage,
): RepositoryFilter<OpportunityRecord> | undefined {
  if (!q && customerId === undefined && stage === undefined) return undefined;
  return (f: FilterBuilder<OpportunityRecord>) => {
    const nodes: FilterNode[] = [];
    if (q) {
      nodes.push(f.string('name').includes(q, { mode: 'insensitive' }));
    }
    if (customerId !== undefined) {
      nodes.push(f.number('customerId').eq(customerId));
    }
    if (stage !== undefined) {
      nodes.push(f.string('stage').eq(stage));
    }
    return nodes.length === 1 ? nodes[0] : f.and(nodes);
  };
}

function toNumericId(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function toCustomer(record: CustomerRecord): CustomerView {
  return {
    id: String(record.id),
    name: record.name,
    industry: record.industry ?? null,
  };
}

function toContact(record: ContactRecord, customerName: string): ContactView {
  return {
    id: String(record.id),
    name: record.name,
    contactInfo: record.contactInfo ?? null,
    customerId: String(record.customerId),
    customerName,
  };
}

function toOpportunity(
  record: OpportunityRecord,
  customerName: string,
): OpportunityView {
  const raw = record.amount;
  const parsed = raw === null || raw === undefined ? null : Number(raw);
  return {
    id: String(record.id),
    name: record.name ?? null,
    customerId: String(record.customerId),
    customerName,
    amount: parsed !== null && Number.isFinite(parsed) ? parsed : null,
    stage: record.stage,
  };
}

/** How many related records the detail view shows; the endpoints cap a page at 100 as well. */
const DETAIL_LIMIT = 100;

/**
 * The business layer for customers, contacts and opportunities. It owns validation that depends on stored data — a
 * referenced customer, a duplicate name — reads and writes through Repository, and returns values shaped for the API.
 * It knows nothing about HTTP: failures are domain errors the route layer translates.
 */
export class SalesService {
  constructor(private readonly database: DatabaseManager) {}

  private customers(): Repository<CustomerRecord> {
    return this.database.repository<CustomerRecord>('customers');
  }

  private contacts(): Repository<ContactRecord> {
    return this.database.repository<ContactRecord>('contacts');
  }

  private opportunities(): Repository<OpportunityRecord> {
    return this.database.repository<OpportunityRecord>('opportunities');
  }

  async listCustomers({
    q,
    page,
    pageSize,
  }: ListQuery): Promise<Page<CustomerView>> {
    const repository = this.customers();
    const filter = customerFilter(q);
    const records = await repository.findMany({
      ...(filter ? { filter } : {}),
      sort: (sort) => sort.field('name').asc(),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const total = await repository.count(filter ? { filter } : undefined);
    return { rows: records.map(toCustomer), total };
  }

  async getCustomer(id: string): Promise<CustomerDetailView | undefined> {
    const customerId = toNumericId(id);
    if (customerId === undefined) return undefined;
    const record = await this.customers().findOne({
      filter: { id: customerId },
    });
    if (!record) return undefined;

    const [contactRecords, opportunityRecords, total] = await Promise.all([
      this.contacts().findMany({
        filter: { customerId },
        sort: (sort) => sort.field('id').desc(),
        limit: DETAIL_LIMIT,
      }),
      this.opportunities().findMany({
        filter: { customerId },
        sort: (sort) => sort.field('id').desc(),
        limit: DETAIL_LIMIT,
      }),
      this.opportunityTotal(customerId),
    ]);

    const customer = toCustomer(record);
    return {
      ...customer,
      contacts: contactRecords.map((contact) =>
        toContact(contact, customer.name),
      ),
      opportunities: opportunityRecords.map((opportunity) =>
        toOpportunity(opportunity, customer.name),
      ),
      opportunityTotal: total,
    };
  }

  async createCustomer(input: CreateCustomerInput): Promise<CustomerView> {
    await this.assertCustomerNameFree(input.name);
    const { record } = await this.customers().createOne({
      values: { name: input.name, industry: input.industry },
    });
    return toCustomer(record);
  }

  async updateCustomer(
    id: string,
    input: UpdateCustomerInput,
  ): Promise<CustomerView | undefined> {
    const customerId = toNumericId(id);
    if (customerId === undefined) return undefined;
    const repository = this.customers();
    if (!(await repository.exists({ filter: { id: customerId } })))
      return undefined;
    if (input.name !== undefined) {
      await this.assertCustomerNameFree(input.name, customerId);
    }
    const values: Partial<CustomerRecord> = {};
    if (input.name !== undefined) values.name = input.name;
    if (input.industry !== undefined) values.industry = input.industry;
    const { record } = await repository.updateOne({
      filter: { id: customerId },
      values,
    });
    return toCustomer(record);
  }

  async listContacts({
    q,
    customerId,
    page,
    pageSize,
  }: ListContactsQuery): Promise<Page<ContactView>> {
    const repository = this.contacts();
    const numericCustomerId =
      customerId === undefined ? undefined : toNumericId(customerId);
    const filter = contactFilter(q, numericCustomerId);
    const records = await repository.findMany({
      ...(filter ? { filter } : {}),
      sort: (sort) => sort.field('id').desc(),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const total = await repository.count(filter ? { filter } : undefined);
    const names = await this.customerNames(
      records.map((row) => row.customerId),
    );
    return {
      rows: records.map((record) =>
        toContact(record, names.get(record.customerId) ?? ''),
      ),
      total,
    };
  }

  async createContact(input: CreateContactInput): Promise<ContactView> {
    const customer = await this.resolveCustomer(input.customerId);
    const { record } = await this.contacts().createOne({
      values: {
        name: input.name,
        contactInfo: input.contactInfo,
        customerId: customer.id,
      },
    });
    return toContact(record, customer.name);
  }

  async getContact(id: string): Promise<ContactView | undefined> {
    const contactId = toNumericId(id);
    if (contactId === undefined) return undefined;
    const record = await this.contacts().findOne({
      filter: { id: contactId },
    });
    if (!record) return undefined;
    return toContact(record, await this.customerName(record.customerId));
  }

  async updateContact(
    id: string,
    input: UpdateContactInput,
  ): Promise<ContactView | undefined> {
    const contactId = toNumericId(id);
    if (contactId === undefined) return undefined;
    const repository = this.contacts();
    if (!(await repository.exists({ filter: { id: contactId } })))
      return undefined;
    const customer =
      input.customerId === undefined
        ? undefined
        : await this.resolveCustomer(input.customerId);
    const values: Partial<ContactRecord> = {};
    if (input.name !== undefined) values.name = input.name;
    if (input.contactInfo !== undefined) values.contactInfo = input.contactInfo;
    if (customer) values.customerId = customer.id;
    const { record } = await repository.updateOne({
      filter: { id: contactId },
      values,
    });
    const name =
      customer?.name ??
      (await this.customerNames([record.customerId])).get(record.customerId) ??
      '';
    return toContact(record, name);
  }

  async listOpportunities({
    q,
    customerId,
    stage,
    page,
    pageSize,
  }: ListOpportunitiesQuery): Promise<Page<OpportunityView>> {
    const repository = this.opportunities();
    const numericCustomerId =
      customerId === undefined ? undefined : toNumericId(customerId);
    const filter = opportunityFilter(q, numericCustomerId, stage);
    const records = await repository.findMany({
      ...(filter ? { filter } : {}),
      sort: (sort) => sort.field('id').desc(),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const total = await repository.count(filter ? { filter } : undefined);
    const names = await this.customerNames(
      records.map((row) => row.customerId),
    );
    return {
      rows: records.map((record) =>
        toOpportunity(record, names.get(record.customerId) ?? ''),
      ),
      total,
    };
  }

  async createOpportunity(
    input: CreateOpportunityInput,
  ): Promise<OpportunityView> {
    const customer = await this.resolveCustomer(input.customerId);
    const { record } = await this.opportunities().createOne({
      values: {
        name: input.name,
        amount: input.amount,
        stage: input.stage,
        customerId: customer.id,
      },
    });
    return toOpportunity(record, customer.name);
  }

  async getOpportunity(id: string): Promise<OpportunityView | undefined> {
    const opportunityId = toNumericId(id);
    if (opportunityId === undefined) return undefined;
    const record = await this.opportunities().findOne({
      filter: { id: opportunityId },
    });
    if (!record) return undefined;
    return toOpportunity(record, await this.customerName(record.customerId));
  }

  async updateOpportunity(
    id: string,
    input: UpdateOpportunityInput,
  ): Promise<OpportunityView | undefined> {
    const opportunityId = toNumericId(id);
    if (opportunityId === undefined) return undefined;
    const repository = this.opportunities();
    if (!(await repository.exists({ filter: { id: opportunityId } })))
      return undefined;
    const customer =
      input.customerId === undefined
        ? undefined
        : await this.resolveCustomer(input.customerId);
    const values: Partial<OpportunityRecord> = {};
    if (input.name !== undefined) values.name = input.name;
    if (input.amount !== undefined) values.amount = input.amount;
    if (input.stage !== undefined) values.stage = input.stage;
    if (customer) values.customerId = customer.id;
    const { record } = await repository.updateOne({
      filter: { id: opportunityId },
      values,
    });
    const name =
      customer?.name ??
      (await this.customerNames([record.customerId])).get(record.customerId) ??
      '';
    return toOpportunity(record, name);
  }

  /** The sum of every opportunity amount of one customer, as a JSON-ready number. */
  async opportunityTotal(customerId: number): Promise<number> {
    const result = await this.opportunities().aggregate({
      filter: { customerId },
      aggregate: (aggregate) => ({ total: aggregate.sum('amount') }),
    });
    const total = result.total;
    if (total === null || total === undefined) return 0;
    const value = Number(total);
    return Number.isFinite(value) ? value : 0;
  }

  private async resolveCustomer(
    reference: string,
  ): Promise<{ id: number; name: string }> {
    const id = toNumericId(reference);
    const record =
      id === undefined
        ? undefined
        : await this.customers().findOne({ filter: { id } });
    if (!record) throw new SalesReferenceError('customerId', reference);
    return { id: record.id, name: record.name };
  }

  private async assertCustomerNameFree(
    name: string,
    exceptId?: number,
  ): Promise<void> {
    const exists = await this.customers().exists({
      filter: (f: FilterBuilder<CustomerRecord>) =>
        exceptId === undefined
          ? f.string('name').eq(name)
          : f.and([f.string('name').eq(name), f.number('id').ne(exceptId)]),
    });
    if (exists) throw new SalesConflictError('name', name);
  }

  /** The name of one customer, or `''` when it is gone. */
  private async customerName(customerId: number): Promise<string> {
    return (await this.customerNames([customerId])).get(customerId) ?? '';
  }

  private async customerNames(
    customerIds: readonly number[],
  ): Promise<Map<number, string>> {
    const unique = [...new Set(customerIds)];
    if (unique.length === 0) return new Map();
    const records = await this.customers().findMany({
      filter: (f: FilterBuilder<CustomerRecord>) =>
        f.or(unique.map((id) => f.number('id').eq(id))),
      limit: unique.length,
    });
    return new Map(records.map((record) => [record.id, record.name]));
  }
}

export const salesServiceToken = createServiceToken<SalesService>('sales');

/** Binds the sales service to the database manager for the lifetime of the application. */
export class SalesProvider extends ServiceProvider<Application> {
  readonly name = 'sales';

  register(): void {
    this.app.container.singleton(salesServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return new SalesService(database);
    });
  }
}
