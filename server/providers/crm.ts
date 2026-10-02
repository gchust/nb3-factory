import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type RepositoryMutationScalarValue,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

/** The three stages an opportunity can be in. Stored as canonical codes; translated in the client. */
export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
}

export interface Contact {
  readonly id: number;
  readonly name: string;
  readonly contact: string | null;
  readonly customerId: number;
}

export interface Opportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  /** Expected amount, normalized to a number with at most two decimal places. */
  readonly amount: number;
  readonly stage: OpportunityStage;
}

/** What the customer detail view shows: the record, its contacts, its opportunities and the sum of their amounts. */
export interface CustomerDetail extends Customer {
  readonly contacts: Contact[];
  readonly opportunities: Opportunity[];
  /** Sum of every opportunity that belongs to this customer. Excludes other customers' opportunities. */
  readonly amountTotal: number;
}

export interface CustomerInput {
  readonly name: string;
  readonly industry?: string | null;
}

export interface ContactInput {
  readonly name: string;
  readonly contact?: string | null;
  readonly customerId: number;
}

export interface OpportunityInput {
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage?: OpportunityStage;
}

export interface ContactListInput {
  readonly customerId?: number;
}

export interface OpportunityListInput {
  readonly customerId?: number;
  readonly stage?: OpportunityStage;
}

/** An input the business rejected: a missing required field, an unknown customer, a negative amount or a bad stage. */
export class CrmValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';

  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'CrmValidationError';
  }
}

export class CrmNotFoundError extends Error {
  readonly code = 'NOT_FOUND';

  constructor(message = 'Record not found.') {
    super(message);
    this.name = 'CrmNotFoundError';
  }
}

export interface CrmService {
  listCustomers(): Promise<Customer[]>;
  getCustomer(id: number): Promise<CustomerDetail>;
  createCustomer(input: CustomerInput): Promise<Customer>;
  updateCustomer(id: number, input: Partial<CustomerInput>): Promise<Customer>;

  listContacts(input?: ContactListInput): Promise<Contact[]>;
  createContact(input: ContactInput): Promise<Contact>;
  updateContact(id: number, input: Partial<ContactInput>): Promise<Contact>;

  listOpportunities(input?: OpportunityListInput): Promise<Opportunity[]>;
  createOpportunity(input: OpportunityInput): Promise<Opportunity>;
  updateOpportunity(
    id: number,
    input: Partial<OpportunityInput>,
  ): Promise<Opportunity>;
}

export const crmServiceToken =
  createServiceToken<CrmService>('app/crm-service');

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toScalarNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value);
  return Number.NaN;
}

/** Reads a value the database hands back as text without letting an object stringify to "[object Object]". */
function toScalarText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}

function toNumber(value: unknown): number {
  const numeric = toScalarNumber(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function requireId(value: unknown, field: string): number {
  const numeric = toScalarNumber(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new CrmValidationError(field, `${field} must be a positive integer.`);
  }
  return numeric;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requireId(value, field);
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CrmValidationError(field, `${field} is required.`);
  }
  const text = value.trim();
  if (text.length > 128) {
    throw new CrmValidationError(field, `${field} is too long.`);
  }
  return text;
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new CrmValidationError(field, `${field} must be text.`);
  }
  const text = value.trim();
  if (text.length > 255) {
    throw new CrmValidationError(field, `${field} is too long.`);
  }
  return text === '' ? null : text;
}

function requireAmount(value: unknown): number {
  const numeric = toScalarNumber(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new CrmValidationError(
      'amount',
      'Expected amount must be zero or greater.',
    );
  }
  return round2(numeric);
}

function toStage(value: unknown): OpportunityStage | null {
  return typeof value === 'string' &&
    OPPORTUNITY_STAGES.includes(value as OpportunityStage)
    ? (value as OpportunityStage)
    : null;
}

function requireStage(value: unknown): OpportunityStage {
  const stage = toStage(value);
  if (!stage) {
    throw new CrmValidationError(
      'stage',
      `Stage must be one of ${OPPORTUNITY_STAGES.join(', ')}.`,
    );
  }
  return stage;
}

function toCustomer(row: Record<string, unknown>): Customer {
  return {
    id: toNumber(row.id),
    name: toScalarText(row.name),
    industry: row.industry == null ? null : toScalarText(row.industry),
  };
}

function toContact(row: Record<string, unknown>): Contact {
  return {
    id: toNumber(row.id),
    name: toScalarText(row.name),
    contact: row.contact == null ? null : toScalarText(row.contact),
    customerId: toNumber(row.customerId),
  };
}

function toOpportunity(row: Record<string, unknown>): Opportunity {
  return {
    id: toNumber(row.id),
    name: toScalarText(row.name),
    customerId: toNumber(row.customerId),
    amount: round2(toNumber(row.amount)),
    stage: toStage(row.stage) ?? 'following',
  };
}

class DefaultCrmService implements CrmService {
  constructor(private readonly database: DatabaseManager) {}

  private customers() {
    return this.database.repository('customers');
  }

  private contacts() {
    return this.database.repository('contacts');
  }

  private opportunities() {
    return this.database.repository('opportunities');
  }

  private async assertCustomerExists(customerId: number): Promise<void> {
    const customer = await this.customers().findOne({
      filter: { id: customerId },
      select: (select) => select.fields('id'),
    });
    if (!customer) {
      throw new CrmValidationError(
        'customerId',
        'The owning customer does not exist.',
      );
    }
  }

