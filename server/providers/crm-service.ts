import type { DatabaseManager, Repository } from '@nocobase/db';

/**
 * Business logic for the simple CRM feature. The HTTP route layer translates
 * requests and responses; this module owns validation, duplicate detection,
 * record scoping and the aggregate behind a customer's opportunity total.
 *
 * The service only sees typed values and returns plain records or view objects.
 * It never reads a request, returns a status code, or decides how an error is
 * presented.
 */

export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export interface CustomerRecord {
  id: number;
  name: string;
  industry: string | null;
  createdAt: Date | string;
}

export interface ContactRecord {
  id: number;
  name: string;
  contactInfo: string | null;
  customerId: number;
  createdAt: Date | string;
}

export interface OpportunityRecord {
  id: number;
  name: string;
  customerId: number;
  amount: number | string;
  stage: OpportunityStage;
  createdAt: Date | string;
}

export interface CustomerView extends CustomerRecord {
  readonly contactCount: number;
  readonly opportunityCount: number;
  readonly totalAmount: number;
}

export interface ContactView extends ContactRecord {
  readonly customerName: string | null;
}

export interface OpportunityView extends OpportunityRecord {
  readonly amount: number;
  readonly customerName: string | null;
}

export interface CustomerDetailView extends CustomerView {
  readonly contacts: readonly ContactView[];
  readonly opportunities: readonly OpportunityView[];
}

/** A field the caller got wrong. `code` lets the form point at a field. */
export class CrmValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CrmValidationError';
    this.code = code;
  }
}

/** A record already exists under the same unique business value. */
export class CrmDuplicateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrmDuplicateError';
  }
}

/** The addressed record does not exist. */
export class CrmNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrmNotFoundError';
  }
}

const NUMBER_FROM_DECIMAL = (value: number | string | null): number => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Reads a required, trimmed, length-bounded string. An empty or missing value
 * raises `CrmValidationError` carrying the field-level `code`.
 */
function requiredString(
  value: unknown,
  code: string,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw new CrmValidationError(code, 'A value is required.');
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new CrmValidationError(code, 'A non-empty value is required.');
  }
  if (trimmed.length > maxLength) {
    throw new CrmValidationError(
      code,
      `The value may not be longer than ${maxLength} characters.`,
    );
  }
  return trimmed;
}

/** Reads an optional, trimmed, length-bounded string; blank becomes `null`. */
function optionalString(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new CrmValidationError('INVALID_VALUE', 'The value must be text.');
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new CrmValidationError(
      'INVALID_VALUE',
      `The value may not be longer than ${maxLength} characters.`,
    );
  }
  return trimmed;
}

/** Reads a positive integer relation id. */
function requiredId(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CrmValidationError(
      'CUSTOMER_REQUIRED',
      'A customer must be selected.',
    );
  }
  return parsed;
}

/** Reads a non-negative amount, rounded to two decimals. */
function requiredAmount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CrmValidationError(
      'AMOUNT_INVALID',
      'The amount must be zero or greater.',
    );
  }
  return Math.round(parsed * 100) / 100;
}

/** Reads an opportunity stage; a missing value defaults to the first stage. */
function requiredStage(value: unknown): OpportunityStage {
  if (value === undefined || value === null || value === '') {
    return 'following';
  }
  if (
    typeof value === 'string' &&
    (OPPORTUNITY_STAGES as readonly string[]).includes(value)
  ) {
    return value as OpportunityStage;
  }
  throw new CrmValidationError('STAGE_INVALID', 'The stage is not valid.');
}

export class CrmService {
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

  private async customerNames(): Promise<Map<number, string>> {
    const records = await this.customers().findMany();
    return new Map(records.map((record) => [record.id, record.name]));
  }

  private async requireCustomer(customerId: number): Promise<void> {
    const record = await this.customers().findOne({
      filter: { id: customerId },
    });
    if (!record) {
      throw new CrmValidationError(
        'CUSTOMER_REQUIRED',
        'The selected customer does not exist.',
      );
    }
  }

