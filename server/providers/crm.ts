import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** The only stages a sales opportunity may be in. */
export const CRM_STAGES = ['follow_up', 'won', 'lost'] as const;

export type CrmStage = (typeof CRM_STAGES)[number];

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
}

export interface CustomerRef {
  readonly id: number;
  readonly name: string;
}

export interface Contact {
  readonly id: number;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly customerId: number;
  readonly customer: CustomerRef | null;
}

export interface Opportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: CrmStage;
  readonly customer: CustomerRef | null;
}

export interface CustomerDetail {
  readonly customer: Customer;
  readonly contacts: readonly Contact[];
  readonly opportunities: readonly Opportunity[];
  /** Sum of the expected amounts of this customer's opportunities only. */
  readonly opportunityTotal: number;
}

export interface CustomerInput {
  readonly name?: unknown;
  readonly industry?: unknown;
}

export interface ContactInput {
  readonly name?: unknown;
  readonly phone?: unknown;
  readonly email?: unknown;
  readonly customerId?: unknown;
}

export interface OpportunityInput {
  readonly name?: unknown;
  readonly customerId?: unknown;
  readonly amount?: unknown;
  readonly stage?: unknown;
}

export interface ListQuery {
  readonly search?: string;
  readonly stage?: string;
  readonly customerId?: number;
}

/**
 * A business rule rejected the request. `field` names the input the caller
 * should point the user at; the client turns it into localized copy.
 */
export class CrmValidationError extends Error {
  public readonly code: string = 'CRM_VALIDATION_FAILED';

  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'CrmValidationError';
  }
}

/** The requested record does not exist. */
export class CrmNotFoundError extends Error {
  public readonly code: string = 'CRM_NOT_FOUND';

  constructor(public readonly resource: string) {
    super(`${resource} was not found.`);
    this.name = 'CrmNotFoundError';
  }
}

export interface CrmService {
  listCustomers(query?: ListQuery): Promise<Customer[]>;
  getCustomer(id: number): Promise<CustomerDetail | undefined>;
  createCustomer(input: CustomerInput): Promise<Customer>;
  updateCustomer(id: number, input: CustomerInput): Promise<Customer>;

  listContacts(query?: ListQuery): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  createContact(input: ContactInput): Promise<Contact>;
  updateContact(id: number, input: ContactInput): Promise<Contact>;

  listOpportunities(query?: ListQuery): Promise<Opportunity[]>;
  getOpportunity(id: number): Promise<Opportunity | undefined>;
  createOpportunity(input: OpportunityInput): Promise<Opportunity>;
  updateOpportunity(id: number, input: OpportunityInput): Promise<Opportunity>;
}

const MAX_NAME = 255;
const MAX_INDUSTRY = 128;
const MAX_PHONE = 64;
const MAX_EMAIL = 255;

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CrmValidationError(field, `${field} is required.`);
  }
  const text = value.trim();
  if (text.length > MAX_NAME) {
    throw new CrmValidationError(
      field,
      `${field} must be at most ${MAX_NAME} characters.`,
    );
  }
  return text;
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new CrmValidationError(field, `${field} must be text.`);
  }
  const text = value.trim();
  if (text === '') return null;
  if (text.length > maxLength) {
    throw new CrmValidationError(
      field,
      `${field} must be at most ${maxLength} characters.`,
    );
  }
  return text;
}

/** `undefined` means the field was not sent, which a partial update keeps. */
function optionalRequiredText(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(value, field);
}

function requiredId(value: unknown, field: string): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed <= 0) {
    throw new CrmValidationError(field, `${field} must be a positive integer.`);
  }
  return parsed;
}

function optionalId(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  return requiredId(value, field);
}

function requiredAmount(value: unknown, field: string): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new CrmValidationError(field, `${field} must be a number.`);
  }
  if (parsed < 0) {
    throw new CrmValidationError(field, `${field} must not be negative.`);
  }
  return Math.round(parsed * 100) / 100;
}

function optionalAmount(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  return requiredAmount(value, field);
}

function requiredStage(value: unknown, field: string): CrmStage {
  if (
    typeof value !== 'string' ||
    !(CRM_STAGES as readonly string[]).includes(value)
  ) {
    throw new CrmValidationError(
      field,
      `${field} must be one of: ${CRM_STAGES.join(', ')}.`,
    );
  }
  return value as CrmStage;
}

function optionalStage(value: unknown, field: string): CrmStage | undefined {
  if (value === undefined) return undefined;
  return requiredStage(value, field);
}

