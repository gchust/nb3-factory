import type { DatabaseManager, FilterNode, Repository } from '@nocobase/db';

import { CrmError } from './errors.js';

/** The only three stages an opportunity may be in. */
export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export function isOpportunityStage(value: unknown): value is OpportunityStage {
  return (
    typeof value === 'string' &&
    (OPPORTUNITY_STAGES as readonly string[]).includes(value)
  );
}

/** How the database stores a `datetime` column: wall-clock text, not an instant. */
type TimestampValue = Date | string;

interface CustomerRecord {
  id: number;
  name: string;
  industry: string | null;
  createdAt: TimestampValue;
  updatedAt: TimestampValue;
}

interface ContactRecord {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  customerId: number;
  createdAt: TimestampValue;
  updatedAt: TimestampValue;
}

interface OpportunityRecord {
  id: number;
  name: string;
  customerId: number;
  amount: number | string;
  stage: string;
  createdAt: TimestampValue;
  updatedAt: TimestampValue;
}

export interface CustomerDto {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContactDto {
  readonly id: number;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly customerId: number;
  readonly customerName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OpportunityDto {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly customerName: string | null;
  readonly amount: number;
  readonly stage: OpportunityStage;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerDetailDto extends CustomerDto {
  readonly contacts: readonly ContactDto[];
  readonly opportunities: readonly OpportunityDto[];
  /** Sum of `amount` over exactly this customer's opportunities. */
  readonly opportunityAmountTotal: number;
}

export interface CustomerCreateInput {
  readonly name: unknown;
  readonly industry?: unknown;
}

export interface CustomerUpdateInput {
  readonly name?: unknown;
  readonly industry?: unknown;
}

export interface ContactCreateInput {
  readonly name: unknown;
  readonly customerId: unknown;
  readonly phone?: unknown;
  readonly email?: unknown;
}

export interface ContactUpdateInput {
  readonly name?: unknown;
  readonly customerId?: unknown;
  readonly phone?: unknown;
  readonly email?: unknown;
}

export interface OpportunityCreateInput {
  readonly name: unknown;
  readonly customerId: unknown;
  readonly amount: unknown;
  readonly stage: unknown;
}

export interface OpportunityUpdateInput {
  readonly name?: unknown;
  readonly customerId?: unknown;
  readonly amount?: unknown;
  readonly stage?: unknown;
}

export interface CustomerListQuery {
  readonly search?: string;
}

export interface ContactListQuery {
  readonly search?: string;
  readonly customerId?: number;
}

export interface OpportunityListQuery {
  readonly search?: string;
  readonly stage?: OpportunityStage;
  readonly customerId?: number;
}

/** `number`, `string` and `null` are all the drivers hand back; normalize to plain text. */
function toTimestampString(value: TimestampValue): string {
  if (typeof value === 'string') return value;
  const pad = (part: number, size = 2): string =>
    String(part).padStart(size, '0');
  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
    `T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}` +
    `.${pad(value.getMilliseconds(), 3)}`
  );
}

function toCustomer(record: CustomerRecord): CustomerDto {
  return {
    id: record.id,
    name: record.name,
    industry: record.industry,
    createdAt: toTimestampString(record.createdAt),
    updatedAt: toTimestampString(record.updatedAt),
  };
}

function toContact(
  record: ContactRecord,
  customerName: string | null,
): ContactDto {
  return {
    id: record.id,
    name: record.name,
    phone: record.phone,
    email: record.email,
    customerId: record.customerId,
    customerName,
    createdAt: toTimestampString(record.createdAt),
    updatedAt: toTimestampString(record.updatedAt),
  };
}

function toOpportunity(
  record: OpportunityRecord,
  customerName: string | null,
): OpportunityDto {
  // A decimal column is a number or a string depending on the driver; the API
  // always talks numbers so clients never do decimal-string arithmetic.
  const stage = isOpportunityStage(record.stage) ? record.stage : 'following';
  return {
    id: record.id,
    name: record.name,
    customerId: record.customerId,
    customerName,
    amount: Number(record.amount),
    stage,
    createdAt: toTimestampString(record.createdAt),
    updatedAt: toTimestampString(record.updatedAt),
  };
}

/**
 * The customer / contact / opportunity domain.
 *
 * All business rules live here, not in the routes: a route parses HTTP and this
 * class decides what is valid, what exists and what the numbers add up to. It
 * never sees a Hono context and never returns a status code.
 */
export class CrmService {
  private readonly database: DatabaseManager;

