import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

/** The three stages an opportunity can be in. The value is stored; the label is translated. */
export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export interface CustomerRecord {
  id: number;
  name: string;
  industry: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ContactRecord {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  customerId: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface OpportunityRecord {
  id: number;
  name: string;
  customerId: number;
  amount: number | string;
  stage: OpportunityStage;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** An opportunity as the API returns it: always a number, never a driver's decimal string. */
export interface OpportunityView extends Omit<OpportunityRecord, 'amount'> {
  amount: number;
}

export interface CustomerDetail {
  customer: CustomerRecord;
  contacts: ContactRecord[];
  opportunities: OpportunityView[];
  totalAmount: number;
}

export class SalesNotFoundError extends Error {
  readonly code = 'SALES_NOT_FOUND';
  constructor(readonly resource: string) {
    super(`Unknown ${resource}.`);
    this.name = 'SalesNotFoundError';
  }
}

export class SalesValidationError extends Error {
  readonly code = 'SALES_INVALID_INPUT';
  constructor(message: string) {
    super(message);
    this.name = 'SalesValidationError';
  }
}

function toOpportunityView(record: OpportunityRecord): OpportunityView {
  return { ...record, amount: Number(record.amount) };
}

/**
 * The sales feature's domain logic: customers, their contacts, and their
 * opportunities. It reads and writes through the Repository API and returns
 * plain records; it knows nothing about HTTP.
 */
export class SalesService {
  constructor(private readonly database: DatabaseManager) {}

  private customers() {
    return this.database.repository<CustomerRecord>('customers');
  }

  private contacts() {
    return this.database.repository<ContactRecord>('contacts');
  }

  private opportunities() {
    return this.database.repository<OpportunityRecord>('opportunities');
  }

  async listCustomers(): Promise<CustomerRecord[]> {
    return await this.customers().findMany({
      sort: (sort) => sort.field('name').asc(),
    });
  }

  async getCustomer(id: number): Promise<CustomerRecord | undefined> {
    return await this.customers().findOne({ filter: { id } });
  }

  async createCustomer(input: {
    name: string;
    industry?: string | null;
  }): Promise<CustomerRecord> {
    const now = new Date();
    const { record } = await this.customers().createOne({
      values: {
        name: input.name,
        industry: input.industry ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return record;
  }

  async updateCustomer(
    id: number,
    input: { name?: string; industry?: string | null },
  ): Promise<CustomerRecord> {
    if (!(await this.getCustomer(id))) {
      throw new SalesNotFoundError('customer');
    }
    const { record } = await this.customers().updateOne({
      filter: { id },
      values: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.industry === undefined
          ? {}
          : { industry: input.industry ?? null }),
        updatedAt: new Date(),
      },
    });
    return record;
  }

  async listContacts(customerId?: number): Promise<ContactRecord[]> {
    return await this.contacts().findMany({
      filter: customerId === undefined ? undefined : { customerId },
      sort: (sort) => sort.field('name').asc(),
    });
  }

  async getContact(id: number): Promise<ContactRecord | undefined> {
    return await this.contacts().findOne({ filter: { id } });
  }

  async createContact(input: {
    name: string;
    phone?: string | null;
    email?: string | null;
    customerId: number;
  }): Promise<ContactRecord> {
    await this.assertCustomerExists(input.customerId);
    const now = new Date();
    const { record } = await this.contacts().createOne({
      values: {
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        customerId: input.customerId,
        createdAt: now,
        updatedAt: now,
      },
    });
    return record;
  }

  async updateContact(
    id: number,
    input: {
      name?: string;
      phone?: string | null;
      email?: string | null;
      customerId?: number;
    },
  ): Promise<ContactRecord> {
    const existing = await this.contacts().findOne({ filter: { id } });
    if (!existing) {
      throw new SalesNotFoundError('contact');
    }
    if (input.customerId !== undefined) {
      await this.assertCustomerExists(input.customerId);
    }
    const { record } = await this.contacts().updateOne({
      filter: { id },
      values: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.phone === undefined ? {} : { phone: input.phone ?? null }),
        ...(input.email === undefined ? {} : { email: input.email ?? null }),
        ...(input.customerId === undefined
          ? {}
          : { customerId: input.customerId }),
        updatedAt: new Date(),
      },
    });
    return record;
  }

  async listOpportunities(
    stage?: OpportunityStage,
  ): Promise<OpportunityView[]> {
    const rows = await this.opportunities().findMany({
      filter: stage === undefined ? undefined : { stage },
      sort: (sort) => sort.field('name').asc(),
    });
    return rows.map(toOpportunityView);
  }

  async getOpportunity(id: number): Promise<OpportunityView | undefined> {
    const record = await this.opportunities().findOne({ filter: { id } });
    return record ? toOpportunityView(record) : undefined;
  }

  async createOpportunity(input: {
    name: string;
    customerId: number;
    amount: number;
    stage: OpportunityStage;
  }): Promise<OpportunityView> {
    await this.assertCustomerExists(input.customerId);
    const now = new Date();
    const { record } = await this.opportunities().createOne({
      values: {
        name: input.name,
        customerId: input.customerId,
        amount: input.amount,
        stage: input.stage,
        createdAt: now,
        updatedAt: now,
      },
    });
    return toOpportunityView(record);
  }

  async updateOpportunity(
    id: number,
    input: {
      name?: string;
      customerId?: number;
      amount?: number;
      stage?: OpportunityStage;
    },
  ): Promise<OpportunityView> {
    const existing = await this.opportunities().findOne({ filter: { id } });
    if (!existing) {
      throw new SalesNotFoundError('opportunity');
    }
    if (input.customerId !== undefined) {
      await this.assertCustomerExists(input.customerId);
    }
    const { record } = await this.opportunities().updateOne({
      filter: { id },
      values: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.customerId === undefined
          ? {}
          : { customerId: input.customerId }),
        ...(input.amount === undefined ? {} : { amount: input.amount }),
        ...(input.stage === undefined ? {} : { stage: input.stage }),
        updatedAt: new Date(),
      },
    });
    return toOpportunityView(record);
  }

  /**
   * Everything the customer detail view shows: the customer, its contacts, its
   * opportunities and the sum of their amounts. Other customers' opportunities
   * are never part of it, because the query is scoped by `customerId`.
   */
  async getCustomerDetail(id: number): Promise<CustomerDetail | undefined> {
    const customer = await this.getCustomer(id);
    if (!customer) return undefined;
    const [contacts, opportunities] = await Promise.all([
      this.listContacts(id),
      this.listOpportunitiesForCustomer(id),
    ]);
    return {
      customer,
      contacts,
      opportunities,
      totalAmount: opportunities.reduce(
        (sum, opportunity) => sum + opportunity.amount,
        0,
      ),
    };
  }

  private async listOpportunitiesForCustomer(
    customerId: number,
  ): Promise<OpportunityView[]> {
    const rows = await this.opportunities().findMany({
      filter: { customerId },
      sort: (sort) => sort.field('name').asc(),
    });
    return rows.map(toOpportunityView);
  }

  private async assertCustomerExists(customerId: number): Promise<void> {
    if (!(await this.getCustomer(customerId))) {
      throw new SalesValidationError(`Unknown customer: ${customerId}.`);
    }
  }
}

export const salesServiceToken = createServiceToken<SalesService>(
  '@nocobase/app/sales',
);

export class SalesServiceProvider extends ServiceProvider<Application> {
  readonly name = 'sales';

  register(): void {
    // Bind lazily: an application with no database configured must still be
    // able to register providers, and the manager is only needed on request.
    this.app.container.singleton(salesServiceToken, (resolver) => {
      return new SalesService(resolver.resolve(databaseManagerToken));
    });
  }
}
