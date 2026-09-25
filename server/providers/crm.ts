import {
  databaseManagerToken,
  type DatabaseManager,
  type FilterBuilder,
  type FilterNode,
} from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

export const crmServiceToken = createServiceToken<CrmService>(
  'app-template-default/crm',
);

export type OpportunityStage = 'following' | 'won' | 'lost';

export const OPPORTUNITY_STAGES: readonly OpportunityStage[] = [
  'following',
  'won',
  'lost',
];

export interface CustomerDto {
  id: number;
  name: string;
  industry: string | null;
}

export interface ContactDto {
  id: number;
  name: string;
  contactInfo: string | null;
  customerId: number;
  customerName: string | null;
}

export interface OpportunityDto {
  id: number;
  name: string;
  customerId: number;
  customerName: string | null;
  amount: number;
  stage: OpportunityStage;
}

export interface CustomerDetailDto extends CustomerDto {
  contacts: ContactDto[];
  opportunities: OpportunityDto[];
  totalAmount: number;
}

export interface CustomerInput {
  name?: unknown;
  industry?: unknown;
}

export interface ContactInput {
  name?: unknown;
  contactInfo?: unknown;
  customerId?: unknown;
}

export interface OpportunityInput {
  name?: unknown;
  customerId?: unknown;
  amount?: unknown;
  stage?: unknown;
}

export interface ListContactsOptions {
  customerId?: number;
  search?: string;
}

export interface ListOpportunitiesOptions {
  customerId?: number;
  stage?: OpportunityStage;
  search?: string;
}

interface CustomerRow {
  id: number;
  name: string;
  industry: string | null;
}

interface ContactRow {
  id: number;
  name: string;
  contactInfo: string | null;
  customerId: number;
  customer?: { id: number; name: string } | null;
}

interface OpportunityRow {
  id: number;
  name: string;
  customerId: number;
  amount: number | string;
  stage: string;
  customer?: { id: number; name: string } | null;
}

export class CrmNotFoundError extends Error {
  readonly code = 'CRM_NOT_FOUND';

  constructor(message = 'Record not found.') {
    super(message);
    this.name = 'CrmNotFoundError';
  }
}

export class CrmValidationError extends Error {
  readonly code = 'CRM_INVALID_INPUT';
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'CrmValidationError';
    this.field = field;
  }
}

const MAX_NAME_LENGTH = 120;
const MAX_TEXT_LENGTH = 200;
const MAX_AMOUNT = 999999999999.99;

function normalizeOptionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new CrmValidationError(field, `${field} must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new CrmValidationError(
      field,
      `${field} must be at most ${maxLength} characters.`,
    );
  }
  return trimmed;
}

function normalizeRequiredName(value: unknown, field = 'name'): string {
  if (typeof value !== 'string') {
    throw new CrmValidationError(field, `${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new CrmValidationError(field, `${field} is required.`);
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new CrmValidationError(
      field,
      `${field} must be at most ${MAX_NAME_LENGTH} characters.`,
    );
  }
  return trimmed;
}

function normalizeAmount(value: unknown, required: boolean): number {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new CrmValidationError('amount', 'amount is required.');
    }
    return 0;
  }
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) {
    throw new CrmValidationError('amount', 'amount must be a number.');
  }
  if (amount < 0) {
    throw new CrmValidationError('amount', 'amount may not be negative.');
  }
  if (amount > MAX_AMOUNT) {
    throw new CrmValidationError('amount', 'amount is too large.');
  }
  return Math.round(amount * 100) / 100;
}

function normalizeStage(value: unknown, required: boolean): OpportunityStage {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new CrmValidationError('stage', 'stage is required.');
    }
    return 'following';
  }
  if (
    typeof value !== 'string' ||
    !OPPORTUNITY_STAGES.includes(value as OpportunityStage)
  ) {
    throw new CrmValidationError(
      'stage',
      `stage must be one of: ${OPPORTUNITY_STAGES.join(', ')}.`,
    );
  }
  return value as OpportunityStage;
}

function normalizeId(value: unknown, field: string): number {
  const id = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new CrmValidationError(field, `${field} is required.`);
  }
  return id;
}

export class CrmService {
  constructor(private readonly database: DatabaseManager) {}

  private get customers() {
    return this.database.repository<CustomerRow>('crm_customers');
  }

  private get contacts() {
    return this.database.repository<ContactRow>('crm_contacts');
  }