  public constructor(database: DatabaseManager) {
    this.database = database;
  }

  private customers(): Repository<CustomerRecord> {
    return this.database.repository<CustomerRecord>('customers');
  }

  private contacts(): Repository<ContactRecord> {
    return this.database.repository<ContactRecord>('contacts');
  }

  private opportunities(): Repository<OpportunityRecord> {
    return this.database.repository<OpportunityRecord>('opportunities');
  }

  // --- input helpers -------------------------------------------------------

  private requireName(value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new CrmError('NAME_REQUIRED', 'name');
    }
    return value.trim();
  }

  private optionalText(value: unknown, field: string): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new CrmError('VALIDATION', field);
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  private requireCustomerId(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new CrmError('CUSTOMER_REQUIRED', 'customerId');
    }
    return parsed;
  }

  private requireAmount(value: unknown): number {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new CrmError('AMOUNT_INVALID', 'amount');
    }
    // A decimal(14,2) column; round so 0.1+0.2 style inputs cannot overflow scale.
    return Math.round(parsed * 100) / 100;
  }

  private requireStage(value: unknown): OpportunityStage {
    if (!isOpportunityStage(value))
      throw new CrmError('STAGE_INVALID', 'stage');
    return value;
  }

  private parseId(value: string | number, field: string): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new CrmError('VALIDATION', field);
    }
    return parsed;
  }

  private async customerExists(id: number): Promise<boolean> {
    return this.customers().exists({ filter: { id } });
  }

  private async requireExistingCustomer(id: number): Promise<void> {
    if (!(await this.customerExists(id))) {
      throw new CrmError('CUSTOMER_NOT_FOUND', 'customerId');
    }
  }

  /** Names keyed by id, for the small lists the API returns. */
  private async customerNames(): Promise<Map<number, string>> {
    const customers = await this.customers().findMany();
    return new Map(customers.map((customer) => [customer.id, customer.name]));
  }

  // --- customers -----------------------------------------------------------

  public async listCustomers(
    query: CustomerListQuery,
  ): Promise<readonly CustomerDto[]> {
    const search = query.search?.trim();
    const records = await this.customers().findMany({
      ...(search
        ? {
            filter: (filter) =>
              filter.or([
                filter.string('name').includes(search, { mode: 'insensitive' }),
                filter
                  .string('industry')
                  .includes(search, { mode: 'insensitive' }),
              ]),
          }
        : {}),
      sort: (sort) => [sort.field('updatedAt').desc(), sort.field('id').desc()],
    });
    return records.map(toCustomer);
  }

  public async getCustomer(id: string | number): Promise<CustomerDto> {
    const customerId = this.parseId(id, 'customerId');
    const record = await this.customers().findOne({
      filter: { id: customerId },
    });
    if (!record) throw new CrmError('NOT_FOUND');
    return toCustomer(record);
  }

  public async getCustomerDetail(
    id: string | number,
  ): Promise<CustomerDetailDto> {
    const customerId = this.parseId(id, 'customerId');
    const record = await this.customers().findOne({
      filter: { id: customerId },
    });
    if (!record) throw new CrmError('NOT_FOUND');

    const [contactRecords, opportunityRecords, total] = await Promise.all([
      this.contacts().findMany({
        filter: { customerId },
        sort: (sort) => [sort.field('createdAt').asc(), sort.field('id').asc()],
      }),
      this.opportunities().findMany({
        filter: { customerId },
        sort: (sort) => [sort.field('createdAt').asc(), sort.field('id').asc()],
      }),
      this.opportunities()
        .aggregate({
          filter: { customerId },
          aggregate: (aggregate) => ({ total: aggregate.sum('amount') }),
        })
        .then((result) => Number(result.total ?? 0)),
    ]);

    return {
      ...toCustomer(record),
      contacts: contactRecords.map((contact) =>
        toContact(contact, record.name),
      ),
      opportunities: opportunityRecords.map((opportunity) =>
        toOpportunity(opportunity, record.name),
      ),
      opportunityAmountTotal: total,
    };
  }

  public async createCustomer(
    input: CustomerCreateInput,
  ): Promise<CustomerDto> {
    const name = this.requireName(input.name);
    if (await this.customers().exists({ filter: { name } })) {
      throw new CrmError('NAME_TAKEN', 'name');
    }
    const industry = this.optionalText(input.industry, 'industry');
    const now = new Date();
    const { record } = await this.customers().createOne({
      values: { name, industry, createdAt: now, updatedAt: now },
    });
    return toCustomer(record);
  }

  public async updateCustomer(
    id: string | number,
    input: CustomerUpdateInput,
  ): Promise<CustomerDto> {
    const customerId = this.parseId(id, 'customerId');
    const current = await this.customers().findOne({
      filter: { id: customerId },
    });
    if (!current) throw new CrmError('NOT_FOUND');

    const values: Partial<CustomerRecord> = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const name = this.requireName(input.name);
      const existing = await this.customers().findOne({ filter: { name } });
      if (existing && existing.id !== customerId) {
        throw new CrmError('NAME_TAKEN', 'name');
      }
      values.name = name;
    }
    if (input.industry !== undefined) {
      values.industry = this.optionalText(input.industry, 'industry');
    }

    const { record } = await this.customers().updateOne({
      filter: { id: customerId },
      values,
    });
    return toCustomer(record);
  }

  // --- contacts ------------------------------------------------------------

  public async listContacts(
    query: ContactListQuery,
  ): Promise<readonly ContactDto[]> {
    const search = query.search?.trim();
    const records = await this.contacts().findMany({
      ...(search || query.customerId !== undefined
        ? {
            filter: (filter) => {
              const clauses: FilterNode[] = [];
              if (query.customerId !== undefined) {
                clauses.push(filter.number('customerId').eq(query.customerId));
              }
              if (search) {
                clauses.push(
                  filter.or([
                    filter
                      .string('name')
                      .includes(search, { mode: 'insensitive' }),
                    filter
                      .string('phone')
                      .includes(search, { mode: 'insensitive' }),
                    filter
                      .string('email')
                      .includes(search, { mode: 'insensitive' }),
                  ]),
                );
              }
              return clauses.length === 1 ? clauses[0] : filter.and(clauses);
            },
          }
        : {}),
      sort: (sort) => [sort.field('updatedAt').desc(), sort.field('id').desc()],
    });

    const names = await this.customerNames();
    return records.map((record) =>
      toContact(record, names.get(record.customerId) ?? null),
    );
  }

  public async getContact(id: string | number): Promise<ContactDto> {
    const contactId = this.parseId(id, 'contactId');
    const record = await this.contacts().findOne({ filter: { id: contactId } });
    if (!record) throw new CrmError('NOT_FOUND');
    const customer = await this.customers().findOne({
      filter: { id: record.customerId },
    });
    return toContact(record, customer?.name ?? null);
  }

  public async createContact(input: ContactCreateInput): Promise<ContactDto> {
    const name = this.requireName(input.name);
    const customerId = this.requireCustomerId(input.customerId);
    await this.requireExistingCustomer(customerId);
    const existing = await this.contacts().findOne({
      filter: { customerId, name },
    });
    if (existing) throw new CrmError('NAME_TAKEN', 'name');

    const now = new Date();
    const { record } = await this.contacts().createOne({
      values: {
        name,
        customerId,
        phone: this.optionalText(input.phone, 'phone'),
        email: this.optionalText(input.email, 'email'),
        createdAt: now,
        updatedAt: now,
      },
    });
    const customer = await this.customers().findOne({
      filter: { id: customerId },
    });
    return toContact(record, customer?.name ?? null);
  }

  public async updateContact(
    id: string | number,
    input: ContactUpdateInput,
  ): Promise<ContactDto> {
    const contactId = this.parseId(id, 'contactId');
    const current = await this.contacts().findOne({
      filter: { id: contactId },
    });
    if (!current) throw new CrmError('NOT_FOUND');

    const values: Partial<ContactRecord> = { updatedAt: new Date() };
    let customerId = current.customerId;
    if (input.customerId !== undefined) {
      customerId = this.requireCustomerId(input.customerId);
      await this.requireExistingCustomer(customerId);
      values.customerId = customerId;
    }
    let name = current.name;
    if (input.name !== undefined) {
      name = this.requireName(input.name);
      values.name = name;
    }
    // The pair (customerId, name) is unique; check against the final values.
    if (input.name !== undefined || input.customerId !== undefined) {
      const existing = await this.contacts().findOne({
        filter: { customerId, name },
      });
      if (existing && existing.id !== contactId) {
        throw new CrmError('NAME_TAKEN', 'name');
      }
    }
    if (input.phone !== undefined) {
      values.phone = this.optionalText(input.phone, 'phone');
    }
    if (input.email !== undefined) {
      values.email = this.optionalText(input.email, 'email');
    }

    const { record } = await this.contacts().updateOne({
      filter: { id: contactId },
      values,
    });
    const customer = await this.customers().findOne({
      filter: { id: customerId },
    });
    return toContact(record, customer?.name ?? null);
  }

  // --- opportunities -------------------------------------------------------

  public async listOpportunities(
    query: OpportunityListQuery,
  ): Promise<readonly OpportunityDto[]> {
    const search = query.search?.trim();
    const records = await this.opportunities().findMany({
      ...(search || query.stage || query.customerId !== undefined
        ? {
            filter: (filter) => {
              const clauses: FilterNode[] = [];
              if (query.stage) {
                clauses.push(filter.string('stage').eq(query.stage));
              }
              if (query.customerId !== undefined) {
                clauses.push(filter.number('customerId').eq(query.customerId));
              }
              if (search) {
                clauses.push(
                  filter
                    .string('name')
                    .includes(search, { mode: 'insensitive' }),
                );
              }
              return clauses.length === 1 ? clauses[0] : filter.and(clauses);
            },
          }
        : {}),
      sort: (sort) => [sort.field('updatedAt').desc(), sort.field('id').desc()],
    });

    const names = await this.customerNames();
    return records.map((record) =>
      toOpportunity(record, names.get(record.customerId) ?? null),
    );
  }

  public async getOpportunity(id: string | number): Promise<OpportunityDto> {
    const opportunityId = this.parseId(id, 'opportunityId');
    const record = await this.opportunities().findOne({
      filter: { id: opportunityId },
    });
    if (!record) throw new CrmError('NOT_FOUND');
    const customer = await this.customers().findOne({
      filter: { id: record.customerId },
    });
    return toOpportunity(record, customer?.name ?? null);
  }

  public async createOpportunity(
    input: OpportunityCreateInput,
  ): Promise<OpportunityDto> {
    const name = this.requireName(input.name);
    const customerId = this.requireCustomerId(input.customerId);
    await this.requireExistingCustomer(customerId);
    const existing = await this.opportunities().findOne({
      filter: { customerId, name },
    });
    if (existing) throw new CrmError('NAME_TAKEN', 'name');

    const now = new Date();
    const { record } = await this.opportunities().createOne({
      values: {
        name,
        customerId,
        amount: this.requireAmount(input.amount),
        stage: this.requireStage(input.stage),
        createdAt: now,
        updatedAt: now,
      },
    });
    const customer = await this.customers().findOne({
      filter: { id: customerId },
    });
    return toOpportunity(record, customer?.name ?? null);
  }

  public async updateOpportunity(
    id: string | number,
    input: OpportunityUpdateInput,
  ): Promise<OpportunityDto> {
    const opportunityId = this.parseId(id, 'opportunityId');
    const current = await this.opportunities().findOne({
      filter: { id: opportunityId },
    });
    if (!current) throw new CrmError('NOT_FOUND');

    const values: Partial<OpportunityRecord> = { updatedAt: new Date() };
    let customerId = current.customerId;
    if (input.customerId !== undefined) {
      customerId = this.requireCustomerId(input.customerId);
      await this.requireExistingCustomer(customerId);
      values.customerId = customerId;
    }
    let name = current.name;
    if (input.name !== undefined) {
      name = this.requireName(input.name);
      values.name = name;
    }
    if (input.name !== undefined || input.customerId !== undefined) {
      const existing = await this.opportunities().findOne({
        filter: { customerId, name },
      });
      if (existing && existing.id !== opportunityId) {
        throw new CrmError('NAME_TAKEN', 'name');
      }
    }
    if (input.amount !== undefined) {
      values.amount = this.requireAmount(input.amount);
    }
    if (input.stage !== undefined) {
      values.stage = this.requireStage(input.stage);
    }

    const { record } = await this.opportunities().updateOne({
      filter: { id: opportunityId },
      values,
    });
    const customer = await this.customers().findOne({
      filter: { id: customerId },
    });
    return toOpportunity(record, customer?.name ?? null);
  }
}
