import type {
  ContactInput,
  ContactRecord,
  CustomerInput,
  CustomerRecord,
  OpportunityInput,
  OpportunityRecord,
  OpportunityStage,
  SalesStore,
} from '../../server/providers/sales-service.js';

export interface MemoryCustomer {
  readonly id: number;
  readonly name: string;
  readonly industry?: string | null;
}

export interface MemoryContact {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly phone?: string | null;
  readonly email?: string | null;
}

export interface MemoryOpportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

export interface MemorySalesData {
  readonly customers?: readonly MemoryCustomer[];
  readonly contacts?: readonly MemoryContact[];
  readonly opportunities?: readonly MemoryOpportunity[];
}

const SEEDED_AT = Date.parse('2026-01-01T00:00:00.000Z');

/** A deterministic clock, so a record's timestamps are stable and updates advance them. */
function timestamp(step: number): string {
  return new Date(SEEDED_AT + step * 1000).toISOString();
}

/**
 * An in-memory `SalesStore` for service and route tests. It performs no
 * validation and no referential checks — those live in the route and the
 * schema — it only stores rows the way the database would return them.
 */
export class MemorySalesStore implements SalesStore {
  private readonly customers: CustomerRecord[];
  private readonly contacts: ContactRecord[];
  private readonly opportunities: OpportunityRecord[];
  private nextId: number;
  private step = 0;

  constructor(data: MemorySalesData = {}) {
    this.customers = (data.customers ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      industry: row.industry ?? null,
      createdAt: timestamp(0),
      updatedAt: timestamp(0),
    }));
    this.contacts = (data.contacts ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone ?? null,
      email: row.email ?? null,
      customerId: row.customerId,
      createdAt: timestamp(0),
      updatedAt: timestamp(0),
    }));
    this.opportunities = (data.opportunities ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      customerId: row.customerId,
      amount: row.amount,
      stage: row.stage,
      createdAt: timestamp(0),
      updatedAt: timestamp(0),
    }));
    this.nextId =
      Math.max(
        0,
        ...this.customers.map((row) => row.id),
        ...this.contacts.map((row) => row.id),
        ...this.opportunities.map((row) => row.id),
      ) + 1;
  }

  private stamp(): string {
    this.step += 1;
    return timestamp(this.step);
  }

  private takeId(): number {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  listCustomers(): Promise<CustomerRecord[]> {
    return Promise.resolve([...this.customers]);
  }

  getCustomer(id: number): Promise<CustomerRecord | undefined> {
    return Promise.resolve(this.customers.find((row) => row.id === id));
  }

  createCustomer(values: CustomerInput): Promise<CustomerRecord> {
    const now = this.stamp();
    const record: CustomerRecord = {
      id: this.takeId(),
      name: values.name,
      industry: values.industry,
      createdAt: now,
      updatedAt: now,
    };
    this.customers.push(record);
    return Promise.resolve(record);
  }

  updateCustomer(
    id: number,
    values: Partial<CustomerInput>,
  ): Promise<CustomerRecord | undefined> {
    const index = this.customers.findIndex((row) => row.id === id);
    if (index === -1) {
      return Promise.resolve(undefined);
    }
    const updated = {
      ...this.customers[index],
      ...values,
      updatedAt: this.stamp(),
    };
    this.customers[index] = updated;
    return Promise.resolve(updated);
  }

  listContacts(filter?: {
    readonly customerId?: number;
  }): Promise<ContactRecord[]> {
    return Promise.resolve(
      this.contacts.filter(
        (row) =>
          filter?.customerId === undefined ||
          row.customerId === filter.customerId,
      ),
    );
  }

  getContact(id: number): Promise<ContactRecord | undefined> {
    return Promise.resolve(this.contacts.find((row) => row.id === id));
  }

  createContact(values: ContactInput): Promise<ContactRecord> {
    const now = this.stamp();
    const record: ContactRecord = {
      id: this.takeId(),
      name: values.name,
      phone: values.phone,
      email: values.email,
      customerId: values.customerId,
      createdAt: now,
      updatedAt: now,
    };
    this.contacts.push(record);
    return Promise.resolve(record);
  }

  updateContact(
    id: number,
    values: Partial<ContactInput>,
  ): Promise<ContactRecord | undefined> {
    const index = this.contacts.findIndex((row) => row.id === id);
    if (index === -1) {
      return Promise.resolve(undefined);
    }
    const updated = {
      ...this.contacts[index],
      ...values,
      updatedAt: this.stamp(),
    };
    this.contacts[index] = updated;
    return Promise.resolve(updated);
  }

  listOpportunities(filter?: {
    readonly customerId?: number;
    readonly stage?: OpportunityStage;
  }): Promise<OpportunityRecord[]> {
    return Promise.resolve(
      this.opportunities.filter(
        (row) =>
          (filter?.customerId === undefined ||
            row.customerId === filter.customerId) &&
          (filter?.stage === undefined || row.stage === filter.stage),
      ),
    );
  }

  getOpportunity(id: number): Promise<OpportunityRecord | undefined> {
    return Promise.resolve(this.opportunities.find((row) => row.id === id));
  }

  createOpportunity(values: OpportunityInput): Promise<OpportunityRecord> {
    const now = this.stamp();
    const record: OpportunityRecord = {
      id: this.takeId(),
      name: values.name,
      customerId: values.customerId,
      amount: values.amount,
      stage: values.stage,
      createdAt: now,
      updatedAt: now,
    };
    this.opportunities.push(record);
    return Promise.resolve(record);
  }

  updateOpportunity(
    id: number,
    values: Partial<OpportunityInput>,
  ): Promise<OpportunityRecord | undefined> {
    const index = this.opportunities.findIndex((row) => row.id === id);
    if (index === -1) {
      return Promise.resolve(undefined);
    }
    const updated = {
      ...this.opportunities[index],
      ...values,
      updatedAt: this.stamp(),
    };
    this.opportunities[index] = updated;
    return Promise.resolve(updated);
  }
}
