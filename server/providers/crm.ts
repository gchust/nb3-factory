import { randomUUID } from 'node:crypto';

import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type {
  FilterBuilder,
  FilterNode,
  RepositoryFilter,
} from '@nocobase/repository-input';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

/**
 * The stages an opportunity moves through, in pipeline order.
 *
 * These are the stored values, not the displayed ones: the interface translates
 * each of them, so the API contract and the database stay language independent.
 */
export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

/** How many child records one customer's detail response carries. */
export const CUSTOMER_DETAIL_CHILD_LIMIT = 100;

export const DEFAULT_PAGE_SIZE = 20;

export const MAX_PAGE_SIZE = 100;

export type CrmErrorCode =
  /** The addressed record does not exist. */
  | 'CUSTOMER_NOT_FOUND'
  | 'CONTACT_NOT_FOUND'
  | 'OPPORTUNITY_NOT_FOUND'
  /** A request body names a customer that does not exist. */
  | 'INVALID_CUSTOMER_REFERENCE';

/**
 * A domain failure the route translates into a response. It carries no HTTP
 * status: what status a failure deserves is the route's concern, not the
 * service's.
 */
export class CrmError extends Error {
  readonly code: CrmErrorCode;

  constructor(code: CrmErrorCode, message: string) {
    super(message);
    this.name = 'CrmError';
    this.code = code;
  }
}

