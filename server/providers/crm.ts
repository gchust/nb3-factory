import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** The opportunity stages the business uses, in their stored form. */
export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

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

export interface CustomerSummaryDto extends CustomerDto {
  readonly contactCount: number;
  readonly opportunityCount: number;
  readonly opportunityTotal: number;
}

export interface CustomerDetailDto extends CustomerSummaryDto {
  readonly contacts: readonly ContactDto[];
  readonly opportunities: readonly OpportunityDto[];
}

export interface ListOpportunitiesOptions {
  readonly stage?: OpportunityStage;
  readonly customerId?: number;
}

export interface CrmService {
  listCustomers(): Promise<readonly CustomerSummaryDto[]>;
  getCustomer(id: number): Promise<CustomerDetailDto | null>;
  createCustomer(input: Record<string, unknown>): Promise<CustomerDto>;
  updateCustomer(
    id: number,
    input: Record<string, unknown>,
  ): Promise<CustomerDto | null>;
  listContacts(customerId?: number): Promise<readonly ContactDto[]>;
  getContact(id: number): Promise<ContactDto | null>;
  createContact(input: Record<string, unknown>): Promise<ContactDto>;
  updateContact(
    id: number,
    input: Record<string, unknown>,
  ): Promise<ContactDto | null>;
  listOpportunities(
    options?: ListOpportunitiesOptions,
  ): Promise<readonly OpportunityDto[]>;
  getOpportunity(id: number): Promise<OpportunityDto | null>;
  createOpportunity(input: Record<string, unknown>): Promise<OpportunityDto>;
  updateOpportunity(
    id: number,
    input: Record<string, unknown>,
  ): Promise<OpportunityDto | null>;
}

/** Thrown when the caller's input cannot be accepted; the route answers 400. */
export class CrmValidationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CrmValidationError';
  }
}

/** Thrown when a referenced record does not exist; the route answers 404. */
export class CrmNotFoundError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CrmNotFoundError';
  }
}