  async listCustomers(): Promise<CustomerView[]> {
    const [records, contactStats, opportunityStats] = await Promise.all([
      this.customers().findMany({
        sort: (sort) => sort.field('createdAt').asc(),
      }),
      this.contacts().groupBy({
        by: ['customerId'],
        aggregate: (aggregate) => ({ count: aggregate.count() }),
      }),
      this.opportunities().groupBy({
        by: ['customerId'],
        aggregate: (aggregate) => ({
          count: aggregate.count(),
          total: aggregate.sum('amount'),
        }),
      }),
    ]);

    const contactCounts = new Map(
      contactStats.map((row) => [row.customerId, row.count]),
    );
    const opportunityCounts = new Map(
      opportunityStats.map((row) => [row.customerId, row.count]),
    );
    const totals = new Map(
      opportunityStats.map((row) => [
        row.customerId,
        NUMBER_FROM_DECIMAL(row.total),
      ]),
    );

    return records.map((record) => ({
      ...record,
      contactCount: contactCounts.get(record.id) ?? 0,
      opportunityCount: opportunityCounts.get(record.id) ?? 0,
      totalAmount: totals.get(record.id) ?? 0,
    }));
  }

  async getCustomer(id: number): Promise<CustomerDetailView> {
    const customer = await this.customers().findOne({ filter: { id } });
    if (!customer) {
      throw new CrmNotFoundError('The customer does not exist.');
    }

    const [contacts, opportunities, total] = await Promise.all([
      this.contacts().findMany({
        filter: { customerId: id },
        sort: (sort) => sort.field('createdAt').asc(),
      }),
      this.opportunities().findMany({
        filter: { customerId: id },
        sort: (sort) => sort.field('createdAt').asc(),
      }),
      this.opportunities().aggregate({
        filter: { customerId: id },
        aggregate: (aggregate) => ({ total: aggregate.sum('amount') }),
      }),
    ]);

    const customerName = customer.name;
    const contactViews = contacts.map((record) => ({
      ...record,
      customerName,
    }));
    const opportunityViews = opportunities.map((record) => ({
      ...record,
      amount: NUMBER_FROM_DECIMAL(record.amount),
      customerName,
    }));

    return {
      ...customer,
      contactCount: contactViews.length,
      opportunityCount: opportunityViews.length,
      totalAmount: NUMBER_FROM_DECIMAL(total.total),
      contacts: contactViews,
      opportunities: opportunityViews,
    };
  }

  async createCustomer(input: {
    name?: unknown;
    industry?: unknown;
  }): Promise<CustomerRecord> {
    const name = requiredString(input.name, 'NAME_REQUIRED', 120);
    const industry = optionalString(input.industry, 120);
    await this.assertCustomerNameFree(name);
    const { record } = await this.customers().createOne({
      values: { name, industry, createdAt: new Date() },
    });
    return record;
  }

  async updateCustomer(
    id: number,
    input: { name?: unknown; industry?: unknown },
  ): Promise<CustomerRecord> {
    await this.getCustomerRecord(id);
    const name = requiredString(input.name, 'NAME_REQUIRED', 120);
    const industry = optionalString(input.industry, 120);
    await this.assertCustomerNameFree(name, id);
    const { record } = await this.customers().updateOne({
      filter: { id },
      values: { name, industry },
    });
    return record;
  }

  async listContacts(): Promise<ContactView[]> {
    const [records, names] = await Promise.all([
      this.contacts().findMany({
        sort: (sort) => sort.field('createdAt').asc(),
      }),
      this.customerNames(),
    ]);
    return records.map((record) => ({
      ...record,
      customerName: names.get(record.customerId) ?? null,
    }));
  }

  async createContact(input: {
    name?: unknown;
    contactInfo?: unknown;
    customerId?: unknown;
  }): Promise<ContactRecord> {
    const name = requiredString(input.name, 'NAME_REQUIRED', 120);
    const contactInfo = optionalString(input.contactInfo, 200);
    const customerId = requiredId(input.customerId);
    await this.requireCustomer(customerId);
    await this.assertContactNameFree(customerId, name);
    const { record } = await this.contacts().createOne({
      values: { name, contactInfo, customerId, createdAt: new Date() },
    });
    return record;
  }

