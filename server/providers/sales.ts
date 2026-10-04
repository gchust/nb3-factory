import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';

/** The three opportunity stages the business allows. Values are stored, never the localized labels. */
export const OPPORTUNITY_STAGES = ['following_up', 'won', 'lost'] as const;

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
  readonly phone: string | null;
  readonly email: string | null;
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
  /** The sum of every opportunity amount belonging to this customer, rounded to two decimals. */
  readonly opportunityAmountTotal: number;
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

export interface ListQuery {
  readonly search?: string;
  readonly customerId?: number;
  readonly stage?: OpportunityStage;
}

/**
 * A validation or not-found failure the HTTP layer renders as `{ code, message }`.
 *
 * The service owns the code; the route owns the HTTP status and translates the code. The message is an English
 * fallback used when no translation is available.
 */
export class SalesError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SalesError';
  }
}

export interface SalesService {
  listCustomers(query?: ListQuery): Promise<Customer[]>;
  getCustomer(id: number): Promise<CustomerDetail | undefined>;
  createCustomer(input: CustomerInput): Promise<Customer>;
  updateCustomer(id: number, input: CustomerInput): Promise<Customer>;
  deleteCustomer(id: number): Promise<void>;

  listContacts(query?: ListQuery): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  createContact(input: ContactInput): Promise<Contact>;
  updateContact(id: number, input: ContactInput): Promise<Contact>;
  deleteContact(id: number): Promise<void>;

  listOpportunities(query?: ListQuery): Promise<Opportunity[]>;
  getOpportunity(id: number): Promise<Opportunity | undefined>;
  createOpportunity(input: OpportunityInput): Promise<Opportunity>;
  updateOpportunity(id: number, input: OpportunityInput): Promise<Opportunity>;
  deleteOpportunity(id: number): Promise<void>;
}

export const salesServiceToken = createServiceToken<SalesService>('app/sales');

/** The DB shape of a row. `amount` arrives as a decimal string; the DTO converts it to a number. */
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
  amount: string | number;
  stage: string;
  createdAt: string;
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

/**
 * A trimmed required name, or a `SalesError`. The message is a fallback; the route translates by `code`.
 */
function requireName(value: unknown, code: string, label: string): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) {
    throw new SalesError(code, `${label} is required.`);
  }
  if (name.length > 255) {
    throw new SalesError(code, `${label} must be 255 characters or fewer.`);
  }
  return name;
}

/** An optional free-text field normalised to a trimmed string or null. */
function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  return text === '' ? null : text;
}

function normalizeAmount(value: unknown): number {
  let amount: number;
  if (value === undefined || value === null || value === '') {
    amount = 0;
  } else if (typeof value === 'number') {
    amount = value;
  } else if (typeof value === 'string') {
    amount = Number(value.trim());
  } else {
    amount = Number.NaN;
  }
  if (!Number.isFinite(amount) || amount < 0) {
    throw new SalesError('INVALID_AMOUNT', 'Amount must be zero or greater.');
  }
  // The column holds two decimals; rounding here keeps the service and the sum consistent with it.
  return Math.round(amount * 100) / 100;
}

function normalizeStage(value: unknown): OpportunityStage {
  if (value === undefined || value === null || value === '') {
    return 'following_up';
  }
  if (!isOpportunityStage(value)) {
    throw new SalesError(
      'INVALID_STAGE',
      `Stage must be one of: ${OPPORTUNITY_STAGES.join(', ')}.`,
    );
  }
  return value;
}

