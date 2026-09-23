import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** The three pipeline stages an opportunity can be in. The stored value is the key, never a label. */
export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export function isOpportunityStage(value: unknown): value is OpportunityStage {
  return (
    typeof value === 'string' &&
    (OPPORTUNITY_STAGES as readonly string[]).includes(value)
  );
}

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Contact {
  readonly id: number;
  readonly name: string;
  readonly contactInfo: string | null;
  readonly customerId: number;
  readonly customerName: string;
}

export interface Opportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly customerName: string;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

export interface CustomerDetail extends Customer {
  readonly contacts: readonly Contact[];
  readonly opportunities: readonly Opportunity[];
  /** Sum of this customer's opportunity amounts, computed from the stored records. */
  readonly opportunityAmountTotal: number;
}

/** A request body failed business validation. Routes translate this to `400`. */
export class CrmValidationError extends Error {
  public readonly code = 'INVALID_INPUT';

  public constructor(message: string) {
    super(message);
    this.name = 'CrmValidationError';
  }
}

/** A referenced record does not exist. Routes translate this to `404`. */
export class CrmNotFoundError extends Error {
  public readonly code = 'NOT_FOUND';

  public constructor(message: string) {
    super(message);
    this.name = 'CrmNotFoundError';
  }
}

export interface CrmService {
  listCustomers(): Promise<Customer[]>;
  getCustomer(id: number): Promise<CustomerDetail | null>;
  createCustomer(input: Record<string, unknown>): Promise<Customer>;
  updateCustomer(id: number, input: Record<string, unknown>): Promise<Customer>;

  listContacts(): Promise<Contact[]>;
  createContact(input: Record<string, unknown>): Promise<Contact>;
  updateContact(id: number, input: Record<string, unknown>): Promise<Contact>;

  listOpportunities(stage?: OpportunityStage): Promise<Opportunity[]>;
  createOpportunity(input: Record<string, unknown>): Promise<Opportunity>;
  updateOpportunity(
    id: number,
    input: Record<string, unknown>,
  ): Promise<Opportunity>;
}

export const crmServiceToken: ServiceToken<CrmService> =
  createServiceToken<CrmService>('app/crm-service');