function toCustomer(record: {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
}): Customer {
  return { id: record.id, name: record.name, industry: record.industry };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createCrmService(database: DatabaseManager): CrmService {
  const customers = database.repository<Customer>('customers');
  const contacts = database.repository<Contact>('contacts');
  const opportunities = database.repository<Opportunity>('opportunities');

  async function assertCustomerExists(id: number): Promise<void> {
    const exists = await customers.exists({ filter: { id } });
    if (!exists) {
      throw new CrmValidationError(
        'customerId',
        'The selected customer does not exist.',
      );
    }
  }

  function customerRef(
    value: { readonly id: number; readonly name: string } | null | undefined,
  ): CustomerRef | null {
    return value ? { id: value.id, name: value.name } : null;
  }

  async function listContactsInternal(customerId?: number): Promise<Contact[]> {
    const rows = await contacts.findMany({
      ...(customerId === undefined ? {} : { filter: { customerId } }),
      sort: (sort) => sort.field('id').asc(),
      select: (select) =>
        select
          .fields('id', 'name', 'phone', 'email', 'customerId')
          .include('customer', (relation) => relation.fields('id', 'name')),
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      customerId: row.customerId,
      customer: customerRef(row.customer),
    }));
  }

  async function listOpportunitiesInternal(
    customerId?: number,
  ): Promise<Opportunity[]> {
    const rows = await opportunities.findMany({
      ...(customerId === undefined ? {} : { filter: { customerId } }),
      sort: (sort) => sort.field('id').asc(),
      select: (select) =>
        select
          .fields('id', 'name', 'customerId', 'amount', 'stage')
          .include('customer', (relation) => relation.fields('id', 'name')),
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      customerId: row.customerId,
      amount: Number(row.amount),
      stage: row.stage,
      customer: customerRef(row.customer),
    }));
  }

  async function findContact(id: number): Promise<Contact | undefined> {
    const rows = await contacts.findMany({
      filter: { id },
      select: (select) =>
        select
          .fields('id', 'name', 'phone', 'email', 'customerId')
          .include('customer', (relation) => relation.fields('id', 'name')),
    });
    const row = rows[0];
    return row
      ? {
          id: row.id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          customerId: row.customerId,
          customer: customerRef(row.customer),
        }
      : undefined;
  }

  async function findOpportunity(id: number): Promise<Opportunity | undefined> {
    const rows = await opportunities.findMany({
      filter: { id },
      select: (select) =>
        select
          .fields('id', 'name', 'customerId', 'amount', 'stage')
          .include('customer', (relation) => relation.fields('id', 'name')),
    });
    const row = rows[0];
    return row
      ? {
          id: row.id,
          name: row.name,
          customerId: row.customerId,
          amount: Number(row.amount),
          stage: row.stage,
          customer: customerRef(row.customer),
        }
      : undefined;
  }

  return {
    async listCustomers(query) {
      const search = query?.search?.trim();
      const rows = await customers.findMany({
        ...(search
          ? {
              filter: (filter) =>
                filter.and([filter.string('name').includes(search)]),
            }
          : {}),
        sort: (sort) => sort.field('id').asc(),
      });
      return rows.map(toCustomer);
    },

    async getCustomer(id) {
      const customer = await customers.findOne({ filter: { id } });
      if (!customer) return undefined;
      const [customerContacts, customerOpportunities] = await Promise.all([
        listContactsInternal(id),
        listOpportunitiesInternal(id),
      ]);
      const aggregate = await opportunities.aggregate({
        filter: { customerId: id },
        aggregate: (builder) => ({ total: builder.sum('amount') }),
      });
      const rawTotal = aggregate.total;
      const opportunityTotal = round2(
        rawTotal === null || rawTotal === undefined ? 0 : Number(rawTotal),
      );
      return {
        customer: toCustomer(customer),
        contacts: customerContacts,
        opportunities: customerOpportunities,
        opportunityTotal,
      };
    },

    async createCustomer(input) {
      const created = await customers.createOne({
        values: {
          name: requiredText(input.name, 'name'),
          industry: optionalText(input.industry, 'industry', MAX_INDUSTRY),
        },
      });
      return toCustomer(created.record);
    },

    async updateCustomer(id, input) {
      const existing = await customers.findOne({ filter: { id } });
      if (!existing) throw new CrmNotFoundError('Customer');
      const name = optionalRequiredText(input.name, 'name');
      const updated = await customers.updateOne({
        filter: { id },
        values: {
          ...(name === undefined ? {} : { name }),
          ...(input.industry === undefined
            ? {}
            : {
                industry: optionalText(
                  input.industry,
                  'industry',
                  MAX_INDUSTRY,
                ),
              }),
        },
      });
      return toCustomer(updated.record);
    },

    async listContacts(query) {
      const search = query?.search?.trim();
      const customerId = query?.customerId;
      const rows = await contacts.findMany({
        ...(customerId === undefined && !search
          ? {}
          : {
              filter: (filter) => {
                const conditions = [
                  ...(customerId === undefined
                    ? []
                    : [filter.number('customerId').eq(customerId)]),
                  ...(search ? [filter.string('name').includes(search)] : []),
                ];
                return conditions.length === 1
                  ? conditions[0]
                  : filter.and(conditions);
              },
            }),
        sort: (sort) => sort.field('id').asc(),
        select: (select) =>
          select
            .fields('id', 'name', 'phone', 'email', 'customerId')
            .include('customer', (relation) => relation.fields('id', 'name')),
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        customerId: row.customerId,
        customer: customerRef(row.customer),
      }));
    },

    async getContact(id) {
      return findContact(id);
    },

    async createContact(input) {
      const customerId = requiredId(input.customerId, 'customerId');
      await assertCustomerExists(customerId);
      const created = await contacts.createOne({
        values: {
          name: requiredText(input.name, 'name'),
          phone: optionalText(input.phone, 'phone', MAX_PHONE),
          email: optionalText(input.email, 'email', MAX_EMAIL),
          customerId,
        },
      });
      const contact = await findContact(created.record.id);
      if (!contact) throw new CrmNotFoundError('Contact');
      return contact;
    },

    async updateContact(id, input) {
      const existing = await contacts.findOne({ filter: { id } });
      if (!existing) throw new CrmNotFoundError('Contact');
      const name = optionalRequiredText(input.name, 'name');
      const customerId = optionalId(input.customerId, 'customerId');
      if (customerId !== undefined) await assertCustomerExists(customerId);
      await contacts.updateOne({
        filter: { id },
        values: {
          ...(name === undefined ? {} : { name }),
          ...(input.phone === undefined
            ? {}
            : { phone: optionalText(input.phone, 'phone', MAX_PHONE) }),
          ...(input.email === undefined
            ? {}
            : { email: optionalText(input.email, 'email', MAX_EMAIL) }),
          ...(customerId === undefined ? {} : { customerId }),
        },
      });
      const contact = await findContact(id);
      if (!contact) throw new CrmNotFoundError('Contact');
      return contact;
    },

    async listOpportunities(query) {
      const search = query?.search?.trim();
      const customerId = query?.customerId;
      const stage =
        query?.stage === undefined
          ? undefined
          : requiredStage(query.stage, 'stage');
      const rows = await opportunities.findMany({
        ...(customerId === undefined && !search && stage === undefined
          ? {}
          : {
              filter: (filter) => {
                const conditions = [
                  ...(customerId === undefined
                    ? []
                    : [filter.number('customerId').eq(customerId)]),
                  ...(search ? [filter.string('name').includes(search)] : []),
                  ...(stage === undefined
                    ? []
                    : [filter.string('stage').eq(stage)]),
                ];
                return conditions.length === 1
                  ? conditions[0]
                  : filter.and(conditions);
              },
            }),
        sort: (sort) => sort.field('id').asc(),
        select: (select) =>
          select
            .fields('id', 'name', 'customerId', 'amount', 'stage')
            .include('customer', (relation) => relation.fields('id', 'name')),
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        customerId: row.customerId,
        amount: Number(row.amount),
        stage: row.stage,
        customer: customerRef(row.customer),
      }));
    },

    async getOpportunity(id) {
      return findOpportunity(id);
    },

    async createOpportunity(input) {
      const customerId = requiredId(input.customerId, 'customerId');
      await assertCustomerExists(customerId);
      const created = await opportunities.createOne({
        values: {
          name: requiredText(input.name, 'name'),
          customerId,
          amount: requiredAmount(input.amount, 'amount'),
          stage:
            input.stage === undefined
              ? 'follow_up'
              : requiredStage(input.stage, 'stage'),
        },
      });
      const opportunity = await findOpportunity(created.record.id);
      if (!opportunity) throw new CrmNotFoundError('Opportunity');
      return opportunity;
    },

    async updateOpportunity(id, input) {
      const existing = await opportunities.findOne({ filter: { id } });
      if (!existing) throw new CrmNotFoundError('Opportunity');
      const name = optionalRequiredText(input.name, 'name');
      const customerId = optionalId(input.customerId, 'customerId');
      if (customerId !== undefined) await assertCustomerExists(customerId);
      const amount = optionalAmount(input.amount, 'amount');
      const stage = optionalStage(input.stage, 'stage');
      await opportunities.updateOne({
        filter: { id },
        values: {
          ...(name === undefined ? {} : { name }),
          ...(customerId === undefined ? {} : { customerId }),
          ...(amount === undefined ? {} : { amount }),
          ...(stage === undefined ? {} : { stage }),
        },
      });
      const opportunity = await findOpportunity(id);
      if (!opportunity) throw new CrmNotFoundError('Opportunity');
      return opportunity;
    },
  };
}

export const crmServiceToken: ServiceToken<CrmService> =
  createServiceToken<CrmService>('nb3-factory/crm');

/** Binds the CRM service to the application's database. */
export class CrmProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nb3-factory/crm';

  public override register(): void {
    this.app.container.singleton(crmServiceToken, () =>
      createCrmService(this.app.container.resolve(databaseManagerToken)),
    );
  }
}

export default CrmProvider;
