import type { DatabaseManager } from '@nocobase/db';

import {
  CrmNotFoundError,
  CrmValidationError,
  OPPORTUNITY_STAGES,
  type ContactInput,
  type ContactListQuery,
  type ContactRecord,
  type ContactView,
  type CustomerDetail,
  type CustomerInput,
  type CustomerListQuery,
  type CustomerRecord,
  type OpportunityInput,
  type OpportunityListQuery,
  type OpportunityRecord,
  type OpportunityView,
} from './types.js';

/**
 * Domain logic for the CRM feature. It knows records, not HTTP: the routes
 * translate its typed errors into status codes and never reach past it into
 * the database.
 */
export class CrmService {
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

  async listCustomers(
    query: CustomerListQuery = {},
  ): Promise<CustomerRecord[]> {
    const search = query.search?.trim();
    const rows = await this.customers().findMany({
      filter: (filter) => {
        const conditions = [];
        if (search) {
          conditions.push(filter.string('name').includes(search));
        }
        return filter.and(conditions);
      },
      sort: (sort) => sort.field('updatedAt').desc(),
    });

    return rows.map(normalizeCustomer);
  }

  async getCustomer(id: number): Promise<CustomerRecord> {
    const record = await this.customers().findOne({ filter: { id } });

    if (!record) {
      throw new CrmNotFoundError(`Customer ${id} was not found.`);
    }

    return normalizeCustomer(record);
  }

  async createCustomer(input: CustomerInput): Promise<CustomerRecord> {
    const now = new Date().toISOString();
    const result = await this.customers().createOne({
      values: {
        name: requireName(input.name, 'name'),
        industry: optionalText(input.industry),
        createdAt: now,
        updatedAt: now,
      },
    });

    return normalizeCustomer(result.record);
  }

  async updateCustomer(
    id: number,
    input: Partial<CustomerInput>,
  ): Promise<CustomerRecord> {
    await this.assertCustomer(id);

    const values: Partial<CustomerRecord> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.name !== undefined) {
      values.name = requireName(input.name, 'name');
    }

    if (input.industry !== undefined) {
      values.industry = optionalText(input.industry);
    }

    const result = await this.customers().updateOne({
      filter: { id },
      values,
    });

