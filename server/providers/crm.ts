import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * CRM domain service.
 *
 * It owns the business rules for the three records — what makes a customer,
 * contact or opportunity valid, how an opportunity's amount is normalised and
 * how a customer's total is summed — and never sees a Hono context or picks an
 * HTTP status code. Routes translate its errors.
 */

export const OPPORTUNITY_STAGES = ['nurturing', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
}

export interface Contact {
  readonly id: number;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly customerId: number;
}

export interface Opportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

export interface CustomerSummary {
  readonly customer: Customer;
  readonly contacts: readonly Contact[];
  readonly opportunities: readonly Opportunity[];
  /** How many opportunities belong to the customer. */
  readonly opportunityCount: number;
  /** Sum of the customer's opportunity amounts, rounded to cents. */
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

export class CrmValidationError extends Error {
  public readonly code = 'VALIDATION_FAILED';

  public constructor(
    public readonly fields: Readonly<Record<string, string>>,
    message: string = 'The submitted data is not valid.',
  ) {
    super(message);
    this.name = 'CrmValidationError';
  }
}

export class CrmNotFoundError extends Error {
  public readonly code = 'NOT_FOUND';

  public constructor(message: string = 'The requested record does not exist.') {
    super(message);
    this.name = 'CrmNotFoundError';
  }
}

export interface CrmService {
  listCustomers(): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(input: CustomerInput): Promise<Customer>;
  updateCustomer(id: number, input: CustomerInput): Promise<Customer>;

  listContacts(options?: { customerId?: number }): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  createContact(input: ContactInput): Promise<Contact>;
  updateContact(id: number, input: ContactInput): Promise<Contact>;

  listOpportunities(options?: {
    customerId?: number;
    stage?: OpportunityStage;
  }): Promise<Opportunity[]>;
  getOpportunity(id: number): Promise<Opportunity | undefined>;
  createOpportunity(input: OpportunityInput): Promise<Opportunity>;
  updateOpportunity(id: number, input: OpportunityInput): Promise<Opportunity>;

  getCustomerSummary(id: number): Promise<CustomerSummary | undefined>;
}

interface CustomerRow {
  id: number;
  name: string;
  industry: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ContactRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  customerId: number;
  createdAt: string;
  updatedAt: string;
}

interface OpportunityRow {
  id: number;
  name: string;
  customerId: number;
  /** SQLite may hand a decimal back as a string; `normalizeAmount` accepts either. */
  amount: number | string;
  stage: OpportunityStage;
  createdAt: string;
  updatedAt: string;
}

export type CustomerIdLookup = (id: number) => Promise<boolean>;

export function normalizeAmount(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) {
    return Number.NaN;
  }
  return Math.round(amount * 100) / 100;
}

export function isOpportunityStage(value: unknown): value is OpportunityStage {
  return (
    typeof value === 'string' &&
    (OPPORTUNITY_STAGES as readonly string[]).includes(value)
  );
}

export function readRequiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CrmValidationError({ [field]: 'REQUIRED' });
  }
  return value.trim();
}

export function readOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  return text === '' ? null : text;
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: Number(row.id),
    name: row.name,
    industry: row.industry ?? null,
  };
}

function toContact(row: ContactRow): Contact {
  return {
    id: Number(row.id),
    name: row.name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    customerId: Number(row.customerId),
  };
}

function toOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: Number(row.id),
    name: row.name,
    customerId: Number(row.customerId),
    amount: normalizeAmount(row.amount),
    stage: row.stage,
  };
}