export function createCrmService(database: DatabaseManager): CrmService {
  const query = database.query();

  async function customerName(id: number): Promise<string> {
    const row = await query
      .selectFrom('customers')
      .select(['name'])
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? String(row.name) : '';
  }

  async function requireCustomer(id: number): Promise<void> {
    const row = await query
      .selectFrom('customers')
      .select(['id'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row)
      throw new CrmValidationError('The selected customer does not exist.');
  }

  async function getCustomerRecord(id: number): Promise<Customer | null> {
    const row = await query
      .selectFrom('customers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? mapCustomer(row) : null;
  }

  async function getContactRow(id: number): Promise<Contact | null> {
    const row = await query
      .selectFrom('contacts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return null;
    return {
      ...mapContact(row),
      customerName: await customerName(Number(row.customerId)),
    };
  }

  async function getOpportunityRow(id: number): Promise<Opportunity | null> {
    const row = await query
      .selectFrom('opportunities')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return null;
    return {
      ...mapOpportunity(row),
      customerName: await customerName(Number(row.customerId)),
    };
  }

  async function assertRowExists(
    table: 'customers' | 'contacts' | 'opportunities',
    id: number,
    label: string,
  ): Promise<void> {
    const row = await query
      .selectFrom(table)
      .select(['id'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new CrmNotFoundError(`${label} not found.`);
  }

  return {
    async listCustomers() {
      const rows = await query
        .selectFrom('customers')
        .selectAll()
        .orderBy('id', 'asc')
        .execute();
      return rows.map(mapCustomer);
    },

    async getCustomer(id) {
      const row = await query
        .selectFrom('customers')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) return null;

      const contacts = await query
        .selectFrom('contacts')
        .selectAll()
        .where('customerId', '=', id)
        .orderBy('id', 'asc')
        .execute();
      const opportunities = await query
        .selectFrom('opportunities')
        .selectAll()
        .where('customerId', '=', id)
        .orderBy('id', 'asc')
        .execute();
      const totalRow = await query
        .selectFrom('opportunities')
        .select((expression) => [expression.fn.sum('amount').as('total')])
        .where('customerId', '=', id)
        .executeTakeFirst();

      return {
        ...mapCustomer(row),
        contacts: contacts.map(mapContact),
        opportunities: opportunities.map(mapOpportunity),
        opportunityAmountTotal: Number(totalRow?.total ?? 0),
      };
    },

    async createCustomer(input) {
      const name = requireName(input.name);
      const industry = optionalString(input.industry, 'industry');
      const now = new Date();
      const result = await query
        .insertInto('customers')
        .values({ name, industry, createdAt: now, updatedAt: now })
        .execute();
      const created = await getCustomerRecord(Number(result.insertId));
      if (!created) throw new CrmNotFoundError('Customer not found.');
      return created;
    },

    async updateCustomer(id, input) {
      await assertRowExists('customers', id, 'Customer');
      const values: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) values.name = requireName(input.name);
      if (input.industry !== undefined) {
        values.industry = optionalString(input.industry, 'industry');
      }
      await query
        .updateTable('customers')
        .set(values)
        .where('id', '=', id)
        .execute();
      const updated = await getCustomerRecord(id);
      if (!updated) throw new CrmNotFoundError('Customer not found.');
      return updated;
    },

    async listContacts() {
      const rows = await query
        .selectFrom('contacts')
        .selectAll()
        .orderBy('id', 'asc')
        .execute();
      const names = await customerNames();
      return rows.map((row) => ({
        ...mapContact(row),
        customerName: names.get(Number(row.customerId)) ?? '',
      }));
    },

    async createContact(input) {
      const name = requireName(input.name);
      const contactInfo = optionalString(input.contactInfo, 'contactInfo');
      const customerId = requireId(input.customerId, 'customerId');
      await requireCustomer(customerId);
      const now = new Date();
      const result = await query
        .insertInto('contacts')
        .values({
          name,
          contactInfo,
          customerId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const contact = await getContactRow(Number(result.insertId));
      if (!contact) throw new CrmNotFoundError('Contact not found.');
      return contact;
    },

    async updateContact(id, input) {
      await assertRowExists('contacts', id, 'Contact');
      const values: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) values.name = requireName(input.name);
      if (input.contactInfo !== undefined) {
        values.contactInfo = optionalString(input.contactInfo, 'contactInfo');
      }
      if (input.customerId !== undefined) {
        const customerId = requireId(input.customerId, 'customerId');
        await requireCustomer(customerId);
        values.customerId = customerId;
      }
      await query
        .updateTable('contacts')
        .set(values)
        .where('id', '=', id)
        .execute();
      const contact = await getContactRow(id);
      if (!contact) throw new CrmNotFoundError('Contact not found.');
      return contact;
    },

    async listOpportunities(stage) {
      const base = query
        .selectFrom('opportunities')
        .selectAll()
        .orderBy('id', 'asc');
      const rows = await (
        stage === undefined ? base : base.where('stage', '=', stage)
      ).execute();
      const names = await customerNames();
      return rows.map((row) => ({
        ...mapOpportunity(row),
        customerName: names.get(Number(row.customerId)) ?? '',
      }));
    },

    async createOpportunity(input) {
      const name = requireName(input.name);
      const customerId = requireId(input.customerId, 'customerId');
      const amount = requireAmount(input.amount);
      const stage = requireStage(input.stage);
      await requireCustomer(customerId);
      const now = new Date();
      const result = await query
        .insertInto('opportunities')
        .values({
          name,
          customerId,
          amount,
          stage,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const opportunity = await getOpportunityRow(Number(result.insertId));
      if (!opportunity) throw new CrmNotFoundError('Opportunity not found.');
      return opportunity;
    },

    async updateOpportunity(id, input) {
      await assertRowExists('opportunities', id, 'Opportunity');
      const values: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) values.name = requireName(input.name);
      if (input.customerId !== undefined) {
        const customerId = requireId(input.customerId, 'customerId');
        await requireCustomer(customerId);
        values.customerId = customerId;
      }
      if (input.amount !== undefined)
        values.amount = requireAmount(input.amount);
      if (input.stage !== undefined) values.stage = requireStage(input.stage);
      await query
        .updateTable('opportunities')
        .set(values)
        .where('id', '=', id)
        .execute();
      const opportunity = await getOpportunityRow(id);
      if (!opportunity) throw new CrmNotFoundError('Opportunity not found.');
      return opportunity;
    },
  };

  async function customerNames(): Promise<Map<number, string>> {
    const rows = await query
      .selectFrom('customers')
      .select(['id', 'name'])
      .execute();
    return new Map(rows.map((row) => [Number(row.id), String(row.name)]));
  }
}

function optionalText(value: unknown): string | null {
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return null;
}

function mapCustomer(row: Row): Customer {
  return {
    id: Number(row.id),
    name: String(row.name),
    industry: optionalText(row.industry),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapContact(row: Row): Contact {
  return {
    id: Number(row.id),
    name: String(row.name),
    contactInfo: optionalText(row.contactInfo),
    customerId: Number(row.customerId),
    customerName: '',
  };
}

function mapOpportunity(row: Row): Opportunity {
  return {
    id: Number(row.id),
    name: String(row.name),
    customerId: Number(row.customerId),
    customerName: '',
    amount: Number(row.amount ?? 0),
    stage: isOpportunityStage(row.stage) ? row.stage : 'following',
  };
}

function requireName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CrmValidationError('Name is required.');
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new CrmValidationError(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requireId(value: unknown, field: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new CrmValidationError(`${field} must be a positive integer.`);
  }
  return id;
}

function requireAmount(value: unknown): number {
  const amount =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(amount) || amount < 0) {
    throw new CrmValidationError('Amount must be a non-negative number.');
  }
  return amount;
}

function requireStage(value: unknown): OpportunityStage {
  if (!isOpportunityStage(value)) {
    throw new CrmValidationError(
      `Stage must be one of: ${OPPORTUNITY_STAGES.join(', ')}.`,
    );
  }
  return value;
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