  async listCustomers(): Promise<Customer[]> {
    const rows = await this.customers().findMany({
      sort: (sort) => sort.field('id').asc(),
    });
    return rows.map(toCustomer);
  }

  async getCustomer(id: number): Promise<CustomerDetail> {
    const customer = await this.customers().findOne({ filter: { id } });
    if (!customer) {
      throw new CrmNotFoundError('Customer not found.');
    }
    const contacts = await this.listContacts({ customerId: id });
    const opportunities = await this.listOpportunities({ customerId: id });
    const amountTotal = round2(
      opportunities.reduce((sum, opportunity) => sum + opportunity.amount, 0),
    );
    return { ...toCustomer(customer), contacts, opportunities, amountTotal };
  }

  async createCustomer(input: CustomerInput): Promise<Customer> {
    const name = requireText(input.name, 'name');
    const industry = optionalText(input.industry, 'industry');
    const created = await this.customers().createOne({
      values: { name, industry },
    });
    return toCustomer(created.record);
  }

  async updateCustomer(
    id: number,
    input: Partial<CustomerInput>,
  ): Promise<Customer> {
    await this.getCustomer(id);
    const values: Record<string, RepositoryMutationScalarValue> = {};
    if (input.name !== undefined) values.name = requireText(input.name, 'name');
    if (input.industry !== undefined) {
      values.industry = optionalText(input.industry, 'industry');
    }
    if (Object.keys(values).length > 0) {
      await this.customers().updateOne({ filter: { id }, values });
    }
    return toCustomer({
      ...(await this.customers().findOne({ filter: { id } })),
    });
  }

  async listContacts(input: ContactListInput = {}): Promise<Contact[]> {
    const customerId = optionalInteger(input.customerId, 'customerId');
    const rows = await this.contacts().findMany({
      filter: customerId === undefined ? undefined : { customerId },
      sort: (sort) => sort.field('id').asc(),
    });
    return rows.map(toContact);
  }

  async createContact(input: ContactInput): Promise<Contact> {
    const name = requireText(input.name, 'name');
    const contact = optionalText(input.contact, 'contact');
    const customerId = requireId(input.customerId, 'customerId');
    await this.assertCustomerExists(customerId);
    const created = await this.contacts().createOne({
      values: { name, contact, customerId },
    });
    return toContact(created.record);
  }

  async updateContact(
    id: number,
    input: Partial<ContactInput>,
  ): Promise<Contact> {
    const existing = await this.contacts().findOne({ filter: { id } });
    if (!existing) throw new CrmNotFoundError('Contact not found.');
    const values: Record<string, RepositoryMutationScalarValue> = {};
    if (input.name !== undefined) values.name = requireText(input.name, 'name');
    if (input.contact !== undefined) {
      values.contact = optionalText(input.contact, 'contact');
    }
    if (input.customerId !== undefined) {
      const customerId = requireId(input.customerId, 'customerId');
      await this.assertCustomerExists(customerId);
      values.customerId = customerId;
    }
    if (Object.keys(values).length > 0) {
      await this.contacts().updateOne({ filter: { id }, values });
    }
    const updated = await this.contacts().findOne({ filter: { id } });
    return toContact({ ...updated });
  }

  async listOpportunities(
    input: OpportunityListInput = {},
  ): Promise<Opportunity[]> {
    const customerId = optionalInteger(input.customerId, 'customerId');
    const stage =
      input.stage === undefined || input.stage === null
        ? undefined
        : requireStage(input.stage);
    const rows = await this.opportunities().findMany({
      filter:
        customerId === undefined && stage === undefined
          ? undefined
          : {
              ...(customerId === undefined ? {} : { customerId }),
              ...(stage === undefined ? {} : { stage }),
            },
      sort: (sort) => sort.field('id').asc(),
    });
    return rows.map(toOpportunity);
  }

  async createOpportunity(input: OpportunityInput): Promise<Opportunity> {
    const name = requireText(input.name, 'name');
    const customerId = requireId(input.customerId, 'customerId');
    await this.assertCustomerExists(customerId);
    const amount = requireAmount(input.amount);
    const stage = requireStage(input.stage ?? 'following');
    const created = await this.opportunities().createOne({
      values: { name, customerId, amount, stage },
    });
    return toOpportunity(created.record);
  }

  async updateOpportunity(
    id: number,
    input: Partial<OpportunityInput>,
  ): Promise<Opportunity> {
    const existing = await this.opportunities().findOne({ filter: { id } });
    if (!existing) throw new CrmNotFoundError('Opportunity not found.');
    const values: Record<string, RepositoryMutationScalarValue> = {};
    if (input.name !== undefined) values.name = requireText(input.name, 'name');
    if (input.customerId !== undefined) {
      const customerId = requireId(input.customerId, 'customerId');
      await this.assertCustomerExists(customerId);
      values.customerId = customerId;
    }
    if (input.amount !== undefined) values.amount = requireAmount(input.amount);
    if (input.stage !== undefined) values.stage = requireStage(input.stage);
    if (Object.keys(values).length > 0) {
      await this.opportunities().updateOne({ filter: { id }, values });
    }
    const updated = await this.opportunities().findOne({ filter: { id } });
    return toOpportunity({ ...updated });
  }
}

export class CrmProvider extends ServiceProvider<Application> {
  readonly name = 'app/crm-provider';

  register(): void {
    this.app.container.singleton(crmServiceToken, (container) => {
      return new DefaultCrmService(
        container.resolve<DatabaseManager>(databaseManagerToken),
      );
    });
  }
}

export function createCrmService(database: DatabaseManager): CrmService {
  return new DefaultCrmService(database);
}