export function createCrmService(database: DatabaseManager): CrmService {
  const customers = () => database.repository<CustomerRow>('crmCustomers');
  const contacts = () => database.repository<ContactRow>('crmContacts');
  const opportunities = () =>
    database.repository<OpportunityRow>('crmOpportunities');

  const requireCustomer = async (customerId: unknown): Promise<number> => {
    const id = Number(customerId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new CrmValidationError({ customerId: 'INVALID' });
    }
    const existing = await customers().findOne({ filter: { id } });
    if (!existing) {
      throw new CrmValidationError({ customerId: 'NOT_FOUND' });
    }
    return id;
  };

  const summaryFor = async (
    customer: CustomerRow,
  ): Promise<CustomerSummary> => {
    const customerContacts = (
      await contacts().findMany({ filter: { customerId: customer.id } })
    )
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(toContact);
    const customerOpportunities = (
      await opportunities().findMany({ filter: { customerId: customer.id } })
    ).map(toOpportunity);
    const opportunityTotal =
      Math.round(
        customerOpportunities.reduce(
          (total, opportunity) => total + opportunity.amount,
          0,
        ) * 100,
      ) / 100;
    return {
      customer: toCustomer(customer),
      contacts: customerContacts,
      opportunities: customerOpportunities,
      opportunityCount: customerOpportunities.length,
      opportunityTotal,
    };
  };

  return {
    async listCustomers() {
      const rows = await customers().findMany({
        sort: (sort) => sort.field('name').asc(),
      });
      return rows.map(toCustomer);
    },

    async getCustomer(id) {
      const row = await customers().findOne({ filter: { id } });
      return row ? toCustomer(row) : undefined;
    },

    async createCustomer(input) {
      const name = readRequiredText(input.name, 'name');
      const industry = readOptionalText(input.industry);
      const now = new Date().toISOString();
      const { record } = await customers().createOne({
        values: { name, industry, createdAt: now, updatedAt: now },
      });
      return toCustomer(record);
    },

    async updateCustomer(id, input) {
      const existing = await customers().findOne({ filter: { id } });
      if (!existing) {
        throw new CrmNotFoundError();
      }
      const values: Partial<CustomerRow> = {
        updatedAt: new Date().toISOString(),
      };
      if (input.name !== undefined) {
        values.name = readRequiredText(input.name, 'name');
      }
      if (input.industry !== undefined) {
        values.industry = readOptionalText(input.industry);
      }
      const { record } = await customers().updateOne({
        filter: { id },
        values,
      });
      return toCustomer(record);
    },

    async listContacts(options) {
      const rows = await contacts().findMany({
        filter:
          options?.customerId === undefined
            ? undefined
            : { customerId: options.customerId },
        sort: (sort) => sort.field('name').asc(),
      });
      return rows.map(toContact);
    },

    async getContact(id) {
      const row = await contacts().findOne({ filter: { id } });
      return row ? toContact(row) : undefined;
    },

    async createContact(input) {
      const name = readRequiredText(input.name, 'name');
      const customerId = await requireCustomer(input.customerId);
      const now = new Date().toISOString();
      const { record } = await contacts().createOne({
        values: {
          name,
          phone: readOptionalText(input.phone),
          email: readOptionalText(input.email),
          customerId,
          createdAt: now,
          updatedAt: now,
        },
      });
      return toContact(record);
    },

    async updateContact(id, input) {
      const existing = await contacts().findOne({ filter: { id } });
      if (!existing) {
        throw new CrmNotFoundError();
      }
      const values: Partial<ContactRow> = {
        updatedAt: new Date().toISOString(),
      };
      if (input.name !== undefined) {
        values.name = readRequiredText(input.name, 'name');
      }
      if (input.phone !== undefined) {
        values.phone = readOptionalText(input.phone);
      }
      if (input.email !== undefined) {
        values.email = readOptionalText(input.email);
      }
      if (input.customerId !== undefined) {
        values.customerId = await requireCustomer(input.customerId);
      }
      const { record } = await contacts().updateOne({
        filter: { id },
        values,
      });
      return toContact(record);
    },

    async listOpportunities(options) {
      const filter: Partial<OpportunityRow> = {};
      if (options?.customerId !== undefined) {
        filter.customerId = options.customerId;
      }
      if (options?.stage !== undefined) {
        filter.stage = options.stage;
      }
      const rows = await opportunities().findMany({
        filter: Object.keys(filter).length === 0 ? undefined : filter,
        sort: (sort) => sort.field('updatedAt').desc(),
      });
      return rows.map(toOpportunity);
    },

    async getOpportunity(id) {
      const row = await opportunities().findOne({ filter: { id } });
      return row ? toOpportunity(row) : undefined;
    },

    async createOpportunity(input) {
      const name = readRequiredText(input.name, 'name');
      const customerId = await requireCustomer(input.customerId);
      const amount = normalizeAmount(input.amount ?? 0);
      if (Number.isNaN(amount) || amount < 0) {
        throw new CrmValidationError({ amount: 'INVALID' });
      }
      if (input.stage !== undefined && !isOpportunityStage(input.stage)) {
        throw new CrmValidationError({ stage: 'INVALID' });
      }
      const now = new Date().toISOString();
      const { record } = await opportunities().createOne({
        values: {
          name,
          customerId,
          amount,
          stage: isOpportunityStage(input.stage) ? input.stage : 'nurturing',
          createdAt: now,
          updatedAt: now,
        },
      });
      return toOpportunity(record);
    },

    async updateOpportunity(id, input) {
      const existing = await opportunities().findOne({ filter: { id } });
      if (!existing) {
        throw new CrmNotFoundError();
      }
      const values: Partial<OpportunityRow> = {
        updatedAt: new Date().toISOString(),
      };
      if (input.name !== undefined) {
        values.name = readRequiredText(input.name, 'name');
      }
      if (input.customerId !== undefined) {
        values.customerId = await requireCustomer(input.customerId);
      }
      if (input.amount !== undefined) {
        const amount = normalizeAmount(input.amount);
        if (Number.isNaN(amount) || amount < 0) {
          throw new CrmValidationError({ amount: 'INVALID' });
        }
        values.amount = amount;
      }
      if (input.stage !== undefined) {
        if (!isOpportunityStage(input.stage)) {
          throw new CrmValidationError({ stage: 'INVALID' });
        }
        values.stage = input.stage;
      }
      const { record } = await opportunities().updateOne({
        filter: { id },
        values,
      });
      return toOpportunity(record);
    },

    async getCustomerSummary(id) {
      const customer = await customers().findOne({ filter: { id } });
      if (!customer) {
        return undefined;
      }
      return summaryFor(customer);
    },
  };
}

export const crmServiceToken: ServiceToken<CrmService> =
  createServiceToken<CrmService>('app/crm-service');

export default class CrmServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/crm-provider';

  public override register(): void {
    this.app.container.singleton(crmServiceToken, () =>
      createCrmService(this.app.container.resolve(databaseManagerToken)),
    );
  }
}
