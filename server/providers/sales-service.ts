import type { DatabaseManager } from '@nocobase/db';
import { createServiceToken } from '@nocobase/service-provider';

/**
 * The three stages an opportunity moves through. The list is the single source
 * of truth for the database enum, the API validation and the client filter.
 */
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

export interface CustomerInput {
  readonly name: string;
  readonly industry: string | null;
}

export interface ContactInput {
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly customerId: number;
}

export interface OpportunityInput {
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

/** The data access the service needs, kept narrow so tests can provide a fake. */
export interface SalesStore {
  listCustomers(): Promise<CustomerRecord[]>;
  getCustomer(id: number): Promise<CustomerRecord | undefined>;
  createCustomer(values: CustomerInput): Promise<CustomerRecord>;
  updateCustomer(
    id: number,
    values: Partial<CustomerInput>,
  ): Promise<CustomerRecord | undefined>;

  listContacts(filter?: {
    readonly customerId?: number;
  }): Promise<ContactRecord[]>;
  getContact(id: number): Promise<ContactRecord | undefined>;
  createContact(values: ContactInput): Promise<ContactRecord>;
  updateContact(
    id: number,
    values: Partial<ContactInput>,
  ): Promise<ContactRecord | undefined>;

  listOpportunities(filter?: {
    readonly customerId?: number;
    readonly stage?: OpportunityStage;
  }): Promise<OpportunityRecord[]>;
  getOpportunity(id: number): Promise<OpportunityRecord | undefined>;
  createOpportunity(values: OpportunityInput): Promise<OpportunityRecord>;
  updateOpportunity(
    id: number,
    values: Partial<OpportunityInput>,
  ): Promise<OpportunityRecord | undefined>;
}

/** A customer with the records that belong to it and the total they add up to. */
export interface CustomerDetail extends CustomerRecord {
  readonly contacts: ContactRecord[];
  readonly opportunities: OpportunityRecord[];
  readonly totalOpportunityAmount: number;
}

/**
 * The expected amount of every opportunity given, rounded to cents. It is
 * always called with one customer's opportunities, so another customer's
 * amounts can never enter the total.
 */
export function totalOpportunityAmount(
  opportunities: readonly OpportunityRecord[],
): number {
  const total = opportunities.reduce(
    (sum, opportunity) => sum + opportunity.amount,
    0,
  );
  return Math.round(total * 100) / 100;
}

export class SalesService {
  constructor(private readonly store: SalesStore) {}

  listCustomers(): Promise<CustomerRecord[]> {
    return this.store.listCustomers();
  }

  getCustomer(id: number): Promise<CustomerRecord | undefined> {
    return this.store.getCustomer(id);
  }

  async getCustomerDetail(id: number): Promise<CustomerDetail | undefined> {
    const customer = await this.store.getCustomer(id);
    if (!customer) {
      return undefined;
    }
    const [contacts, opportunities] = await Promise.all([
      this.store.listContacts({ customerId: id }),
      this.store.listOpportunities({ customerId: id }),
    ]);
    return {
      ...customer,
      contacts,
      opportunities,
      totalOpportunityAmount: totalOpportunityAmount(opportunities),
    };
  }

  createCustomer(input: CustomerInput): Promise<CustomerRecord> {
    return this.store.createCustomer(input);
  }

  updateCustomer(
    id: number,
    input: Partial<CustomerInput>,
  ): Promise<CustomerRecord | undefined> {
    return this.store.updateCustomer(id, input);
  }

  listContacts(filter?: {
    readonly customerId?: number;
  }): Promise<ContactRecord[]> {
    return this.store.listContacts(filter);
  }

  getContact(id: number): Promise<ContactRecord | undefined> {
    return this.store.getContact(id);
  }

  createContact(input: ContactInput): Promise<ContactRecord> {
    return this.store.createContact(input);
  }

  updateContact(
    id: number,
    input: Partial<ContactInput>,
  ): Promise<ContactRecord | undefined> {
    return this.store.updateContact(id, input);
  }

  listOpportunities(filter?: {
    readonly customerId?: number;
    readonly stage?: OpportunityStage;
  }): Promise<OpportunityRecord[]> {
    return this.store.listOpportunities(filter);
  }

  getOpportunity(id: number): Promise<OpportunityRecord | undefined> {
    return this.store.getOpportunity(id);
  }

  createOpportunity(input: OpportunityInput): Promise<OpportunityRecord> {
    return this.store.createOpportunity(input);
  }

  updateOpportunity(
    id: number,
    input: Partial<OpportunityInput>,
  ): Promise<OpportunityRecord | undefined> {
    return this.store.updateOpportunity(id, input);
  }
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asText(value: unknown): string | null {
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
  return null;
}

function asNullableString(value: unknown): string | null {
  return asText(value);
}

function asString(value: unknown): string {
  return asText(value) ?? '';
}

function asIsoDate(value: unknown, fallback: string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return fallback;
}

function asStage(value: unknown): OpportunityStage {
  return OPPORTUNITY_STAGES.includes(value as OpportunityStage)
    ? (value as OpportunityStage)
    : 'following';
}

/** Maps a stored row to the shape the API returns, normalising amount and dates. */
export class DatabaseSalesStore implements SalesStore {
  constructor(private readonly database: DatabaseManager) {}

  private repository(collection: string) {
    return this.database.repository(collection);
  }

  private toCustomer(row: Record<string, unknown>): CustomerRecord {
    const now = new Date().toISOString();
    return {
      id: asNumber(row.id),
      name: asString(row.name),
      industry: asNullableString(row.industry),
      createdAt: asIsoDate(row.createdAt, now),
      updatedAt: asIsoDate(row.updatedAt, now),
    };
  }