interface CustomerRecord {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ContactRecord {
  readonly id: number;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly customerId: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface OpportunityRecord {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly amount: string | number;
  readonly stage: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const crmServiceToken: ServiceToken<CrmService> =
  createServiceToken<CrmService>('app/crm-service');

export function createCrmService(database: DatabaseManager): CrmService {
  const repositories = {
    customers: database.repository<CustomerRecord>('customers'),
    contacts: database.repository<ContactRecord>('contacts'),
    opportunities: database.repository<OpportunityRecord>('opportunities'),
  };

  return new DatabaseCrmService(repositories);
}

interface CrmRepositories {
  readonly customers: Repository<CustomerRecord>;
  readonly contacts: Repository<ContactRecord>;
  readonly opportunities: Repository<OpportunityRecord>;
}

class DatabaseCrmService implements CrmService {
  public constructor(private readonly repositories: CrmRepositories) {}

  public async listCustomers(): Promise<readonly CustomerSummaryDto[]> {
    const [customers, contacts, opportunities] = await Promise.all([
      this.repositories.customers.findMany(),
      this.repositories.contacts.findMany(),
      this.repositories.opportunities.findMany(),
    ]);

    const contactCounts = countBy(contacts, (contact) => contact.customerId);
    const opportunityCounts = countBy(
      opportunities,
      (opportunity) => opportunity.customerId,
    );
    const opportunityTotals = sumBy(
      opportunities,
      (opportunity) => opportunity.customerId,
      (opportunity) => amountOf(opportunity.amount),
    );

    return [...customers]
      .sort((left, right) => left.id - right.id)
      .map((customer) => ({
        ...toCustomerDto(customer),
        contactCount: contactCounts.get(customer.id) ?? 0,
        opportunityCount: opportunityCounts.get(customer.id) ?? 0,
        opportunityTotal: opportunityTotals.get(customer.id) ?? 0,
      }));
  }

  public async getCustomer(id: number): Promise<CustomerDetailDto | null> {
    const customer = await this.repositories.customers.findOne({
      filter: { id },
    });
    if (!customer) {
      return null;
    }

    const [contacts, opportunities] = await Promise.all([
      this.repositories.contacts.findMany({ filter: { customerId: id } }),
      this.repositories.opportunities.findMany({
        filter: { customerId: id },
      }),
    ]);

    const sortedContacts = [...contacts].sort(
      (left, right) => left.id - right.id,
    );
    const sortedOpportunities = [...opportunities].sort(
      (left, right) => left.id - right.id,
    );

    return {
      ...toCustomerDto(customer),
      contactCount: sortedContacts.length,
      opportunityCount: sortedOpportunities.length,
      opportunityTotal: sortedOpportunities.reduce(
        (total, opportunity) => total + amountOf(opportunity.amount),
        0,
      ),
      contacts: sortedContacts.map((contact) =>
        toContactDto(contact, customer.name),
      ),
      opportunities: sortedOpportunities.map((opportunity) =>
        toOpportunityDto(opportunity, customer.name),
      ),
    };
  }

  public async createCustomer(
    input: Record<string, unknown>,
  ): Promise<CustomerDto> {
    const now = new Date().toISOString();
    const { record } = await this.repositories.customers.createOne({
      values: {
        name: requireText(input.name, 'CUSTOMER_NAME_REQUIRED', 'name'),
        industry: optionalText(
          input.industry,
          'CUSTOMER_INDUSTRY_INVALID',
          'industry',
        ),
        createdAt: now,
        updatedAt: now,
      },
    });
    return toCustomerDto(record);
  }

  public async updateCustomer(
    id: number,
    input: Record<string, unknown>,
  ): Promise<CustomerDto | null> {
    const existing = await this.repositories.customers.findOne({
      filter: { id },
    });
    if (!existing) {
      return null;
    }

    const values: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (has(input, 'name')) {
      values.name = requireText(input.name, 'CUSTOMER_NAME_REQUIRED', 'name');
    }
    if (has(input, 'industry')) {
      values.industry = optionalText(
        input.industry,
        'CUSTOMER_INDUSTRY_INVALID',
        'industry',
      );
    }

    const { record } = await this.repositories.customers.updateOne({
      filter: { id },
      values,
    });
    return toCustomerDto(record);
  }

  public async listContacts(
    customerId?: number,
  ): Promise<readonly ContactDto[]> {
    const contacts = await this.repositories.contacts.findMany(
      customerId === undefined ? undefined : { filter: { customerId } },
    );
    const nameById = await this.customerNames();
    return [...contacts]
      .sort((left, right) => left.id - right.id)
      .map((contact) =>
        toContactDto(contact, nameById.get(contact.customerId) ?? null),
      );
  }

  public async getContact(id: number): Promise<ContactDto | null> {
    const contact = await this.repositories.contacts.findOne({
      filter: { id },
    });
    if (!contact) {
      return null;
    }
    const nameById = await this.customerNames();
    return toContactDto(contact, nameById.get(contact.customerId) ?? null);
  }

  public async createContact(
    input: Record<string, unknown>,
  ): Promise<ContactDto> {
    const customerId = requireId(
      input.customerId,
      'CONTACT_CUSTOMER_REQUIRED',
      'customerId',
    );
    const customer = await this.requireCustomer(
      customerId,
      'CONTACT_CUSTOMER_NOT_FOUND',
    );
    const now = new Date().toISOString();
    const { record } = await this.repositories.contacts.createOne({
      values: {
        name: requireText(input.name, 'CONTACT_NAME_REQUIRED', 'name'),
        phone: optionalText(input.phone, 'CONTACT_PHONE_INVALID', 'phone'),
        email: optionalText(input.email, 'CONTACT_EMAIL_INVALID', 'email'),
        customerId,
        createdAt: now,
        updatedAt: now,
      },
    });
    return toContactDto(record, customer.name);
  }

  public async updateContact(
    id: number,
    input: Record<string, unknown>,
  ): Promise<ContactDto | null> {
    const existing = await this.repositories.contacts.findOne({
      filter: { id },
    });
    if (!existing) {
      return null;
    }

    const values: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (has(input, 'name')) {
      values.name = requireText(input.name, 'CONTACT_NAME_REQUIRED', 'name');
    }
    if (has(input, 'phone')) {
      values.phone = optionalText(
        input.phone,
        'CONTACT_PHONE_INVALID',
        'phone',
      );
    }
    if (has(input, 'email')) {
      values.email = optionalText(
        input.email,
        'CONTACT_EMAIL_INVALID',
        'email',
      );
    }
    if (has(input, 'customerId')) {
      const customerId = requireId(
        input.customerId,
        'CONTACT_CUSTOMER_REQUIRED',
        'customerId',
      );
      await this.requireCustomer(customerId, 'CONTACT_CUSTOMER_NOT_FOUND');
      values.customerId = customerId;
    }

    const { record } = await this.repositories.contacts.updateOne({
      filter: { id },
      values,
    });
    const nameById = await this.customerNames();
    return toContactDto(record, nameById.get(record.customerId) ?? null);
  }

  public async listOpportunities(
    options: ListOpportunitiesOptions = {},
  ): Promise<readonly OpportunityDto[]> {
    const filter: Record<string, unknown> = {};
    if (options.stage !== undefined) {
      filter.stage = options.stage;
    }
    if (options.customerId !== undefined) {
      filter.customerId = options.customerId;
    }

    const opportunities = await this.repositories.opportunities.findMany(
      Object.keys(filter).length > 0 ? { filter } : undefined,
    );
    const nameById = await this.customerNames();
    return [...opportunities]
      .sort((left, right) => left.id - right.id)
      .map((opportunity) =>
        toOpportunityDto(
          opportunity,
          nameById.get(opportunity.customerId) ?? null,
        ),
      );
  }

  public async getOpportunity(id: number): Promise<OpportunityDto | null> {
    const opportunity = await this.repositories.opportunities.findOne({
      filter: { id },
    });
    if (!opportunity) {
      return null;
    }
    const nameById = await this.customerNames();
    return toOpportunityDto(
      opportunity,
      nameById.get(opportunity.customerId) ?? null,
    );
  }

  public async createOpportunity(
    input: Record<string, unknown>,
  ): Promise<OpportunityDto> {
    const customerId = requireId(
      input.customerId,
      'OPPORTUNITY_CUSTOMER_REQUIRED',
      'customerId',
    );
    const customer = await this.requireCustomer(
      customerId,
      'OPPORTUNITY_CUSTOMER_NOT_FOUND',
    );
    const now = new Date().toISOString();
    const { record } = await this.repositories.opportunities.createOne({
      values: {
        name: requireText(input.name, 'OPPORTUNITY_NAME_REQUIRED', 'name'),
        customerId,
        amount: requireAmount(input.amount),
        stage: requireStage(input.stage),
        createdAt: now,
        updatedAt: now,
      },
    });
    return toOpportunityDto(record, customer.name);
  }

  public async updateOpportunity(
    id: number,
    input: Record<string, unknown>,
  ): Promise<OpportunityDto | null> {
    const existing = await this.repositories.opportunities.findOne({
      filter: { id },
    });
    if (!existing) {
      return null;
    }

    const values: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (has(input, 'name')) {
      values.name = requireText(
        input.name,
        'OPPORTUNITY_NAME_REQUIRED',
        'name',
      );
    }
    if (has(input, 'amount')) {
      values.amount = requireAmount(input.amount);
    }
    if (has(input, 'stage')) {
      values.stage = requireStage(input.stage);
    }
    if (has(input, 'customerId')) {
      const customerId = requireId(
        input.customerId,
        'OPPORTUNITY_CUSTOMER_REQUIRED',
        'customerId',
      );
      await this.requireCustomer(customerId, 'OPPORTUNITY_CUSTOMER_NOT_FOUND');
      values.customerId = customerId;
    }

    const { record } = await this.repositories.opportunities.updateOne({
      filter: { id },
      values,
    });
    const nameById = await this.customerNames();
    return toOpportunityDto(record, nameById.get(record.customerId) ?? null);
  }

  private async requireCustomer(
    id: number,
    code: string,
  ): Promise<CustomerRecord> {
    const customer = await this.repositories.customers.findOne({
      filter: { id },
    });
    if (!customer) {
      throw new CrmNotFoundError(code, `Customer ${id} does not exist.`);
    }
    return customer;
  }

  private async customerNames(): Promise<Map<number, string>> {
    const customers = await this.repositories.customers.findMany();
    return new Map(customers.map((customer) => [customer.id, customer.name]));
  }
}

function toCustomerDto(record: CustomerRecord): CustomerDto {
  return {
    id: record.id,
    name: record.name,
    industry: record.industry ?? null,
    createdAt: String(record.createdAt),
    updatedAt: String(record.updatedAt),
  };
}

function toContactDto(
  record: ContactRecord,
  customerName: string | null,
): ContactDto {
  return {
    id: record.id,
    name: record.name,
    phone: record.phone ?? null,
    email: record.email ?? null,
    customerId: record.customerId,
    customerName,
    createdAt: String(record.createdAt),
    updatedAt: String(record.updatedAt),
  };
}

function toOpportunityDto(
  record: OpportunityRecord,
  customerName: string | null,
): OpportunityDto {
  return {
    id: record.id,
    name: record.name,
    customerId: record.customerId,
    customerName,
    amount: amountOf(record.amount),
    stage: isStage(record.stage) ? record.stage : 'following',
    createdAt: String(record.createdAt),
    updatedAt: String(record.updatedAt),
  };
}

function amountOf(value: string | number | null | undefined): number {
  const amount = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function countBy<T>(
  items: readonly T[],
  key: (item: T) => number,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const item of items) {
    const id = key(item);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function sumBy<T>(
  items: readonly T[],
  key: (item: T) => number,
  value: (item: T) => number,
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const item of items) {
    const id = key(item);
    totals.set(id, (totals.get(id) ?? 0) + value(item));
  }
  return totals;
}

function has(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function requireText(value: unknown, code: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CrmValidationError(code, `${field} is required.`);
  }
  return value.trim();
}

function optionalText(
  value: unknown,
  code: string,
  field: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new CrmValidationError(code, `${field} must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requireId(value: unknown, code: string, field: string): number {
  const id =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(id) || id <= 0) {
    throw new CrmValidationError(code, `${field} must be a positive integer.`);
  }
  return id;
}

function requireAmount(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '0.00';
  }
  const amount =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(amount) || amount < 0) {
    throw new CrmValidationError(
      'OPPORTUNITY_AMOUNT_INVALID',
      'amount must be a number greater than or equal to 0.',
    );
  }
  return amount.toFixed(2);
}

function isStage(value: unknown): value is OpportunityStage {
  return (
    typeof value === 'string' &&
    (OPPORTUNITY_STAGES as readonly string[]).includes(value)
  );
}

function requireStage(value: unknown): OpportunityStage {
  if (value === undefined || value === null || value === '') {
    return 'following';
  }
  if (!isStage(value)) {
    throw new CrmValidationError(
      'OPPORTUNITY_STAGE_INVALID',
      `stage must be one of ${OPPORTUNITY_STAGES.join(', ')}.`,
    );
  }
  return value;
}

export default class CrmProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/crm-provider';

  public override register(): void {
    this.app.container.singleton(crmServiceToken, () =>
      createCrmService(this.app.container.resolve(databaseManagerToken)),
    );
  }
}