    return normalizeCustomer(result.record);
  }

  async getCustomerDetail(id: number): Promise<CustomerDetail> {
    const customer = await this.getCustomer(id);
    const [contacts, opportunities, aggregate] = await Promise.all([
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

    const names = new Map<number, string>([[customer.id, customer.name]]);

    return {
      customer,
      contacts: contacts.map((record) => normalizeContact(record, names)),
      opportunities: opportunities.map((record) =>
        normalizeOpportunity(record, names),
      ),
      totalExpectedAmount: Number(aggregate.total ?? 0),
    };
  }

  async listContacts(query: ContactListQuery = {}): Promise<ContactView[]> {
    const search = query.search?.trim();
    const customerId = query.customerId;

    const rows = await this.contacts().findMany({
      filter: (filter) => {
        const conditions = [];
        if (search) {
          conditions.push(filter.string('name').includes(search));
        }
        if (customerId !== undefined) {
          conditions.push(filter.number('customerId').eq(customerId));
        }
        return filter.and(conditions);
      },
      sort: (sort) => sort.field('updatedAt').desc(),
    });

    const names = await this.customerNames();
    return rows.map((record) => normalizeContact(record, names));
  }

  async createContact(input: ContactInput): Promise<ContactView> {
    const customerId = requirePositiveInteger(input.customerId, 'customerId');
    await this.assertCustomer(customerId);

    const now = new Date().toISOString();
    const result = await this.contacts().createOne({
      values: {
        name: requireName(input.name, 'name'),
        phone: optionalText(input.phone),
        email: optionalText(input.email),
        customerId,
        createdAt: now,
        updatedAt: now,
      },
    });

    const names = await this.customerNames();
    return normalizeContact(result.record, names);
  }

  async getContact(id: number): Promise<ContactView> {
    const record = await this.contacts().findOne({ filter: { id } });

    if (!record) {
      throw new CrmNotFoundError(`Contact ${id} was not found.`);
    }

    const names = await this.customerNames();
    return normalizeContact(record, names);
  }

  async updateContact(
    id: number,
    input: Partial<ContactInput>,
  ): Promise<ContactView> {
    const existing = await this.contacts().findOne({ filter: { id } });

    if (!existing) {
      throw new CrmNotFoundError(`Contact ${id} was not found.`);
    }

    const values: Partial<ContactRecord> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.name !== undefined) {
      values.name = requireName(input.name, 'name');
    }

    if (input.customerId !== undefined) {
      const customerId = requirePositiveInteger(input.customerId, 'customerId');
      await this.assertCustomer(customerId);
      values.customerId = customerId;
    }

    if (input.phone !== undefined) {
      values.phone = optionalText(input.phone);
    }

    if (input.email !== undefined) {
      values.email = optionalText(input.email);
    }

    const result = await this.contacts().updateOne({
      filter: { id },
      values,
    });

    const names = await this.customerNames();
    return normalizeContact(result.record, names);
  }

  async listOpportunities(
    query: OpportunityListQuery = {},
  ): Promise<OpportunityView[]> {
    const search = query.search?.trim();
    const customerId = query.customerId;
    const stage = query.stage?.trim();

    const rows = await this.opportunities().findMany({
      filter: (filter) => {
        const conditions = [];
        if (search) {
          conditions.push(filter.string('name').includes(search));
        }
        if (customerId !== undefined) {
          conditions.push(filter.number('customerId').eq(customerId));
        }
        if (stage) {
          conditions.push(filter.string('stage').eq(stage));
        }
        return filter.and(conditions);
      },
      sort: (sort) => sort.field('updatedAt').desc(),
    });

    const names = await this.customerNames();
    return rows.map((record) => normalizeOpportunity(record, names));
  }

  async createOpportunity(input: OpportunityInput): Promise<OpportunityView> {
    const customerId = requirePositiveInteger(input.customerId, 'customerId');
    await this.assertCustomer(customerId);

    const now = new Date().toISOString();
    const result = await this.opportunities().createOne({
      values: {
        name: requireName(input.name, 'name'),
        customerId,
        amount: normalizeAmount(input.amount),
        stage: normalizeStage(input.stage),
        createdAt: now,
        updatedAt: now,
      },
    });

    const names = await this.customerNames();
    return normalizeOpportunity(result.record, names);
  }

  async getOpportunity(id: number): Promise<OpportunityView> {
    const record = await this.opportunities().findOne({ filter: { id } });

    if (!record) {
      throw new CrmNotFoundError(`Opportunity ${id} was not found.`);
    }

    const names = await this.customerNames();
    return normalizeOpportunity(record, names);
  }

  async updateOpportunity(
    id: number,
    input: Partial<OpportunityInput>,
  ): Promise<OpportunityView> {
    const existing = await this.opportunities().findOne({ filter: { id } });

    if (!existing) {
      throw new CrmNotFoundError(`Opportunity ${id} was not found.`);
    }

    const values: Partial<OpportunityRecord> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.name !== undefined) {
      values.name = requireName(input.name, 'name');
    }

    if (input.customerId !== undefined) {
      const customerId = requirePositiveInteger(input.customerId, 'customerId');
      await this.assertCustomer(customerId);
      values.customerId = customerId;
    }

    if (input.amount !== undefined) {
      values.amount = normalizeAmount(input.amount);
    }

    if (input.stage !== undefined) {
      values.stage = normalizeStage(input.stage);
    }

    const result = await this.opportunities().updateOne({
      filter: { id },
      values,
    });

    const names = await this.customerNames();
    return normalizeOpportunity(result.record, names);
  }

  private async assertCustomer(id: number): Promise<void> {
    const exists = await this.customers().exists({ filter: { id } });

    if (!exists) {
      throw new CrmNotFoundError(`Customer ${id} was not found.`);
    }
  }

  private async customerNames(): Promise<Map<number, string>> {
    const rows = await this.customers().findMany();
    return new Map(rows.map((row) => [row.id, row.name]));
  }
}

export function createCrmService(database: DatabaseManager): CrmService {
  return new CrmService(database);
}

function requireName(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CrmValidationError(`${field} is required.`, field);
  }

  return value.trim();
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new CrmValidationError('Expected a text value.');
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function requirePositiveInteger(value: unknown, field: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CrmValidationError(`${field} must be a positive integer.`, field);
  }

  return parsed;
}

function normalizeAmount(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  const amount = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new CrmValidationError(
      'amount must be a non-negative number.',
      'amount',
    );
  }

  return amount;
}

function normalizeStage(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return 'follow_up';
  }

  if (
    typeof value !== 'string' ||
    !(OPPORTUNITY_STAGES as readonly string[]).includes(value)
  ) {
    throw new CrmValidationError(
      `stage must be one of ${OPPORTUNITY_STAGES.join(', ')}.`,
      'stage',
    );
  }

  return value;
}

function normalizeCustomer(record: CustomerRecord): CustomerRecord {
  return {
    ...record,
    industry: record.industry ?? null,
  };
}

function normalizeContact(
  record: ContactRecord,
  names: Map<number, string>,
): ContactView {
  return {
    ...record,
    phone: record.phone ?? null,
    email: record.email ?? null,
    customerName: names.get(record.customerId) ?? null,
  };
}

function normalizeOpportunity(
  record: OpportunityRecord,
  names: Map<number, string>,
): OpportunityView {
  return {
    ...record,
    amount: Number(record.amount ?? 0),
    customerName: names.get(record.customerId) ?? null,
  };
}