  private toContact(row: Record<string, unknown>): ContactRecord {
    const now = new Date().toISOString();
    return {
      id: asNumber(row.id),
      name: asString(row.name),
      phone: asNullableString(row.phone),
      email: asNullableString(row.email),
      customerId: asNumber(row.customerId),
      createdAt: asIsoDate(row.createdAt, now),
      updatedAt: asIsoDate(row.updatedAt, now),
    };
  }

  private toOpportunity(row: Record<string, unknown>): OpportunityRecord {
    const now = new Date().toISOString();
    return {
      id: asNumber(row.id),
      name: asString(row.name),
      customerId: asNumber(row.customerId),
      amount: asNumber(row.amount),
      stage: asStage(row.stage),
      createdAt: asIsoDate(row.createdAt, now),
      updatedAt: asIsoDate(row.updatedAt, now),
    };
  }

  /**
   * Read a collection in id order, applying a filter only when there is one.
   * An empty filter object is rejected by the repository, so the no-filter case
   * must omit the key rather than pass `{}`.
   */
  private async loadRows(
    collection: string,
    conditions: Record<string, string | number | boolean | null>,
  ): Promise<Record<string, unknown>[]> {
    const repository = this.repository(collection);
    return Object.keys(conditions).length === 0
      ? await repository.findMany({ sort: (sort) => sort.field('id').asc() })
      : await repository.findMany({
          filter: conditions,
          sort: (sort) => sort.field('id').asc(),
        });
  }

  async listCustomers(): Promise<CustomerRecord[]> {
    const rows = await this.repository('customers').findMany({
      sort: (sort) => sort.field('id').asc(),
    });
    return rows.map((row) => this.toCustomer(row));
  }

  async getCustomer(id: number): Promise<CustomerRecord | undefined> {
    const row = await this.repository('customers').findOne({
      filter: { id },
    });
    return row ? this.toCustomer(row) : undefined;
  }

  async createCustomer(values: CustomerInput): Promise<CustomerRecord> {
    const now = new Date().toISOString();
    const result = await this.repository('customers').createOne({
      values: { ...values, createdAt: now, updatedAt: now },
    });
    return this.toCustomer(result.record);
  }

  async updateCustomer(
    id: number,
    values: Partial<CustomerInput>,
  ): Promise<CustomerRecord | undefined> {
    const repository = this.repository('customers');
    const existing = await repository.findOne({ filter: { id } });
    if (!existing) {
      return undefined;
    }
    const result = await repository.updateOne({
      filter: { id },
      values: { ...values, updatedAt: new Date().toISOString() },
    });
    return this.toCustomer(result.record);
  }

  async listContacts(filter?: {
    readonly customerId?: number;
  }): Promise<ContactRecord[]> {
    const rows = await this.loadRows(
      'contacts',
      filter?.customerId === undefined ? {} : { customerId: filter.customerId },
    );
    return rows.map((row) => this.toContact(row));
  }

  async getContact(id: number): Promise<ContactRecord | undefined> {
    const row = await this.repository('contacts').findOne({ filter: { id } });
    return row ? this.toContact(row) : undefined;
  }

  async createContact(values: ContactInput): Promise<ContactRecord> {
    const now = new Date().toISOString();
    const result = await this.repository('contacts').createOne({
      values: { ...values, createdAt: now, updatedAt: now },
    });
    return this.toContact(result.record);
  }

  async updateContact(
    id: number,
    values: Partial<ContactInput>,
  ): Promise<ContactRecord | undefined> {
    const repository = this.repository('contacts');
    const existing = await repository.findOne({ filter: { id } });
    if (!existing) {
      return undefined;
    }
    const result = await repository.updateOne({
      filter: { id },
      values: { ...values, updatedAt: new Date().toISOString() },
    });
    return this.toContact(result.record);
  }

  async listOpportunities(filter?: {
    readonly customerId?: number;
    readonly stage?: OpportunityStage;
  }): Promise<OpportunityRecord[]> {
    const conditions: Record<string, string | number | boolean | null> = {};
    if (filter?.customerId !== undefined) {
      conditions.customerId = filter.customerId;
    }
    if (filter?.stage !== undefined) {
      conditions.stage = filter.stage;
    }
    const rows = await this.loadRows('opportunities', conditions);
    return rows.map((row) => this.toOpportunity(row));
  }

  async getOpportunity(id: number): Promise<OpportunityRecord | undefined> {
    const row = await this.repository('opportunities').findOne({
      filter: { id },
    });
    return row ? this.toOpportunity(row) : undefined;
  }

  async createOpportunity(
    values: OpportunityInput,
  ): Promise<OpportunityRecord> {
    const now = new Date().toISOString();
    const result = await this.repository('opportunities').createOne({
      values: { ...values, createdAt: now, updatedAt: now },
    });
    return this.toOpportunity(result.record);
  }

  async updateOpportunity(
    id: number,
    values: Partial<OpportunityInput>,
  ): Promise<OpportunityRecord | undefined> {
    const repository = this.repository('opportunities');
    const existing = await repository.findOne({ filter: { id } });
    if (!existing) {
      return undefined;
    }
    const result = await repository.updateOne({
      filter: { id },
      values: { ...values, updatedAt: new Date().toISOString() },
    });
    return this.toOpportunity(result.record);
  }
}

export const salesServiceToken =
  createServiceToken<SalesService>('salesService');