export interface CustomerView {
  id: string;
  name: string;
  industry: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactView {
  id: string;
  name: string;
  contact: string | null;
  customerId: string;
  customerName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityView {
  id: string;
  name: string;
  customerId: string;
  customerName: string | null;
  amount: number;
  stage: OpportunityStage;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetailView extends CustomerView {
  contacts: ContactView[];
  opportunities: OpportunityView[];
  /**
   * The sum of every opportunity this customer owns, computed over the
   * customer's rows alone — so it cannot drift from `opportunities`, which the
   * response caps at {@link CUSTOMER_DETAIL_CHILD_LIMIT}.
   */
  opportunityAmountTotal: number;
}

export interface CrmPage<TItem> {
  items: TItem[];
  total: number;
}

export interface ListCustomersInput {
  q?: string;
  page: number;
  pageSize: number;
}

export interface ListContactsInput {
  q?: string;
  customerId?: string;
  page: number;
  pageSize: number;
}

export interface ListOpportunitiesInput {
  q?: string;
  customerId?: string;
  stage?: OpportunityStage;
  page: number;
  pageSize: number;
}

export interface CreateCustomerInput {
  name: string;
  industry: string | null;
}

export interface UpdateCustomerInput {
  name?: string;
  industry?: string | null;
}

export interface CreateContactInput {
  name: string;
  contact: string | null;
  customerId: string;
}

export interface UpdateContactInput {
  name?: string;
  contact?: string | null;
  customerId?: string;
}

export interface CreateOpportunityInput {
  name: string;
  customerId: string;
  amount: number;
  stage: OpportunityStage;
}

export interface UpdateOpportunityInput {
  name?: string;
  customerId?: string;
  amount?: number;
  stage?: OpportunityStage;
}

/**
 * Rows as the Repository returns them. Timestamps are the canonical
 * `datetimeTz` strings the driver layer normalizes to. `amount` is a number on
 * engines that decode decimals into one and the exact text on those that do
 * not; both are read through `Number()`.
 *
 * The optional `customer` is the relation an `include` adds, declared here so
 * the relation read is typed rather than reached through an index signature.
 */
interface CustomerRow {
  id: string;
  name: string;
  industry: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CustomerRef {
  id: string;
  name: string;
}

interface ContactRow {
  id: string;
  name: string;
  contact: string | null;
  customerId: string;
  createdAt: string;
  updatedAt: string;
  customer?: CustomerRef | null;
}

interface OpportunityRow {
  id: string;
  name: string;
  customerId: string;
  amount: number | string;
  stage: OpportunityStage;
  createdAt: string;
  updatedAt: string;
  customer?: CustomerRef | null;
}

function toCustomerView(row: CustomerRow): CustomerView {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toContactView(row: ContactRow): ContactView {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact ?? null,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toOpportunityView(row: OpportunityRow): OpportunityView {
  return {
    id: row.id,
    name: row.name,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    amount: Number(row.amount),
    stage: row.stage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** A trimmed search term, or `undefined` when nothing was searched for. */
function searchTerm(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

function pagination(input: { page: number; pageSize: number }): {
  limit: number;
  offset: number;
} {
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(input.pageSize)),
  );
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

/** Drop keys a caller did not supply, so a patch never writes `undefined`. */
function providedValues<TValues extends object>(
  input: TValues,
): Partial<TValues> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<TValues>;
}

/**
 * The application's customers, contacts and opportunities.
 *
 * Everything here is a domain decision made against the database. HTTP status,
 * pagination parameters and request validation belong to the routes that call
 * it.
 */
export class CrmService {
  constructor(private readonly database: DatabaseManager) {}

  private get customers() {
    return this.database.repository<CustomerRow>('customers');
  }

  private get contacts() {
    return this.database.repository<ContactRow>('contacts');
  }

  private get opportunities() {
    return this.database.repository<OpportunityRow>('opportunities');
  }

  /**
   * Resolve one customer's name for a write response.
   *
   * A write returns the row it stored, without the relation read that a select
   * would have added, so the name is fetched explicitly.
   */
  private async findCustomerRef(
    customerId: string,
  ): Promise<CustomerRef | undefined> {
    const row = await this.customers.findOne({
      filter: { id: customerId },
      select: (select) => select.fields('id', 'name'),
    });
    return row ? { id: row.id, name: row.name } : undefined;
  }

  private async requireCustomerRef(customerId: string): Promise<CustomerRef> {
    const customer = await this.findCustomerRef(customerId);
    if (!customer) {
      throw new CrmError(
        'INVALID_CUSTOMER_REFERENCE',
        `Customer "${customerId}" does not exist.`,
      );
    }
    return customer;
  }

  private customerFilter(
    input: ListCustomersInput,
  ): RepositoryFilter<CustomerRow> | undefined {
    const q = searchTerm(input.q);
    if (!q) {
      return undefined;
    }
    return (filter) =>
      filter.string('name').includes(q, { mode: 'insensitive' });
  }

  private contactFilter(
    input: ListContactsInput,
  ): RepositoryFilter<ContactRow> | undefined {
    const q = searchTerm(input.q);
    const customerId = input.customerId;
    if (!q && !customerId) {
      return undefined;
    }
    return (filter: FilterBuilder<ContactRow>) => {
      const conditions: FilterNode[] = [];
      if (q) {
        conditions.push(
          filter.or([
            filter.string('name').includes(q, { mode: 'insensitive' }),
            filter.string('contact').includes(q, { mode: 'insensitive' }),
          ]),
        );
      }
      if (customerId) {
        conditions.push(filter.string('customerId').eq(customerId));
      }
      return filter.and(conditions);
    };
  }

  private opportunityFilter(
    input: ListOpportunitiesInput,
  ): RepositoryFilter<OpportunityRow> | undefined {
    const q = searchTerm(input.q);
    const customerId = input.customerId;
    const stage = input.stage;
    if (!q && !customerId && !stage) {
      return undefined;
    }
    return (filter: FilterBuilder<OpportunityRow>) => {
      const conditions: FilterNode[] = [];
      if (q) {
        conditions.push(
          filter.string('name').includes(q, { mode: 'insensitive' }),
        );
      }
      if (customerId) {
        conditions.push(filter.string('customerId').eq(customerId));
      }
      if (stage) {
        conditions.push(filter.string('stage').eq(stage));
      }
      return filter.and(conditions);
    };
  }

  async listCustomers(
    input: ListCustomersInput,
  ): Promise<CrmPage<CustomerView>> {
    const filter = this.customerFilter(input);
    const { limit, offset } = pagination(input);
    const rows = await this.customers.findMany({
      filter,
      sort: (sort) => sort.field('createdAt').desc(),
      limit,
      offset,
    });
    const total = await this.customers.count({ filter });
    return { items: rows.map(toCustomerView), total };
  }

  async getCustomer(customerId: string): Promise<CustomerDetailView> {
    const row = await this.customers.findOne({ filter: { id: customerId } });
    if (!row) {
      throw new CrmError(
        'CUSTOMER_NOT_FOUND',
        `Customer "${customerId}" does not exist.`,
      );
    }
    const childPage = { page: 1, pageSize: CUSTOMER_DETAIL_CHILD_LIMIT };
    const [contacts, opportunities, totals] = await Promise.all([
      this.listContacts({ customerId, ...childPage }),
      this.listOpportunities({ customerId, ...childPage }),
      this.opportunities.aggregate({
        filter: { customerId },
        aggregate: (aggregate) => ({ total: aggregate.sum('amount') }),
      }),
    ]);
    return {
      ...toCustomerView(row),
      contacts: contacts.items,
      opportunities: opportunities.items,
      opportunityAmountTotal: Number(totals.total ?? 0),
    };
  }

  async createCustomer(input: CreateCustomerInput): Promise<CustomerView> {
    const timestamp = new Date().toISOString();
    const result = await this.customers.createOne({
      values: {
        id: randomUUID(),
        name: input.name,
        industry: input.industry,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    return toCustomerView(result.record);
  }

  async updateCustomer(
    customerId: string,
    input: UpdateCustomerInput,
  ): Promise<CustomerView> {
    const existing = await this.customers.findOne({
      filter: { id: customerId },
      select: (select) => select.fields('id'),
    });
    if (!existing) {
      throw new CrmError(
        'CUSTOMER_NOT_FOUND',
        `Customer "${customerId}" does not exist.`,
      );
    }
    const result = await this.customers.updateOne({
      filter: { id: customerId },
      values: {
        ...providedValues(input),
        updatedAt: new Date().toISOString(),
      },
    });
    return toCustomerView(result.record);
  }

  async listContacts(input: ListContactsInput): Promise<CrmPage<ContactView>> {
    const filter = this.contactFilter(input);
    const { limit, offset } = pagination(input);
    const rows = await this.contacts.findMany({
      filter,
      select: (select) =>
        select.include('customer', (customer) => customer.fields('id', 'name')),
      sort: (sort) => sort.field('createdAt').desc(),
      limit,
      offset,
    });
    const total = await this.contacts.count({ filter });
    return { items: rows.map(toContactView), total };
  }

  async getContact(contactId: string): Promise<ContactView> {
    const row = await this.contacts.findOne({
      filter: { id: contactId },
      select: (select) =>
        select.include('customer', (customer) => customer.fields('id', 'name')),
    });
    if (!row) {
      throw new CrmError(
        'CONTACT_NOT_FOUND',
        `Contact "${contactId}" does not exist.`,
      );
    }
    return toContactView(row);
  }

  async createContact(input: CreateContactInput): Promise<ContactView> {
    const customer = await this.requireCustomerRef(input.customerId);
    const timestamp = new Date().toISOString();
    const result = await this.contacts.createOne({
      values: {
        id: randomUUID(),
        name: input.name,
        contact: input.contact,
        customerId: input.customerId,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    return toContactView({ ...result.record, customer });
  }

  async updateContact(
    contactId: string,
    input: UpdateContactInput,
  ): Promise<ContactView> {
    const existing = await this.contacts.findOne({
      filter: { id: contactId },
      select: (select) => select.fields('id', 'customerId'),
    });
    if (!existing) {
      throw new CrmError(
        'CONTACT_NOT_FOUND',
        `Contact "${contactId}" does not exist.`,
      );
    }
    const customer = await this.requireCustomerRef(
      input.customerId ?? existing.customerId,
    );
    const result = await this.contacts.updateOne({
      filter: { id: contactId },
      values: {
        ...providedValues(input),
        updatedAt: new Date().toISOString(),
      },
    });
    return toContactView({ ...result.record, customer });
  }

  async listOpportunities(
    input: ListOpportunitiesInput,
  ): Promise<CrmPage<OpportunityView>> {
    const filter = this.opportunityFilter(input);
    const { limit, offset } = pagination(input);
    const rows = await this.opportunities.findMany({
      filter,
      select: (select) =>
        select.include('customer', (customer) => customer.fields('id', 'name')),
      sort: (sort) => sort.field('createdAt').desc(),
      limit,
      offset,
    });
    const total = await this.opportunities.count({ filter });
    return { items: rows.map(toOpportunityView), total };
  }

  async getOpportunity(opportunityId: string): Promise<OpportunityView> {
    const row = await this.opportunities.findOne({
      filter: { id: opportunityId },
      select: (select) =>
        select.include('customer', (customer) => customer.fields('id', 'name')),
    });
    if (!row) {
      throw new CrmError(
        'OPPORTUNITY_NOT_FOUND',
        `Opportunity "${opportunityId}" does not exist.`,
      );
    }
    return toOpportunityView(row);
  }

  async createOpportunity(
    input: CreateOpportunityInput,
  ): Promise<OpportunityView> {
    const customer = await this.requireCustomerRef(input.customerId);
    const timestamp = new Date().toISOString();
    const result = await this.opportunities.createOne({
      values: {
        id: randomUUID(),
        name: input.name,
        customerId: input.customerId,
        amount: input.amount,
        stage: input.stage,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    return toOpportunityView({ ...result.record, customer });
  }

  async updateOpportunity(
    opportunityId: string,
    input: UpdateOpportunityInput,
  ): Promise<OpportunityView> {
    const existing = await this.opportunities.findOne({
      filter: { id: opportunityId },
      select: (select) => select.fields('id', 'customerId'),
    });
    if (!existing) {
      throw new CrmError(
        'OPPORTUNITY_NOT_FOUND',
        `Opportunity "${opportunityId}" does not exist.`,
      );
    }
    const customer = await this.requireCustomerRef(
      input.customerId ?? existing.customerId,
    );
    const result = await this.opportunities.updateOne({
      filter: { id: opportunityId },
      values: {
        ...providedValues(input),
        updatedAt: new Date().toISOString(),
      },
    });
    return toOpportunityView({ ...result.record, customer });
  }
}

export const crmServiceToken =
  createServiceToken<CrmService>('app/crm-service');

/** Bind the application's CRM service to its token. */
export class CrmProvider extends ServiceProvider<Application> {
  readonly name = 'app/crm';

  register(): void {
    this.app.container.singleton(
      crmServiceToken,
      (resolver) => new CrmService(resolver.resolve(databaseManagerToken)),
    );
  }
}