  private get opportunities() {
    return this.database.repository<OpportunityRow>('crm_opportunities');
  }

  async listCustomers(search?: string): Promise<CustomerDto[]> {
    const keyword = search?.trim();
    const rows = await this.customers.findMany({
      ...(keyword
        ? {
            filter: (builder: FilterBuilder<CustomerRow>) =>
              builder.or([
                builder
                  .string('name')
                  .includes(keyword, { mode: 'insensitive' }),
                builder
                  .string('industry')
                  .includes(keyword, { mode: 'insensitive' }),
              ]),
          }
        : {}),
      sort: (sort) => sort.field('id').desc(),
    });
    return rows.map((row) => this.toCustomer(row));
  }

  async getCustomerDetail(id: number): Promise<CustomerDetailDto> {
    const customer = await this.customers.findOne({
      filter: { id },
    });
    if (!customer) {
      throw new CrmNotFoundError('Customer not found.');
    }
    const [contacts, opportunities] = await Promise.all([
      this.listContacts({ customerId: id }),
      this.listOpportunities({ customerId: id }),
    ]);
    const totalAmount = opportunities.reduce(
      (sum, item) => sum + item.amount,
      0,
    );
    return {
      ...this.toCustomer(customer),
      contacts,
      opportunities,
      totalAmount: Math.round(totalAmount * 100) / 100,
    };
  }

  async createCustomer(input: CustomerInput): Promise<CustomerDto> {
    const values = {
      name: normalizeRequiredName(input.name),
      industry: normalizeOptionalText(
        input.industry,
        'industry',
        MAX_NAME_LENGTH,
      ),
    };
    const result = await this.customers.createOne({ values });
    return this.toCustomer(result.record);
  }

  async updateCustomer(id: number, input: CustomerInput): Promise<CustomerDto> {
    await this.requireCustomer(id);
    const name = normalizeRequiredName(input.name);
    const industry = normalizeOptionalText(
      input.industry,
      'industry',
      MAX_NAME_LENGTH,
    );
    const result = await this.customers.updateOne({
      filter: { id },
      values: { name, industry },
    });
    return this.toCustomer(result.record);
  }

  async listContacts(options: ListContactsOptions = {}): Promise<ContactDto[]> {
    const keyword = options.search?.trim();
    const hasFilter = options.customerId !== undefined || keyword !== undefined;
    const rows = await this.contacts.findMany({
      ...(hasFilter
        ? {
            filter: (builder: FilterBuilder<ContactRow>) => {
              const conditions: FilterNode[] = [];
              if (options.customerId !== undefined) {
                conditions.push(
                  builder.number('customerId').eq(options.customerId),
                );
              }
              if (keyword) {
                conditions.push(
                  builder.or([
                    builder
                      .string('name')
                      .includes(keyword, { mode: 'insensitive' }),
                    builder
                      .string('contactInfo')
                      .includes(keyword, { mode: 'insensitive' }),
                  ]),
                );
              }
              return conditions.length === 1
                ? conditions[0]
                : builder.and(conditions);
            },
          }
        : {}),
      sort: (sort) => sort.field('id').desc(),
      select: (select) =>
        select
          .fields('id', 'name', 'contactInfo', 'customerId')
          .include('customer', (customer) => customer.fields('id', 'name')),
    });
    return rows.map((row) => this.toContact(row));
  }

  /** Returns one contact, including its customer name; throws `CrmNotFoundError` when absent. */
  async getContact(id: number): Promise<ContactDto> {
    const row = await this.contacts.findOne({
      filter: { id },
      select: (select) =>
        select
          .fields('id', 'name', 'contactInfo', 'customerId')
          .include('customer', (customer) => customer.fields('id', 'name')),
    });
    if (!row) {
      throw new CrmNotFoundError('Contact not found.');
    }
    return this.toContact(row);
  }

  async createContact(input: ContactInput): Promise<ContactDto> {
    const customerId = normalizeId(input.customerId, 'customerId');
    await this.requireCustomer(customerId);
    const values = {
      name: normalizeRequiredName(input.name),
      contactInfo: normalizeOptionalText(
        input.contactInfo,
        'contactInfo',
        MAX_TEXT_LENGTH,
      ),
      customerId,
    };
    const result = await this.contacts.createOne({ values });
    return this.getContact(result.record.id);
  }

