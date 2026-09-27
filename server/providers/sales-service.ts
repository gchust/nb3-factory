import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** The three stages an opportunity may be in. The codes are stable; labels live in the client locales. */
export const OPPORTUNITY_STAGES = ['in-progress', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export function isOpportunityStage(value: unknown): value is OpportunityStage {
  return (
    typeof value === 'string' &&
    (OPPORTUNITY_STAGES as readonly string[]).includes(value)
  );
}

export type SalesErrorCode =
  | 'VALIDATION_ERROR'
  | 'AMOUNT_NEGATIVE'
  | 'INVALID_STAGE'
  | 'CUSTOMER_NOT_FOUND'
  | 'CONTACT_NOT_FOUND'
  | 'OPPORTUNITY_NOT_FOUND';

/**
 * A domain failure the route maps to a status code. The service never decides
 * HTTP itself; the code is what the route and the tests agree on.
 */
export class SalesError extends Error {
  public readonly code: SalesErrorCode;

  constructor(code: SalesErrorCode, message: string) {
    super(message);
    this.name = 'SalesError';
    this.code = code;
  }
}

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerSummary extends Customer {
  readonly contactCount: number;
  readonly opportunityCount: number;
  /** Sum of this customer's opportunity amounts, never another customer's. */
  readonly totalAmount: number;
}

export interface Contact {
  readonly id: number;
  readonly name: string;
  readonly contactInfo: string | null;
  readonly customerId: number;
  readonly customerName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Opportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly customerName: string | null;
  readonly amount: number;
  readonly stage: OpportunityStage;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerDetail extends Customer {
  readonly contacts: readonly Contact[];
  readonly opportunities: readonly Opportunity[];
  readonly totalAmount: number;
}

export interface SalesService {
  listCustomers(): Promise<CustomerSummary[]>;
  createCustomer(
    input: Readonly<Record<string, unknown>>,
  ): Promise<CustomerSummary>;
  getCustomer(id: number): Promise<CustomerDetail>;
  updateCustomer(
    id: number,
    input: Readonly<Record<string, unknown>>,
  ): Promise<CustomerSummary>;

  listContacts(query: { readonly customerId?: number }): Promise<Contact[]>;
  createContact(input: Readonly<Record<string, unknown>>): Promise<Contact>;
  updateContact(
    id: number,
    input: Readonly<Record<string, unknown>>,
  ): Promise<Contact>;

  listOpportunities(query: {
    readonly stage?: unknown;
    readonly customerId?: number;
  }): Promise<Opportunity[]>;
  createOpportunity(
    input: Readonly<Record<string, unknown>>,
  ): Promise<Opportunity>;
  updateOpportunity(
    id: number,
    input: Readonly<Record<string, unknown>>,
  ): Promise<Opportunity>;
}

export const salesServiceToken: ServiceToken<SalesService> =
  createServiceToken<SalesService>('app/sales-service');

interface CustomerRow {
  id: number;
  name: string;
  industry: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ContactRow {
  id: number;
  name: string;
  contactInfo: string | null;
  customerId: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface OpportunityRow {
  id: number;
  name: string;
  customerId: number;
  amount: number | string;
  stage: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function toIso(value: Date | string | null | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value ?? '';
}

/**
 * SQLite returns a decimal as a number, PostgreSQL as a string. Reading both
 * through `Number` keeps the API stable whichever driver is configured.
 */
function toAmount(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeCustomer(row: CustomerRow): Customer {
  return {
    id: Number(row.id),
    name: row.name,
    industry: row.industry ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function normalizeContact(
  row: ContactRow,
  customerName: string | null,
): Contact {
  return {
    id: Number(row.id),
    name: row.name,
    contactInfo: row.contactInfo ?? null,
    customerId: Number(row.customerId),
    customerName,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function normalizeOpportunity(
  row: OpportunityRow,
  customerName: string | null,
): Opportunity {
  return {
    id: Number(row.id),
    name: row.name,
    customerId: Number(row.customerId),
    customerName,
    amount: toAmount(row.amount),
    stage: isOpportunityStage(row.stage) ? row.stage : 'in-progress',
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function readRequiredString(
  input: Readonly<Record<string, unknown>>,
  field: string,
  maxLength = 120,
): string {
  const value = input[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SalesError('VALIDATION_ERROR', `${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new SalesError(
      'VALIDATION_ERROR',
      `${field} must be at most ${maxLength} characters`,
    );
  }
  return trimmed;
}

function readOptionalString(
  input: Readonly<Record<string, unknown>>,
  field: string,
  maxLength: number,
): string | null {
  const value = input[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new SalesError('VALIDATION_ERROR', `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new SalesError(
      'VALIDATION_ERROR',
      `${field} must be at most ${maxLength} characters`,
    );
  }
  return trimmed;
}

function readId(
  input: Readonly<Record<string, unknown>>,
  field: string,
): number {
  const value = input[field];
  const id = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new SalesError(
      'VALIDATION_ERROR',
      `${field} must be a positive integer`,
    );
  }
  return id;
}

function readAmount(input: Readonly<Record<string, unknown>>): number {
  const value = input.amount;
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) {
    throw new SalesError('VALIDATION_ERROR', 'amount must be a number');
  }
  if (amount < 0) {
    throw new SalesError('AMOUNT_NEGATIVE', 'amount must not be negative');
  }
  // The column is decimal(18,2); rounding here keeps the API value equal to
  // what the database actually stores.
  return Math.round(amount * 100) / 100;
}

function readStage(input: Readonly<Record<string, unknown>>): OpportunityStage {
  const value = input.stage;
  if (!isOpportunityStage(value)) {
    throw new SalesError(
      'INVALID_STAGE',
      `stage must be one of ${OPPORTUNITY_STAGES.join(', ')}`,
    );
  }
  return value;
}

function has(input: Readonly<Record<string, unknown>>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

/**
 * All sales reads and writes. It returns domain shapes and throws `SalesError`;
 * it never sees a request or decides a status code.
 */
export function createSalesService(database: DatabaseManager): SalesService {
  const customers = () => database.repository<CustomerRow>('customers');
  const contacts = () => database.repository<ContactRow>('contacts');
  const opportunities = () =>
    database.repository<OpportunityRow>('opportunities');

  async function customerNameById(): Promise<Map<number, string>> {
    const rows = await customers().findMany();
    return new Map(rows.map((row) => [Number(row.id), row.name]));
  }

  async function requireCustomer(id: number): Promise<CustomerRow> {
    const customer = await customers().findOne({ filter: { id } });
    if (!customer) {
      throw new SalesError('CUSTOMER_NOT_FOUND', 'Customer not found');
    }
    return customer;
  }

  async function summarizeCustomers(): Promise<CustomerSummary[]> {
    const [customerRows, contactRows, opportunityRows] = await Promise.all([
      customers().findMany({ sort: (sort) => sort.field('name').asc() }),
      contacts().findMany(),
      opportunities().findMany(),
    ]);

    const contactCounts = new Map<number, number>();
    for (const row of contactRows) {
      const id = Number(row.customerId);
      contactCounts.set(id, (contactCounts.get(id) ?? 0) + 1);
    }

    const opportunityCounts = new Map<number, number>();
    const totals = new Map<number, number>();
    for (const row of opportunityRows) {
      const id = Number(row.customerId);
      opportunityCounts.set(id, (opportunityCounts.get(id) ?? 0) + 1);
      totals.set(id, (totals.get(id) ?? 0) + toAmount(row.amount));
    }

    return customerRows.map((row) => {
      const id = Number(row.id);
      return {
        ...normalizeCustomer(row),
        contactCount: contactCounts.get(id) ?? 0,
        opportunityCount: opportunityCounts.get(id) ?? 0,
        totalAmount: totals.get(id) ?? 0,
      };
    });
  }

  async function summaryOf(id: number): Promise<CustomerSummary> {
    const all = await summarizeCustomers();
    const summary = all.find((customer) => customer.id === id);
    if (!summary) {
      throw new SalesError('CUSTOMER_NOT_FOUND', 'Customer not found');
    }
    return summary;
  }

  return {
    async listCustomers(): Promise<CustomerSummary[]> {
      return summarizeCustomers();
    },

    async createCustomer(input): Promise<CustomerSummary> {
      const name = readRequiredString(input, 'name');
      const industry = readOptionalString(input, 'industry', 120);
      const now = new Date();
      const { record } = await customers().createOne({
        values: { name, industry, createdAt: now, updatedAt: now },
      });
      return {
        ...normalizeCustomer(record),
        contactCount: 0,
        opportunityCount: 0,
        totalAmount: 0,
      };
    },

    async getCustomer(id): Promise<CustomerDetail> {
      const customer = await requireCustomer(id);
      const [contactRows, opportunityRows] = await Promise.all([
        contacts().findMany({
          filter: { customerId: id },
          sort: (sort) => sort.field('name').asc(),
        }),
        opportunities().findMany({
          filter: { customerId: id },
          sort: (sort) => sort.field('createdAt').desc(),
        }),
      ]);

      const totalAmount = opportunityRows.reduce(
        (sum, row) => sum + toAmount(row.amount),
        0,
      );

      return {
        ...normalizeCustomer(customer),
        contacts: contactRows.map((row) =>
          normalizeContact(row, customer.name),
        ),
        opportunities: opportunityRows.map((row) =>
          normalizeOpportunity(row, customer.name),
        ),
        totalAmount,
      };
    },

    async updateCustomer(id, input): Promise<CustomerSummary> {
      await requireCustomer(id);
      const values: Partial<Omit<CustomerRow, 'id'>> = {
        updatedAt: new Date(),
      };
      if (has(input, 'name')) {
        values.name = readRequiredString(input, 'name');
      }
      if (has(input, 'industry')) {
        values.industry = readOptionalString(input, 'industry', 120);
      }
      await customers().updateOne({ filter: { id }, values });
      return summaryOf(id);
    },

    async listContacts(query): Promise<Contact[]> {
      const rows = await contacts().findMany(
        query.customerId
          ? {
              filter: { customerId: query.customerId },
              sort: (sort) => sort.field('name').asc(),
            }
          : { sort: (sort) => sort.field('name').asc() },
      );
      const names = await customerNameById();
      return rows.map((row) =>
        normalizeContact(row, names.get(Number(row.customerId)) ?? null),
      );
    },

    async createContact(input): Promise<Contact> {
      const name = readRequiredString(input, 'name');
      const contactInfo = readOptionalString(input, 'contactInfo', 200);
      const customerId = readId(input, 'customerId');
      const customer = await requireCustomer(customerId);
      const now = new Date();
      const { record } = await contacts().createOne({
        values: {
          name,
          contactInfo,
          customerId,
          createdAt: now,
          updatedAt: now,
        },
      });
      return normalizeContact(record, customer.name);
    },

    async updateContact(id, input): Promise<Contact> {
      const existing = await contacts().findOne({ filter: { id } });
      if (!existing) {
        throw new SalesError('CONTACT_NOT_FOUND', 'Contact not found');
      }

      const values: Partial<Omit<ContactRow, 'id'>> = { updatedAt: new Date() };
      if (has(input, 'name')) {
        values.name = readRequiredString(input, 'name');
      }
      if (has(input, 'contactInfo')) {
        values.contactInfo = readOptionalString(input, 'contactInfo', 200);
      }
      let customerId = Number(existing.customerId);
      if (has(input, 'customerId')) {
        customerId = readId(input, 'customerId');
        await requireCustomer(customerId);
        values.customerId = customerId;
      }

      const { record } = await contacts().updateOne({
        filter: { id },
        values,
      });
      const customer = await requireCustomer(customerId);
      return normalizeContact(record, customer.name);
    },

    async listOpportunities(query): Promise<Opportunity[]> {
      const stage =
        query.stage === undefined
          ? undefined
          : readStage({ stage: query.stage });
      const filter: { stage?: OpportunityStage; customerId?: number } = {};
      if (stage) {
        filter.stage = stage;
      }
      if (query.customerId) {
        filter.customerId = query.customerId;
      }

      const rows = await opportunities().findMany({
        ...(Object.keys(filter).length > 0 ? { filter } : {}),
        sort: (sort) => sort.field('createdAt').desc(),
      });
      const names = await customerNameById();
      return rows.map((row) =>
        normalizeOpportunity(row, names.get(Number(row.customerId)) ?? null),
      );
    },

    async createOpportunity(input): Promise<Opportunity> {
      const name = readRequiredString(input, 'name');
      const customerId = readId(input, 'customerId');
      const amount = readAmount(input);
      const stage = readStage(input);
      const customer = await requireCustomer(customerId);
      const now = new Date();
      const { record } = await opportunities().createOne({
        values: {
          name,
          customerId,
          amount,
          stage,
          createdAt: now,
          updatedAt: now,
        },
      });
      return normalizeOpportunity(record, customer.name);
    },

    async updateOpportunity(id, input): Promise<Opportunity> {
      const existing = await opportunities().findOne({ filter: { id } });
      if (!existing) {
        throw new SalesError('OPPORTUNITY_NOT_FOUND', 'Opportunity not found');
      }

      const values: Partial<Omit<OpportunityRow, 'id'>> = {
        updatedAt: new Date(),
      };
      if (has(input, 'name')) {
        values.name = readRequiredString(input, 'name');
      }
      if (has(input, 'customerId')) {
        const customerId = readId(input, 'customerId');
        await requireCustomer(customerId);
        values.customerId = customerId;
      }
      if (has(input, 'amount')) {
        values.amount = readAmount(input);
      }
      if (has(input, 'stage')) {
        values.stage = readStage(input);
      }

      const { record } = await opportunities().updateOne({
        filter: { id },
        values,
      });
      const customer = await requireCustomer(Number(record.customerId));
      return normalizeOpportunity(record, customer.name);
    },
  };
}

export default class SalesServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nb3-factory/sales-service';

  public override register(): void {
    this.app.container.singleton(salesServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createSalesService(database);
    });
  }
}
