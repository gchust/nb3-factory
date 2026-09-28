import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** 跟进中 / 赢单 / 输单 — the only stages an opportunity may hold. */
export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export interface CustomerRecord {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContactRecord {
  readonly id: number;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly customerId: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OpportunityRecord {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A customer with everything the detail page shows in one response. */
export interface CustomerDetail extends CustomerRecord {
  readonly contacts: readonly ContactRecord[];
  readonly opportunities: readonly OpportunityRecord[];
  /** The sum of this customer's opportunity amounts only. */
  readonly totalAmount: number;
}

export interface CustomerInput {
  readonly name: unknown;
  readonly industry?: unknown;
}

export interface ContactInput {
  readonly name: unknown;
  readonly phone?: unknown;
  readonly email?: unknown;
  readonly customerId: unknown;
}

export interface OpportunityInput {
  readonly name: unknown;
  readonly customerId: unknown;
  readonly amount: unknown;
  readonly stage: unknown;
}

export type CustomerUpdate = Partial<CustomerInput>;
export type ContactUpdate = Partial<ContactInput>;
export type OpportunityUpdate = Partial<OpportunityInput>;

export type CrmErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND';

/** A domain failure the route turns into a 400 or a 404. */
export class CrmError extends Error {
  constructor(
    public readonly code: CrmErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = 'CrmError';
  }
}

export interface CrmService {
  listCustomers(): Promise<readonly CustomerRecord[]>;
  getCustomer(id: number): Promise<CustomerDetail>;
  createCustomer(input: CustomerInput): Promise<CustomerRecord>;
  updateCustomer(id: number, input: CustomerUpdate): Promise<CustomerRecord>;

  listContacts(customerId?: number): Promise<readonly ContactRecord[]>;
  createContact(input: ContactInput): Promise<ContactRecord>;
  updateContact(id: number, input: ContactUpdate): Promise<ContactRecord>;

  listOpportunities(
    stage?: OpportunityStage,
  ): Promise<readonly OpportunityRecord[]>;
  createOpportunity(input: OpportunityInput): Promise<OpportunityRecord>;
  updateOpportunity(
    id: number,
    input: OpportunityUpdate,
  ): Promise<OpportunityRecord>;
}

export const crmServiceToken: ServiceToken<CrmService> =
  createServiceToken<CrmService>('app/crm-service');

const NAME_MAX_LENGTH = 255;
const INDUSTRY_MAX_LENGTH = 255;
const PHONE_MAX_LENGTH = 64;
const EMAIL_MAX_LENGTH = 255;
const AMOUNT_MAX = 99999999999.99;

function requiredName(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CrmError('VALIDATION_ERROR', `${field} is required.`, {
      [field]: 'required',
    });
  }
  const name = value.trim();
  if (name.length > NAME_MAX_LENGTH) {
    throw new CrmError(
      'VALIDATION_ERROR',
      `${field} must be at most ${NAME_MAX_LENGTH} characters.`,
      { [field]: 'too_long' },
    );
  }
  return name;
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new CrmError('VALIDATION_ERROR', `${field} must be text.`, {
      [field]: 'invalid',
    });
  }
  const text = value.trim();
  if (text.length === 0) {
    return null;
  }
  if (text.length > maxLength) {
    throw new CrmError(
      'VALIDATION_ERROR',
      `${field} must be at most ${maxLength} characters.`,
      { [field]: 'too_long' },
    );
  }
  return text;
}

function requiredId(value: unknown, field: string): number {
  const id = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new CrmError('VALIDATION_ERROR', `${field} is required.`, {
      [field]: 'required',
    });
  }
  return id;
}

function requiredAmount(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) {
    throw new CrmError('VALIDATION_ERROR', 'Amount must be a number.', {
      amount: 'invalid',
    });
  }
  if (amount < 0) {
    throw new CrmError('VALIDATION_ERROR', 'Amount cannot be negative.', {
      amount: 'negative',
    });
  }
  if (amount > AMOUNT_MAX) {
    throw new CrmError('VALIDATION_ERROR', 'Amount is too large.', {
      amount: 'too_large',
    });
  }
  // Money keeps two decimal places; a value the user typed with more is
  // rounded rather than rejected.
  return Math.round(amount * 100) / 100;
}