  async updateContact(id: number, input: ContactInput): Promise<ContactDto> {
    await this.getContact(id);
    const customerId = normalizeId(input.customerId, 'customerId');
    await this.requireCustomer(customerId);
    await this.contacts.updateOne({
      filter: { id },
      values: {
        name: normalizeRequiredName(input.name),
        contactInfo: normalizeOptionalText(
          input.contactInfo,
          'contactInfo',
          MAX_TEXT_LENGTH,
        ),
        customerId,
      },
    });
    return this.getContact(id);
  }

  async listOpportunities(
    options: ListOpportunitiesOptions = {},
  ): Promise<OpportunityDto[]> {
    const keyword = options.search?.trim();
    const hasFilter =
      options.customerId !== undefined ||
      options.stage !== undefined ||
      keyword !== undefined;
    const rows = await this.opportunities.findMany({
      ...(hasFilter
        ? {
            filter: (builder: FilterBuilder<OpportunityRow>) => {
              const conditions: FilterNode[] = [];
              if (options.customerId !== undefined) {
                conditions.push(
                  builder.number('customerId').eq(options.customerId),
                );
              }
              if (options.stage !== undefined) {
                conditions.push(builder.string('stage').eq(options.stage));
              }
              if (keyword) {
                conditions.push(
                  builder
                    .string('name')
                    .includes(keyword, { mode: 'insensitive' }),
                );
              }
              return conditions.length === 1
                ? conditions[0]
                : builder.and(conditions);
            },
          }
        : {}),
      sort: (sort) => sort.field('id').desc(),
      select: (select) =>
        select
          .fields('id', 'name', 'customerId', 'amount', 'stage')
          .include('customer', (customer) => customer.fields('id', 'name')),
    });
    return rows.map((row) => this.toOpportunity(row));
  }

  async createOpportunity(input: OpportunityInput): Promise<OpportunityDto> {
    const customerId = normalizeId(input.customerId, 'customerId');
    await this.requireCustomer(customerId);
    const values = {
      name: normalizeRequiredName(input.name),
      customerId,
      amount: normalizeAmount(input.amount, false),
      stage: normalizeStage(input.stage, false),
    };
    const result = await this.opportunities.createOne({ values });
    return this.getOpportunity(result.record.id);
  }

  async updateOpportunity(
    id: number,
    input: OpportunityInput,
  ): Promise<OpportunityDto> {
    await this.getOpportunity(id);
    const customerId = normalizeId(input.customerId, 'customerId');
    await this.requireCustomer(customerId);
    await this.opportunities.updateOne({
      filter: { id },
      values: {
        name: normalizeRequiredName(input.name),
        customerId,
        amount: normalizeAmount(input.amount, false),
        stage: normalizeStage(input.stage, false),
      },
    });
    return this.getOpportunity(id);
  }

  private async requireCustomer(id: number): Promise<void> {
    const customer = await this.customers.findOne({ filter: { id } });
    if (!customer) {
      throw new CrmValidationError('customerId', 'Customer does not exist.');
    }
  }

  /** Returns one opportunity, including its customer name; throws `CrmNotFoundError` when absent. */
  async getOpportunity(id: number): Promise<OpportunityDto> {
    const row = await this.opportunities.findOne({
      filter: { id },
      select: (select) =>
        select
          .fields('id', 'name', 'customerId', 'amount', 'stage')
          .include('customer', (customer) => customer.fields('id', 'name')),
    });
    if (!row) {
      throw new CrmNotFoundError('Opportunity not found.');
    }
    return this.toOpportunity(row);
  }

  private toCustomer(row: CustomerRow): CustomerDto {
    return { id: row.id, name: row.name, industry: row.industry };
  }

  private toContact(row: ContactRow): ContactDto {
    return {
      id: row.id,
      name: row.name,
      contactInfo: row.contactInfo,
      customerId: row.customerId,
      customerName: row.customer?.name ?? null,
    };
  }

  private toOpportunity(row: OpportunityRow): OpportunityDto {
    return {
      id: row.id,
      name: row.name,
      customerId: row.customerId,
      customerName: row.customer?.name ?? null,
      amount: Number(row.amount ?? 0),
      stage: row.stage as OpportunityStage,
    };
  }
}

export class CrmProvider extends ServiceProvider<Application> {
  name = 'app-template-default/crm';

  register(): void {
    this.app.container.singleton(
      crmServiceToken,
      () => new CrmService(this.app.container.resolve(databaseManagerToken)),
    );
  }
}