function requireId(value: unknown, code: string, label: string): number {
  let id: number;
  if (typeof value === 'number') {
    id = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    id = Number(value.trim());
  } else {
    id = Number.NaN;
  }
  if (!Number.isInteger(id) || id <= 0) {
    throw new SalesError(code, `${label} is required.`);
  }
  return id;
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toContact(
  row: ContactRow,
  customerNames: Map<number, string>,
): Contact {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    customerId: row.customerId,
    customerName: customerNames.get(row.customerId) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toAmount(value: string | number): number {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function toOpportunity(
  row: OpportunityRow,
  customerNames: Map<number, string>,
): Opportunity {
  return {
    id: row.id,
    name: row.name,
    customerId: row.customerId,
    customerName: customerNames.get(row.customerId) ?? null,
    amount: toAmount(row.amount),
    // The enum column is validated on write, so a stored value is always one of the three.
    stage: isOpportunityStage(row.stage) ? row.stage : 'following_up',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * The sales domain: customers, their contacts and their opportunities.
 *
 * It reads and writes through the Repository so the HTTP layer owns request parsing, and depends only on the
 * application database manager rather than on a connection name.
 */
export class DefaultSalesService implements SalesService {
  constructor(private readonly db: DatabaseManager) {}

  private customers(): Repository<CustomerRow> {
    return this.db.repository<CustomerRow>('customers');
  }

  private contacts(): Repository<ContactRow> {
    return this.db.repository<ContactRow>('contacts');
  }

  private opportunities(): Repository<OpportunityRow> {
    return this.db.repository<OpportunityRow>('opportunities');
  }

  /** Look up the names for the customer ids a list page is about to render, so it needs one query rather than one per row. */
  private async customerNames(): Promise<Map<number, string>> {
    const rows = await this.customers().findMany({ limit: 1000 });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private async customerExists(id: number): Promise<boolean> {
    return this.customers().exists({ filter: { id } });
  }

  async listCustomers(query: ListQuery = {}): Promise<Customer[]> {
    const search = query.search?.trim();
    const rows = await this.customers().findMany({
      ...(search
        ? {
            filter: (filter) =>
              filter.string('name').includes(search, { mode: 'insensitive' }),
          }
        : {}),
      sort: (sort) => [sort.field('name').asc(), sort.field('id').asc()],
      limit: 1000,
    });
    return rows.map(toCustomer);
  }

  async getCustomer(id: number): Promise<CustomerDetail | undefined> {
    const row = await this.customers().findOne({ filter: { id } });
    if (!row) {
      return undefined;
    }
    const names = await this.customerNames();
    const [contacts, opportunities] = await Promise.all([
      this.contacts().findMany({
        filter: { customerId: id },
        sort: (sort) => [sort.field('name').asc(), sort.field('id').asc()],
        limit: 1000,
      }),
      this.opportunities().findMany({
        filter: { customerId: id },
        sort: (sort) => [
          sort.field('createdAt').desc(),
          sort.field('id').desc(),
        ],
        limit: 1000,
      }),
    ]);
    const opportunityAmountTotal =
      Math.round(
        opportunities.reduce((total, row) => total + toAmount(row.amount), 0) *
          100,
      ) / 100;
    return {
      ...toCustomer(row),
      contacts: contacts.map((contact) => toContact(contact, names)),
      opportunities: opportunities.map((opportunity) =>
        toOpportunity(opportunity, names),
      ),
      opportunityAmountTotal,
    };
  }

  async createCustomer(input: CustomerInput): Promise<Customer> {
    const name = requireName(
      input.name,
      'CUSTOMER_NAME_REQUIRED',
      'Customer name',
    );
    const timestamp = nowIso();
    const created = await this.customers().createOne({
      values: {
        name,
        industry: optionalText(input.industry),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    return toCustomer(created.record);
  }

  async updateCustomer(id: number, input: CustomerInput): Promise<Customer> {
    const existing = await this.customers().findOne({ filter: { id } });
    if (!existing) {
      throw new SalesError(
        'CUSTOMER_NOT_FOUND',
        'The customer does not exist.',
      );
    }
    const values: Partial<CustomerRow> = { updatedAt: nowIso() };
    if (hasOwn(input, 'name')) {
      values.name = requireName(
        input.name,
        'CUSTOMER_NAME_REQUIRED',
        'Customer name',
      );
    }
    if (hasOwn(input, 'industry')) {
      values.industry = optionalText(input.industry);
    }
    const updated = await this.customers().updateOne({
      filter: { id },
      values,
    });
    return toCustomer(updated.record);
  }

  async deleteCustomer(id: number): Promise<void> {
    const existing = await this.customers().findOne({ filter: { id } });
    if (!existing) {
      throw new SalesError(
        'CUSTOMER_NOT_FOUND',
        'The customer does not exist.',
      );
    }
    const [contactCount, opportunityCount] = await Promise.all([
      this.contacts().count({ filter: { customerId: id } }),
      this.opportunities().count({ filter: { customerId: id } }),
    ]);
    if (contactCount > 0 || opportunityCount > 0) {
      throw new SalesError(
        'CUSTOMER_HAS_RELATED_RECORDS',
        'This customer still has contacts or opportunities.',
      );
    }
    await this.customers().deleteOne({ filter: { id } });
  }

  async listContacts(query: ListQuery = {}): Promise<Contact[]> {
    const search = query.search?.trim();
    const customerId = query.customerId;
    const names = await this.customerNames();
    const rows = await this.contacts().findMany({
      ...(search || customerId !== undefined
        ? {
            filter: (filter) =>
              filter.and([
                ...(search
                  ? [
                      filter
                        .string('name')
                        .includes(search, { mode: 'insensitive' }),
                    ]
                  : []),
                ...(customerId !== undefined
                  ? [filter.number('customerId').eq(customerId)]
                  : []),
              ]),
          }
        : {}),
      sort: (sort) => [sort.field('name').asc(), sort.field('id').asc()],
      limit: 1000,
    });
    return rows.map((row) => toContact(row, names));
  }

  async getContact(id: number): Promise<Contact | undefined> {
    const row = await this.contacts().findOne({ filter: { id } });
    if (!row) {
      return undefined;
    }
    const names = await this.customerNames();
    return toContact(row, names);
  }

  async createContact(input: ContactInput): Promise<Contact> {
    const name = requireName(
      input.name,
      'CONTACT_NAME_REQUIRED',
      'Contact name',
    );
    const customerId = requireId(
      input.customerId,
      'CONTACT_CUSTOMER_REQUIRED',
      'Customer',
    );
    if (!(await this.customerExists(customerId))) {
      throw new SalesError(
        'CUSTOMER_NOT_FOUND',
        'The customer does not exist.',
      );
    }
    const timestamp = nowIso();
    const created = await this.contacts().createOne({
      values: {
        name,
        phone: optionalText(input.phone),
        email: optionalText(input.email),
        customerId,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    const names = await this.customerNames();
    return toContact(created.record, names);
  }

  async updateContact(id: number, input: ContactInput): Promise<Contact> {
    const existing = await this.contacts().findOne({ filter: { id } });
    if (!existing) {
      throw new SalesError('CONTACT_NOT_FOUND', 'The contact does not exist.');
    }
    const values: Partial<ContactRow> = { updatedAt: nowIso() };
    if (hasOwn(input, 'name')) {
      values.name = requireName(
        input.name,
        'CONTACT_NAME_REQUIRED',
        'Contact name',
      );
    }
    if (hasOwn(input, 'phone')) {
      values.phone = optionalText(input.phone);
    }
    if (hasOwn(input, 'email')) {
      values.email = optionalText(input.email);
    }
    if (hasOwn(input, 'customerId')) {
      const customerId = requireId(
        input.customerId,
        'CONTACT_CUSTOMER_REQUIRED',
        'Customer',
      );
      if (!(await this.customerExists(customerId))) {
        throw new SalesError(
          'CUSTOMER_NOT_FOUND',
          'The customer does not exist.',
        );
      }
      values.customerId = customerId;
    }
    const updated = await this.contacts().updateOne({ filter: { id }, values });
    const names = await this.customerNames();
    return toContact(updated.record, names);
  }

  async deleteContact(id: number): Promise<void> {
    const existing = await this.contacts().findOne({ filter: { id } });
    if (!existing) {
      throw new SalesError('CONTACT_NOT_FOUND', 'The contact does not exist.');
    }
    await this.contacts().deleteOne({ filter: { id } });
  }

  async listOpportunities(query: ListQuery = {}): Promise<Opportunity[]> {
    const search = query.search?.trim();
    const stage = query.stage;
    const customerId = query.customerId;
    const names = await this.customerNames();
    const rows = await this.opportunities().findMany({
      ...(search || stage !== undefined || customerId !== undefined
        ? {
            filter: (filter) =>
              filter.and([
                ...(search
                  ? [
                      filter
                        .string('name')
                        .includes(search, { mode: 'insensitive' }),
                    ]
                  : []),
                ...(stage !== undefined
                  ? [filter.string('stage').eq(stage)]
                  : []),
                ...(customerId !== undefined
                  ? [filter.number('customerId').eq(customerId)]
                  : []),
              ]),
          }
        : {}),
      sort: (sort) => [sort.field('createdAt').desc(), sort.field('id').desc()],
      limit: 1000,
    });
    return rows.map((row) => toOpportunity(row, names));
  }

  async getOpportunity(id: number): Promise<Opportunity | undefined> {
    const row = await this.opportunities().findOne({ filter: { id } });
    if (!row) {
      return undefined;
    }
    const names = await this.customerNames();
    return toOpportunity(row, names);
  }

  async createOpportunity(input: OpportunityInput): Promise<Opportunity> {
    const name = requireName(
      input.name,
      'OPPORTUNITY_NAME_REQUIRED',
      'Opportunity name',
    );
    const customerId = requireId(
      input.customerId,
      'OPPORTUNITY_CUSTOMER_REQUIRED',
      'Customer',
    );
    if (!(await this.customerExists(customerId))) {
      throw new SalesError(
        'CUSTOMER_NOT_FOUND',
        'The customer does not exist.',
      );
    }
    const timestamp = nowIso();
    const created = await this.opportunities().createOne({
      values: {
        name,
        customerId,
        amount: normalizeAmount(input.amount),
        stage: normalizeStage(input.stage),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    const names = await this.customerNames();
    return toOpportunity(created.record, names);
  }

  async updateOpportunity(
    id: number,
    input: OpportunityInput,
  ): Promise<Opportunity> {
    const existing = await this.opportunities().findOne({ filter: { id } });
    if (!existing) {
      throw new SalesError(
        'OPPORTUNITY_NOT_FOUND',
        'The opportunity does not exist.',
      );
    }
    const values: Partial<OpportunityRow> = { updatedAt: nowIso() };
    if (hasOwn(input, 'name')) {
      values.name = requireName(
        input.name,
        'OPPORTUNITY_NAME_REQUIRED',
        'Opportunity name',
      );
    }
    if (hasOwn(input, 'amount')) {
      values.amount = normalizeAmount(input.amount);
    }
    if (hasOwn(input, 'stage')) {
      values.stage = normalizeStage(input.stage);
    }
    if (hasOwn(input, 'customerId')) {
      const customerId = requireId(
        input.customerId,
        'OPPORTUNITY_CUSTOMER_REQUIRED',
        'Customer',
      );
      if (!(await this.customerExists(customerId))) {
        throw new SalesError(
          'CUSTOMER_NOT_FOUND',
          'The customer does not exist.',
        );
      }
      values.customerId = customerId;
    }
    const updated = await this.opportunities().updateOne({
      filter: { id },
      values,
    });
    const names = await this.customerNames();
    return toOpportunity(updated.record, names);
  }

  async deleteOpportunity(id: number): Promise<void> {
    const existing = await this.opportunities().findOne({ filter: { id } });
    if (!existing) {
      throw new SalesError(
        'OPPORTUNITY_NOT_FOUND',
        'The opportunity does not exist.',
      );
    }
    await this.opportunities().deleteOne({ filter: { id } });
  }
}

export class SalesProvider extends ServiceProvider<Application> {
  readonly name = 'sales';

  register(): void {
    const { container } = this.app;
    container.singleton(salesServiceToken, (c) => {
      if (!c.has(databaseManagerToken)) {
        throw new Error('The sales service requires the application database.');
      }
      return new DefaultSalesService(c.resolve(databaseManagerToken));
    });
  }
}