  async updateContact(
    id: number,
    input: { name?: unknown; contactInfo?: unknown; customerId?: unknown },
  ): Promise<ContactRecord> {
    await this.getContactRecord(id);
    const name = requiredString(input.name, 'NAME_REQUIRED', 120);
    const contactInfo = optionalString(input.contactInfo, 200);
    const customerId = requiredId(input.customerId);
    await this.requireCustomer(customerId);
    await this.assertContactNameFree(customerId, name, id);
    const { record } = await this.contacts().updateOne({
      filter: { id },
      values: { name, contactInfo, customerId },
    });
    return record;
  }

  async listOpportunities(stage?: unknown): Promise<OpportunityView[]> {
    const filter =
      stage === undefined || stage === ''
        ? undefined
        : { stage: requiredStage(stage) };
    const [records, names] = await Promise.all([
      this.opportunities().findMany({
        ...(filter ? { filter } : {}),
        sort: (sort) => sort.field('createdAt').asc(),
      }),
      this.customerNames(),
    ]);
    return records.map((record) => ({
      ...record,
      amount: NUMBER_FROM_DECIMAL(record.amount),
      customerName: names.get(record.customerId) ?? null,
    }));
  }

  async createOpportunity(input: {
    name?: unknown;
    customerId?: unknown;
    amount?: unknown;
    stage?: unknown;
  }): Promise<OpportunityRecord> {
    const name = requiredString(input.name, 'NAME_REQUIRED', 160);
    const customerId = requiredId(input.customerId);
    const amount = requiredAmount(input.amount);
    const stage = requiredStage(input.stage);
    await this.requireCustomer(customerId);
    await this.assertOpportunityNameFree(customerId, name);
    const { record } = await this.opportunities().createOne({
      values: { name, customerId, amount, stage, createdAt: new Date() },
    });
    return record;
  }

  async updateOpportunity(
    id: number,
    input: {
      name?: unknown;
      customerId?: unknown;
      amount?: unknown;
      stage?: unknown;
    },
  ): Promise<OpportunityRecord> {
    await this.getOpportunityRecord(id);
    const name = requiredString(input.name, 'NAME_REQUIRED', 160);
    const customerId = requiredId(input.customerId);
    const amount = requiredAmount(input.amount);
    const stage = requiredStage(input.stage);
    await this.requireCustomer(customerId);
    await this.assertOpportunityNameFree(customerId, name, id);
    const { record } = await this.opportunities().updateOne({
      filter: { id },
      values: { name, customerId, amount, stage },
    });
    return record;
  }

  private async getCustomerRecord(id: number): Promise<CustomerRecord> {
    const record = await this.customers().findOne({ filter: { id } });
    if (!record) {
      throw new CrmNotFoundError('The customer does not exist.');
    }
    return record;
  }

  private async getContactRecord(id: number): Promise<ContactRecord> {
    const record = await this.contacts().findOne({ filter: { id } });
    if (!record) {
      throw new CrmNotFoundError('The contact does not exist.');
    }
    return record;
  }

  private async getOpportunityRecord(id: number): Promise<OpportunityRecord> {
    const record = await this.opportunities().findOne({ filter: { id } });
    if (!record) {
      throw new CrmNotFoundError('The opportunity does not exist.');
    }
    return record;
  }

  private async assertCustomerNameFree(
    name: string,
    exceptId?: number,
  ): Promise<void> {
    const existing = await this.customers().findOne({ filter: { name } });
    if (existing && existing.id !== exceptId) {
      throw new CrmDuplicateError('A customer with this name already exists.');
    }
  }

  private async assertContactNameFree(
    customerId: number,
    name: string,
    exceptId?: number,
  ): Promise<void> {
    const existing = await this.contacts().findOne({
      filter: { customerId, name },
    });
    if (existing && existing.id !== exceptId) {
      throw new CrmDuplicateError(
        'This customer already has a contact with this name.',
      );
    }
  }

  private async assertOpportunityNameFree(
    customerId: number,
    name: string,
    exceptId?: number,
  ): Promise<void> {
    const existing = await this.opportunities().findOne({
      filter: { customerId, name },
    });
    if (existing && existing.id !== exceptId) {
      throw new CrmDuplicateError(
        'This customer already has an opportunity with this name.',
      );
    }
  }
}