function requiredStage(value: unknown): OpportunityStage {
  if (
    typeof value !== 'string' ||
    !(OPPORTUNITY_STAGES as readonly string[]).includes(value)
  ) {
    throw new CrmError('VALIDATION_ERROR', 'Stage is not supported.', {
      stage: 'invalid',
    });
  }
  return value as OpportunityStage;
}

function toCustomer(record: CustomerRecord): CustomerRecord {
  return {
    id: record.id,
    name: record.name,
    industry: record.industry ?? null,
    createdAt: String(record.createdAt),
    updatedAt: String(record.updatedAt),
  };
}

function toContact(record: ContactRecord): ContactRecord {
  return {
    id: record.id,
    name: record.name,
    phone: record.phone ?? null,
    email: record.email ?? null,
    customerId: Number(record.customerId),
    createdAt: String(record.createdAt),
    updatedAt: String(record.updatedAt),
  };
}

function toOpportunity(record: OpportunityRecord): OpportunityRecord {
  // A decimal column comes back as a string on some drivers; the API contract
  // is a number so the browser never has to parse it.
  return {
    id: record.id,
    name: record.name,
    customerId: Number(record.customerId),
    amount: Number(record.amount),
    stage: record.stage,
    createdAt: String(record.createdAt),
    updatedAt: String(record.updatedAt),
  };
}

export function createCrmService(database: DatabaseManager): CrmService {
  const customers: Repository<CustomerRecord> =
    database.repository<CustomerRecord>('customers');
  const contacts: Repository<ContactRecord> =
    database.repository<ContactRecord>('contacts');
  const opportunities: Repository<OpportunityRecord> =
    database.repository<OpportunityRecord>('opportunities');

  async function requireCustomer(id: number): Promise<CustomerRecord> {
    const customer = await customers.findOne({ filter: { id } });
    if (!customer) {
      throw new CrmError('NOT_FOUND', 'Customer not found.');
    }
    return toCustomer(customer);
  }

  return {
    async listCustomers() {
      const records = await customers.findMany({
        sort: (sort) => sort.field('name').asc(),
      });
      return records.map(toCustomer);
    },

    async getCustomer(id) {
      const customer = await requireCustomer(requiredId(id, 'id'));
      const [contactRecords, opportunityRecords, aggregate] = await Promise.all(
        [
          contacts.findMany({
            filter: { customerId: customer.id },
            sort: (sort) => sort.field('createdAt').desc(),
          }),
          opportunities.findMany({
            filter: { customerId: customer.id },
            sort: (sort) => sort.field('createdAt').desc(),
          }),
          opportunities.aggregate({
            filter: { customerId: customer.id },
            aggregate: (aggregate) => ({ total: aggregate.sum('amount') }),
          }),
        ],
      );
      const total = Number(aggregate.total ?? 0);
      return {
        ...customer,
        contacts: contactRecords.map(toContact),
        opportunities: opportunityRecords.map(toOpportunity),
        totalAmount: Number.isFinite(total) ? total : 0,
      };
    },

    async createCustomer(input) {
      const now = new Date().toISOString();
      const { record } = await customers.createOne({
        values: {
          name: requiredName(input.name, 'name'),
          industry: optionalText(
            input.industry,
            'industry',
            INDUSTRY_MAX_LENGTH,
          ),
          createdAt: now,
          updatedAt: now,
        },
      });
      return toCustomer(record);
    },

    async updateCustomer(id, input) {
      const existing = await requireCustomer(requiredId(id, 'id'));
      const now = new Date().toISOString();
      const { record } = await customers.updateOne({
        filter: { id: existing.id },
        values: {
          ...(input.name === undefined
            ? {}
            : { name: requiredName(input.name, 'name') }),
          ...(input.industry === undefined
            ? {}
            : {
                industry: optionalText(
                  input.industry,
                  'industry',
                  INDUSTRY_MAX_LENGTH,
                ),
              }),
          updatedAt: now,
        },
      });
      return toCustomer(record);
    },

    async listContacts(customerId) {
      const filter =
        customerId === undefined
          ? undefined
          : { customerId: requiredId(customerId, 'customerId') };
      const records = await contacts.findMany({
        ...(filter ? { filter } : {}),
        sort: (sort) => sort.field('name').asc(),
      });
      return records.map(toContact);
    },

    async createContact(input) {
      const customerId = requiredId(input.customerId, 'customerId');
      await requireCustomer(customerId);
      const now = new Date().toISOString();
      const { record } = await contacts.createOne({
        values: {
          name: requiredName(input.name, 'name'),
          phone: optionalText(input.phone, 'phone', PHONE_MAX_LENGTH),
          email: optionalText(input.email, 'email', EMAIL_MAX_LENGTH),
          customerId,
          createdAt: now,
          updatedAt: now,
        },
      });
      return toContact(record);
    },

    async updateContact(id, input) {
      const contact = await contacts.findOne({
        filter: { id: requiredId(id, 'id') },
      });
      if (!contact) {
        throw new CrmError('NOT_FOUND', 'Contact not found.');
      }
      const customerId =
        input.customerId === undefined
          ? contact.customerId
          : requiredId(input.customerId, 'customerId');
      if (customerId !== contact.customerId) {
        await requireCustomer(customerId);
      }
      const now = new Date().toISOString();
      const { record } = await contacts.updateOne({
        filter: { id: contact.id },
        values: {
          ...(input.name === undefined
            ? {}
            : { name: requiredName(input.name, 'name') }),
          ...(input.phone === undefined
            ? {}
            : { phone: optionalText(input.phone, 'phone', PHONE_MAX_LENGTH) }),
          ...(input.email === undefined
            ? {}
            : { email: optionalText(input.email, 'email', EMAIL_MAX_LENGTH) }),
          ...(input.customerId === undefined ? {} : { customerId }),
          updatedAt: now,
        },
      });
      return toContact(record);
    },

    async listOpportunities(stage) {
      const filter =
        stage === undefined ? undefined : { stage: requiredStage(stage) };
      const records = await opportunities.findMany({
        ...(filter ? { filter } : {}),
        sort: (sort) => sort.field('createdAt').desc(),
      });
      return records.map(toOpportunity);
    },

    async createOpportunity(input) {
      const customerId = requiredId(input.customerId, 'customerId');
      await requireCustomer(customerId);
      const now = new Date().toISOString();
      const { record } = await opportunities.createOne({
        values: {
          name: requiredName(input.name, 'name'),
          customerId,
          amount: requiredAmount(input.amount),
          stage: requiredStage(input.stage),
          createdAt: now,
          updatedAt: now,
        },
      });
      return toOpportunity(record);
    },

    async updateOpportunity(id, input) {
      const opportunity = await opportunities.findOne({
        filter: { id: requiredId(id, 'id') },
      });
      if (!opportunity) {
        throw new CrmError('NOT_FOUND', 'Opportunity not found.');
      }
      const customerId =
        input.customerId === undefined
          ? opportunity.customerId
          : requiredId(input.customerId, 'customerId');
      if (customerId !== opportunity.customerId) {
        await requireCustomer(customerId);
      }
      const now = new Date().toISOString();
      const { record } = await opportunities.updateOne({
        filter: { id: opportunity.id },
        values: {
          ...(input.name === undefined
            ? {}
            : { name: requiredName(input.name, 'name') }),
          ...(input.amount === undefined
            ? {}
            : { amount: requiredAmount(input.amount) }),
          ...(input.stage === undefined
            ? {}
            : { stage: requiredStage(input.stage) }),
          ...(input.customerId === undefined ? {} : { customerId }),
          updatedAt: now,
        },
      });
      return toOpportunity(record);
    },
  };
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
