import type {
  DatabaseAuthorizationConditions,
  DatabaseFieldFilter,
  DatabaseFilter,
  DatabaseFilterOperator,
} from '@nocobase/app-plugin-authorization';
import {
  type DatabaseConnection,
  type DatabaseManager,
  type Expression,
  type ExpressionBuilder,
  type Row,
  type SqlBool,
} from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  ACTIVE_STAGES,
  APPROVAL_STATUSES,
  CUSTOMER_STATUSES,
  LEAD_STATUSES,
  OPPORTUNITY_STAGES,
  SalesBusinessError,
  STAGE_WIN_PROBABILITY,
  nextStage,
  type ApprovalStatus,
  type CustomerStatus,
  type FollowUpMethod,
  type LeadStatus,
  type OpportunityStage,
} from './sales-types.js';

const APP_PACKAGE_NAME = '@nocobase/app-template-default';

export interface SalesService {
  // customers
  listCustomers(
    conditions: DatabaseAuthorizationConditions,
    query: CustomerListQuery,
  ): Promise<Row[]>;
  getCustomer(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | null>;
  createCustomer(
    input: CustomerInput,
    principalId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: number }>;
  updateCustomer(
    id: number,
    input: CustomerInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean>;
  changeCustomerOwner(
    id: number,
    newOwnerId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean>;
  deleteCustomer(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean>;

  // contacts
  listContacts(
    conditions: DatabaseAuthorizationConditions,
    query: ContactListQuery,
  ): Promise<Row[]>;
  createContact(
    input: ContactInput,
    principalId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: number }>;
  updateContact(
    id: number,
    input: ContactInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean>;
  deleteContact(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean>;

  // leads
  listLeads(
    conditions: DatabaseAuthorizationConditions,
    query: LeadListQuery,
  ): Promise<Row[]>;
  createLead(
    input: LeadInput,
    principalId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: number }>;
  updateLead(
    id: number,
    input: LeadInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean>;
  assignLead(
    id: number,
    ownerId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean>;
  convertLead(
    id: number,
    principalId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ customerId: number; alreadyConverted: boolean }>;
  deleteLead(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean>;

  // opportunities
  listOpportunities(
    conditions: DatabaseAuthorizationConditions,
    query: OpportunityListQuery,
  ): Promise<Row[]>;
  getOpportunity(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | null>;
  createOpportunity(
    input: OpportunityInput,
    principalId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: number }>;
  updateOpportunity(
    id: number,
    input: OpportunityInput,
    contactIds: number[] | undefined,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean>;
  advanceOpportunity(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  winOpportunity(
    id: number,
    actualAmount: number,
    resultReason: string | undefined,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  loseOpportunity(
    id: number,
    resultReason: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  archiveOpportunity(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean>;
  deleteOpportunity(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean>;

  // follow-ups
  listFollowUps(
    conditions: DatabaseAuthorizationConditions,
    query: FollowUpListQuery,
  ): Promise<Row[]>;
  createFollowUp(
    input: FollowUpInput,
    principalId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: number }>;
  updateFollowUp(
    id: number,
    input: FollowUpInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean>;
  deleteFollowUp(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean>;

  // dashboard
  getDashboard(
    opportunityConditions: DatabaseAuthorizationConditions,
    followUpConditions: DatabaseAuthorizationConditions,
  ): Promise<DashboardStats>;
}

export interface CustomerListQuery {
  q?: string;
  status?: CustomerStatus;
  isPublic?: boolean;
}
export interface ContactListQuery {
  q?: string;
  customerId?: number;
}
export interface LeadListQuery {
  q?: string;
  status?: LeadStatus;
}
export interface OpportunityListQuery {
  q?: string;
  stage?: OpportunityStage;
  customerId?: number;
  includeArchived?: boolean;
}
export interface FollowUpListQuery {
  q?: string;
  opportunityId?: number;
  customerId?: number;
}

export interface CustomerInput extends Row {
  name?: string;
  industry?: string;
  size?: string;
  status?: CustomerStatus;
  phone?: string;
  isPublic?: boolean;
  ownerId?: string;
}
export interface ContactInput extends Row {
  name?: string;
  phone?: string;
  email?: string;
  position?: string;
  customerId?: number;
}
export interface LeadInput extends Row {
  companyName?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  source?: string;
  notes?: string;
  ownerId?: string;
}
export interface OpportunityInput extends Row {
  name?: string;
  customerId?: number;
  expectedAmount?: number;
  expectedCloseDate?: string | Date;
  approvalStatus?: ApprovalStatus;
  ownerId?: string;
}
export interface FollowUpInput extends Row {
  subject?: string;
  method?: FollowUpMethod;
  followUpAt?: string | Date;
  nextFollowUpAt?: string | Date | null;
  content?: string;
  customerId?: number;
  opportunityId?: number;
  contactId?: number;
}

export interface DashboardStats {
  stageDistribution: Array<{ stage: string; count: number }>;
  expectedAmount: number;
  weightedAmount: number;
  opportunityCount: number;
  perOwner: Array<{ ownerId: string; count: number; expectedAmount: number }>;
  wonCount: number;
  lostCount: number;
  winRate: number;
  overdueFollowUpCount: number;
}

export const salesServiceToken: ServiceToken<SalesService> =
  createServiceToken<SalesService>(`${APP_PACKAGE_NAME}/sales-service`);

export class DefaultSalesService implements SalesService {
  constructor(private readonly database: DatabaseManager) {}

  // ------------------------------------------------------------------ customers

  async listCustomers(
    conditions: DatabaseAuthorizationConditions,
    query: CustomerListQuery,
  ): Promise<Row[]> {
    let builder = this.database
      .query()
      .selectFrom('customers')
      .select(selectFields(conditions, CUSTOMER_FIELDS))
      .where((eb) => compileFilter(eb, conditions.filter));

    if (query.q) {
      const like = `%${query.q}%`;
      builder = builder.where((eb) =>
        eb.or([
          eb('name', 'like', like),
          eb('customerNo', 'like', like),
          eb('industry', 'like', like),
        ]),
      );
    }
    if (query.status) builder = builder.where('status', '=', query.status);
    if (query.isPublic !== undefined)
      builder = builder.where('isPublic', '=', query.isPublic);

    return builder.orderBy('createdAt', 'desc').execute();
  }

  async getCustomer(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | null> {
    const customer = await this.database
      .query()
      .selectFrom('customers')
      .select(selectFields(conditions, CUSTOMER_FIELDS))
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .executeTakeFirst();
    if (!customer) return null;

    const profile = await this.database
      .query()
      .selectFrom('customerProfiles')
      .select(['id', 'customerId', 'address', 'creditLevel', 'notes'])
      .where('customerId', '=', id)
      .executeTakeFirst();
    return { ...customer, profile: profile ?? null };
  }

  async createCustomer(
    input: CustomerInput,
    principalId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: number }> {
    assertInputFields(input, conditions.fields.input);
    const now = new Date();
    const ownerId = input.ownerId ?? principalId;
    return this.database.transaction(async (connection) => {
      const result = await connection.query
        .insertInto('customers')
        .values({
          customerNo: generateNumber('CUS'),
          name: input.name ?? '未命名客户',
          industry: input.industry ?? null,
          size: input.size ?? null,
          status: input.status ?? CUSTOMER_STATUSES.ACTIVE,
          phone: input.phone ?? null,
          isPublic: input.isPublic ?? false,
          ownerId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const customerId = Number(result.insertId);
      // Every customer has a one-to-one profile (address, credit level,
      // business-license attachment, notes). Create it up front so the
      // profile section and file upload are available from the detail view.
      await connection.query
        .insertInto('customerProfiles')
        .values({
          customerId,
          address: null,
          creditLevel: null,
          notes: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return { id: customerId };
    });
  }

  async updateCustomer(
    id: number,
    input: CustomerInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean> {
    assertInputFields(input, conditions.fields.input);
    const result = await this.database
      .query()
      .updateTable('customers')
      .set({ ...input, updatedAt: new Date() })
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return (result.updatedCount ?? 0) > 0;
  }

  async changeCustomerOwner(
    id: number,
    newOwnerId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean> {
    return this.database.transaction(async (connection) => {
      const customer = await connection.query
        .selectFrom('customers')
        .select(['id', 'ownerId'])
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, conditions.filter))
        .executeTakeFirst();
      if (!customer) return false;
      if (customer.ownerId === newOwnerId) return true;

      const now = new Date();
      await connection.query
        .updateTable('customers')
        .set({ ownerId: newOwnerId, updatedAt: now })
        .where('id', '=', id)
        .execute();
      // Cascade the owner to contacts and to open (not won/lost) opportunities.
      await connection.query
        .updateTable('contacts')
        .set({ ownerId: newOwnerId, updatedAt: now })
        .where('customerId', '=', id)
        .execute();
      await connection.query
        .updateTable('opportunities')
        .set({ ownerId: newOwnerId, updatedAt: now })
        .where('customerId', '=', id)
        .where('stage', 'not in', [
          OPPORTUNITY_STAGES.WON,
          OPPORTUNITY_STAGES.LOST,
        ])
        .execute();
      return true;
    });
  }

  async deleteCustomer(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean> {
    return this.database.transaction(async (connection) => {
      const customer = await connection.query
        .selectFrom('customers')
        .select(['id'])
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, conditions.filter))
        .executeTakeFirst();
      if (!customer) return false;

      const contactCount = await connection.query
        .selectFrom('contacts')
        .select((eb) => [eb.fn.countAll().as('count')])
        .where('customerId', '=', id)
        .executeTakeFirst();
      if (Number(contactCount?.count ?? 0) > 0) {
        throw new SalesBusinessError(
          'CUSTOMER_HAS_CONTACTS',
          '该客户存在联系人，不允许删除。',
        );
      }
      const opportunityCount = await connection.query
        .selectFrom('opportunities')
        .select((eb) => [eb.fn.countAll().as('count')])
        .where('customerId', '=', id)
        .executeTakeFirst();
      if (Number(opportunityCount?.count ?? 0) > 0) {
        throw new SalesBusinessError(
          'CUSTOMER_HAS_OPPORTUNITIES',
          '该客户存在商机，不允许删除。',
        );
      }
      await connection.query
        .deleteFrom('customers')
        .where('id', '=', id)
        .execute();
      return true;
    });
  }

  // ------------------------------------------------------------------ contacts

  async listContacts(
    conditions: DatabaseAuthorizationConditions,
    query: ContactListQuery,
  ): Promise<Row[]> {
    let builder = this.database
      .query()
      .selectFrom('contacts')
      .select(selectFields(conditions, CONTACT_FIELDS))
      .where((eb) => compileFilter(eb, conditions.filter));
    if (query.q) {
      const like = `%${query.q}%`;
      builder = builder.where((eb) =>
        eb.or([
          eb('name', 'like', like),
          eb('email', 'like', like),
          eb('phone', 'like', like),
        ]),
      );
    }
    if (query.customerId !== undefined)
      builder = builder.where('customerId', '=', query.customerId);
    return builder.orderBy('createdAt', 'desc').execute();
  }

  async createContact(
    input: ContactInput,
    principalId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: number }> {
    assertInputFields(input, conditions.fields.input);
    if (input.customerId === undefined) {
      throw new SalesBusinessError(
        'CONTACT_REQUIRES_CUSTOMER',
        '联系人必须属于一个客户。',
      );
    }
    const now = new Date();
    const result = await this.database
      .query()
      .insertInto('contacts')
      .values({
        name: input.name ?? '未命名联系人',
        phone: input.phone ?? null,
        email: input.email ?? null,
        position: input.position ?? null,
        customerId: input.customerId,
        ownerId: principalId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return { id: Number(result.insertId) };
  }

  async updateContact(
    id: number,
    input: ContactInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean> {
    assertInputFields(input, conditions.fields.input);
    const result = await this.database
      .query()
      .updateTable('contacts')
      .set({ ...input, updatedAt: new Date() })
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return (result.updatedCount ?? 0) > 0;
  }

  async deleteContact(
    _id: number,
    _conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean> {
    // Contacts are never deletable; the route denies before reaching here.
    throw new SalesBusinessError(
      'CONTACT_DELETE_FORBIDDEN',
      '联系人不允许删除。',
      403,
    );
  }

  // ------------------------------------------------------------------ leads

  async listLeads(
    conditions: DatabaseAuthorizationConditions,
    query: LeadListQuery,
  ): Promise<Row[]> {
    let builder = this.database
      .query()
      .selectFrom('leads')
      .select(selectFields(conditions, LEAD_FIELDS))
      .where((eb) => compileFilter(eb, conditions.filter));
    if (query.q) {
      const like = `%${query.q}%`;
      builder = builder.where((eb) =>
        eb.or([
          eb('companyName', 'like', like),
          eb('contactName', 'like', like),
          eb('email', 'like', like),
        ]),
      );
    }
    if (query.status) builder = builder.where('status', '=', query.status);
    return builder.orderBy('createdAt', 'desc').execute();
  }

  async createLead(
    input: LeadInput,
    principalId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: number }> {
    assertInputFields(input, conditions.fields.input);
    const now = new Date();
    // A lead is owned by the person who created it unless an owner was
    // explicitly chosen. Without this the creator could not see the lead
    // again: the sales role reads only records it owns.
    const ownerId = input.ownerId ?? principalId;
    const result = await this.database
      .query()
      .insertInto('leads')
      .values({
        leadNo: generateNumber('LEAD'),
        companyName: input.companyName ?? null,
        contactName: input.contactName ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        source: input.source ?? null,
        ownerId,
        status: input.ownerId ? LEAD_STATUSES.ASSIGNED : LEAD_STATUSES.NEW,
        notes: input.notes ?? null,
        convertedAt: null,
        convertedCustomerId: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return { id: Number(result.insertId) };
  }

  async updateLead(
    id: number,
    input: LeadInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean> {
    assertInputFields(input, conditions.fields.input);
    const result = await this.database
      .query()
      .updateTable('leads')
      .set({ ...input, updatedAt: new Date() })
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return (result.updatedCount ?? 0) > 0;
  }

  async assignLead(
    id: number,
    ownerId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .updateTable('leads')
      .set({ ownerId, status: LEAD_STATUSES.ASSIGNED, updatedAt: new Date() })
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return (result.updatedCount ?? 0) > 0;
  }

  async convertLead(
    id: number,
    principalId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ customerId: number; alreadyConverted: boolean }> {
    return this.database.transaction(async (connection) => {
      const lead = await connection.query
        .selectFrom('leads')
        .select([
          'id',
          'companyName',
          'contactName',
          'phone',
          'email',
          'ownerId',
          'convertedAt',
          'convertedCustomerId',
        ])
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, conditions.filter))
        .executeTakeFirst();
      if (!lead) {
        throw new SalesBusinessError(
          'LEAD_NOT_FOUND',
          '线索不存在或无权操作。',
          404,
        );
      }
      // Idempotent: a converted lead returns the existing customer.
      if (lead.convertedAt && lead.convertedCustomerId != null) {
        return {
          customerId: Number(lead.convertedCustomerId),
          alreadyConverted: true,
        };
      }

      const now = new Date();
      const ownerId = lead.ownerId ?? principalId;
      const companyName =
        typeof lead.companyName === 'string' ? lead.companyName : '未命名客户';

      const customerResult = await connection.query
        .insertInto('customers')
        .values({
          customerNo: generateNumber('CUS'),
          name: companyName,
          industry: null,
          size: null,
          status: CUSTOMER_STATUSES.ACTIVE,
          phone: lead.phone ?? null,
          isPublic: false,
          ownerId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const customerId = Number(customerResult.insertId);

      // The converted customer gets its one-to-one profile row so the
      // profile section and business-license upload are available.
      await connection.query
        .insertInto('customerProfiles')
        .values({
          customerId,
          address: null,
          creditLevel: null,
          notes: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      const contactResult = await connection.query
        .insertInto('contacts')
        .values({
          name: lead.contactName ?? companyName,
          phone: lead.phone ?? null,
          email: lead.email ?? null,
          position: null,
          customerId,
          ownerId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const contactId = Number(contactResult.insertId);

      const opportunityResult = await connection.query
        .insertInto('opportunities')
        .values({
          opportunityNo: generateNumber('OPP'),
          name: `${companyName}商机`,
          customerId,
          ownerId,
          stage: OPPORTUNITY_STAGES.NEW,
          expectedAmount: 0,
          winProbability: STAGE_WIN_PROBABILITY[OPPORTUNITY_STAGES.NEW],
          weightedAmount: 0,
          expectedCloseDate: null,
          actualAmount: null,
          resultReason: null,
          approvalStatus: APPROVAL_STATUSES.PENDING,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const opportunityId = Number(opportunityResult.insertId);

      await connection.query
        .insertInto('opportunityContacts')
        .values({
          opportunityId,
          contactId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      await connection.query
        .updateTable('leads')
        .set({
          status: LEAD_STATUSES.CONVERTED,
          convertedAt: now,
          convertedCustomerId: customerId,
          updatedAt: now,
        })
        .where('id', '=', id)
        .execute();

      return { customerId, alreadyConverted: false };
    });
  }

  async deleteLead(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean> {
    return this.database.transaction(async (connection) => {
      const lead = await connection.query
        .selectFrom('leads')
        .select(['id', 'convertedAt'])
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, conditions.filter))
        .executeTakeFirst();
      if (!lead) return false;
      if (lead.convertedAt) {
        throw new SalesBusinessError(
          'LEAD_CONVERTED',
          '已转化的线索不允许删除。',
        );
      }
      await connection.query.deleteFrom('leads').where('id', '=', id).execute();
      return true;
    });
  }

  // ------------------------------------------------------------------ opportunities

  async listOpportunities(
    conditions: DatabaseAuthorizationConditions,
    query: OpportunityListQuery,
  ): Promise<Row[]> {
    let builder = this.database
      .query()
      .selectFrom('opportunities')
      .select(selectFields(conditions, OPPORTUNITY_FIELDS))
      .where((eb) => compileFilter(eb, conditions.filter));
    if (query.q) {
      const like = `%${query.q}%`;
      builder = builder.where((eb) =>
        eb.or([eb('name', 'like', like), eb('opportunityNo', 'like', like)]),
      );
    }
    if (query.stage) builder = builder.where('stage', '=', query.stage);
    if (query.customerId !== undefined)
      builder = builder.where('customerId', '=', query.customerId);
    if (!query.includeArchived)
      builder = builder.where('isArchived', '=', false);
    return builder.orderBy('createdAt', 'desc').execute();
  }

  async getOpportunity(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | null> {
    const opportunity = await this.database
      .query()
      .selectFrom('opportunities')
      .select(selectFields(conditions, OPPORTUNITY_FIELDS))
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .executeTakeFirst();
    if (!opportunity) return null;

    const contacts = await this.database
      .query()
      .selectFrom('opportunityContacts')
      .innerJoin('contacts', 'contacts.id', 'opportunityContacts.contactId')
      .select([
        'contacts.id',
        'contacts.name',
        'contacts.phone',
        'contacts.email',
        'contacts.position',
      ])
      .where('opportunityContacts.opportunityId', '=', id)
      .execute();
    return { ...opportunity, contacts };
  }

  async createOpportunity(
    input: OpportunityInput,
    principalId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: number }> {
    assertInputFields(input, conditions.fields.input);
    if (input.customerId === undefined) {
      throw new SalesBusinessError(
        'OPPORTUNITY_REQUIRES_CUSTOMER',
        '商机必须属于一个客户。',
      );
    }
    const now = new Date();
    const expectedAmount = Number(input.expectedAmount ?? 0);
    const stage = OPPORTUNITY_STAGES.NEW;
    const result = await this.database
      .query()
      .insertInto('opportunities')
      .values({
        opportunityNo: generateNumber('OPP'),
        name: input.name ?? '未命名商机',
        customerId: input.customerId,
        ownerId: input.ownerId ?? principalId,
        stage,
        expectedAmount,
        winProbability: STAGE_WIN_PROBABILITY[stage],
        weightedAmount: weighted(expectedAmount, STAGE_WIN_PROBABILITY[stage]),
        expectedCloseDate: input.expectedCloseDate
          ? new Date(input.expectedCloseDate)
          : null,
        actualAmount: null,
        resultReason: null,
        approvalStatus: APPROVAL_STATUSES.PENDING,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return { id: Number(result.insertId) };
  }

  async updateOpportunity(
    id: number,
    input: OpportunityInput,
    contactIds: number[] | undefined,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean> {
    assertInputFields(input, conditions.fields.input);
    return this.database.transaction(async (connection) => {
      const opportunity = await connection.query
        .selectFrom('opportunities')
        .select(['id', 'customerId', 'expectedAmount', 'winProbability'])
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, conditions.filter))
        .executeTakeFirst();
      if (!opportunity) return false;

      const values: Row = { updatedAt: new Date() };
      if (input.name !== undefined) values.name = input.name;
      if (input.expectedAmount !== undefined) {
        values.expectedAmount = Number(input.expectedAmount);
        values.weightedAmount = weighted(
          Number(input.expectedAmount),
          Number(opportunity.winProbability),
        );
      }
      if (input.expectedCloseDate !== undefined) {
        values.expectedCloseDate = input.expectedCloseDate
          ? new Date(input.expectedCloseDate)
          : null;
      }
      if (input.approvalStatus !== undefined)
        values.approvalStatus = input.approvalStatus;

      await connection.query
        .updateTable('opportunities')
        .set(values)
        .where('id', '=', id)
        .execute();

      if (contactIds !== undefined) {
        await replaceOpportunityContacts(
          connection,
          id,
          Number(opportunity.customerId),
          contactIds,
        );
      }
      return true;
    });
  }

  async advanceOpportunity(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row> {
    return this.database.transaction(async (connection) => {
      const opportunity = await connection.query
        .selectFrom('opportunities')
        .select(['id', 'stage', 'expectedAmount'])
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, conditions.filter))
        .executeTakeFirst();
      if (!opportunity) {
        throw new SalesBusinessError(
          'OPPORTUNITY_NOT_FOUND',
          '商机不存在或无权操作。',
          404,
        );
      }
      const current = opportunity.stage as OpportunityStage;
      const target = nextStage(current);
      if (!target || !ACTIVE_STAGES.includes(target)) {
        throw new SalesBusinessError(
          'STAGE_NOT_ADVANCEABLE',
          `当前阶段（${current}）无法继续推进。`,
        );
      }
      const now = new Date();
      await connection.query
        .updateTable('opportunities')
        .set({
          stage: target,
          winProbability: STAGE_WIN_PROBABILITY[target],
          weightedAmount: weighted(
            Number(opportunity.expectedAmount),
            STAGE_WIN_PROBABILITY[target],
          ),
          updatedAt: now,
        })
        .where('id', '=', id)
        .execute();
      return this.loadOpportunity(connection, id);
    });
  }

  async winOpportunity(
    id: number,
    actualAmount: number,
    resultReason: string | undefined,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row> {
    if (!Number.isFinite(actualAmount) || actualAmount <= 0) {
      throw new SalesBusinessError(
        'WIN_REQUIRES_AMOUNT',
        '赢单必须填写实际成交金额且大于 0。',
      );
    }
    return this.database.transaction(async (connection) => {
      const opportunity = await connection.query
        .selectFrom('opportunities')
        .select(['id', 'stage', 'expectedAmount'])
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, conditions.filter))
        .executeTakeFirst();
      if (!opportunity) {
        throw new SalesBusinessError(
          'OPPORTUNITY_NOT_FOUND',
          '商机不存在或无权操作。',
          404,
        );
      }
      if (!ACTIVE_STAGES.includes(opportunity.stage as OpportunityStage)) {
        throw new SalesBusinessError(
          'STAGE_TERMINAL',
          '已结束的商机不能再次赢单。',
        );
      }
      const now = new Date();
      await connection.query
        .updateTable('opportunities')
        .set({
          stage: OPPORTUNITY_STAGES.WON,
          winProbability: STAGE_WIN_PROBABILITY[OPPORTUNITY_STAGES.WON],
          weightedAmount: weighted(
            Number(opportunity.expectedAmount),
            STAGE_WIN_PROBABILITY[OPPORTUNITY_STAGES.WON],
          ),
          actualAmount,
          resultReason: resultReason ?? null,
          updatedAt: now,
        })
        .where('id', '=', id)
        .execute();
      return this.loadOpportunity(connection, id);
    });
  }

  async loseOpportunity(
    id: number,
    resultReason: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row> {
    if (!resultReason || !resultReason.trim()) {
      throw new SalesBusinessError(
        'LOSE_REQUIRES_REASON',
        '输单必须填写输单原因。',
      );
    }
    return this.database.transaction(async (connection) => {
      const opportunity = await connection.query
        .selectFrom('opportunities')
        .select(['id', 'stage', 'expectedAmount'])
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, conditions.filter))
        .executeTakeFirst();
      if (!opportunity) {
        throw new SalesBusinessError(
          'OPPORTUNITY_NOT_FOUND',
          '商机不存在或无权操作。',
          404,
        );
      }
      if (!ACTIVE_STAGES.includes(opportunity.stage as OpportunityStage)) {
        throw new SalesBusinessError(
          'STAGE_TERMINAL',
          '已结束的商机不能再次输单。',
        );
      }
      const now = new Date();
      await connection.query
        .updateTable('opportunities')
        .set({
          stage: OPPORTUNITY_STAGES.LOST,
          winProbability: STAGE_WIN_PROBABILITY[OPPORTUNITY_STAGES.LOST],
          weightedAmount: 0,
          resultReason,
          updatedAt: now,
        })
        .where('id', '=', id)
        .execute();
      return this.loadOpportunity(connection, id);
    });
  }

  async archiveOpportunity(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .updateTable('opportunities')
      .set({ isArchived: true, updatedAt: new Date() })
      .where('id', '=', id)
      .where('stage', 'in', [OPPORTUNITY_STAGES.WON, OPPORTUNITY_STAGES.LOST])
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return (result.updatedCount ?? 0) > 0;
  }

  async deleteOpportunity(
    _id: number,
    _conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean> {
    // Opportunities are never deletable; the route denies before reaching here.
    throw new SalesBusinessError(
      'OPPORTUNITY_DELETE_FORBIDDEN',
      '商机不允许删除。',
      403,
    );
  }

  // ------------------------------------------------------------------ follow-ups

  async listFollowUps(
    conditions: DatabaseAuthorizationConditions,
    query: FollowUpListQuery,
  ): Promise<Row[]> {
    let builder = this.database
      .query()
      .selectFrom('followUps')
      .select(selectFields(conditions, FOLLOW_UP_FIELDS))
      .where((eb) => compileFilter(eb, conditions.filter));
    if (query.q) {
      const like = `%${query.q}%`;
      builder = builder.where((eb) =>
        eb.or([eb('subject', 'like', like), eb('content', 'like', like)]),
      );
    }
    if (query.opportunityId !== undefined)
      builder = builder.where('opportunityId', '=', query.opportunityId);
    if (query.customerId !== undefined)
      builder = builder.where('customerId', '=', query.customerId);
    return builder.orderBy('followUpAt', 'desc').execute();
  }

  async createFollowUp(
    input: FollowUpInput,
    principalId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: number }> {
    assertInputFields(input, conditions.fields.input);
    if (!input.followUpAt) {
      throw new SalesBusinessError(
        'FOLLOW_UP_REQUIRES_TIME',
        '跟进时间不能为空。',
      );
    }
    const followUpAt = new Date(input.followUpAt);
    const nextFollowUpAt = input.nextFollowUpAt
      ? new Date(input.nextFollowUpAt)
      : null;
    assertFollowUpTimeOrder(followUpAt, nextFollowUpAt);
    const now = new Date();
    const result = await this.database
      .query()
      .insertInto('followUps')
      .values({
        subject: input.subject ?? '跟进',
        method: input.method ?? null,
        followUpAt,
        nextFollowUpAt,
        content: input.content ?? null,
        customerId: input.customerId ?? null,
        opportunityId: input.opportunityId ?? null,
        contactId: input.contactId ?? null,
        ownerId: principalId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return { id: Number(result.insertId) };
  }

  async updateFollowUp(
    id: number,
    input: FollowUpInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean> {
    assertInputFields(input, conditions.fields.input);
    // Load the current row so the time-order rule can be checked even when
    // only one of the two timestamps is being updated.
    const existing = await this.database
      .query()
      .selectFrom('followUps')
      .select(['followUpAt', 'nextFollowUpAt'])
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .executeTakeFirst();
    if (!existing) return false;
    const followUpAt =
      input.followUpAt !== undefined
        ? new Date(input.followUpAt)
        : new Date(existing.followUpAt as string | number | Date);
    const nextFollowUpAt =
      input.nextFollowUpAt !== undefined
        ? input.nextFollowUpAt
          ? new Date(input.nextFollowUpAt)
          : null
        : existing.nextFollowUpAt
          ? new Date(existing.nextFollowUpAt as string | number | Date)
          : null;
    assertFollowUpTimeOrder(followUpAt, nextFollowUpAt);
    const values: Row = { updatedAt: new Date() };
    if (input.subject !== undefined) values.subject = input.subject;
    if (input.method !== undefined) values.method = input.method;
    if (input.followUpAt !== undefined) values.followUpAt = followUpAt;
    if (input.nextFollowUpAt !== undefined)
      values.nextFollowUpAt = nextFollowUpAt;
    if (input.content !== undefined) values.content = input.content;
    const result = await this.database
      .query()
      .updateTable('followUps')
      .set(values)
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return (result.updatedCount ?? 0) > 0;
  }

  async deleteFollowUp(
    _id: number,
    _conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean> {
    // Follow-ups are never deletable; the route denies before reaching here.
    throw new SalesBusinessError(
      'FOLLOW_UP_DELETE_FORBIDDEN',
      '跟进记录不允许删除。',
      403,
    );
  }

  // ------------------------------------------------------------------ dashboard

  async getDashboard(
    opportunityConditions: DatabaseAuthorizationConditions,
    followUpConditions: DatabaseAuthorizationConditions,
  ): Promise<DashboardStats> {
    const qb = this.database.query();

    const stageRows = await qb
      .selectFrom('opportunities')
      .select((eb) => ['stage', eb.fn.countAll().as('count')])
      .where('isArchived', '=', false)
      .where((eb) => compileFilter(eb, opportunityConditions.filter))
      .groupBy('stage')
      .execute();

    const totals = await qb
      .selectFrom('opportunities')
      .select((eb) => [
        eb.fn.countAll().as('count'),
        eb.fn.sum('expectedAmount').as('expectedAmount'),
        eb.fn.sum('weightedAmount').as('weightedAmount'),
      ])
      .where('isArchived', '=', false)
      .where((eb) => compileFilter(eb, opportunityConditions.filter))
      .executeTakeFirst();

    const perOwner = await qb
      .selectFrom('opportunities')
      .select((eb) => [
        'ownerId',
        eb.fn.countAll().as('count'),
        eb.fn.sum('expectedAmount').as('expectedAmount'),
      ])
      .where('isArchived', '=', false)
      .where((eb) => compileFilter(eb, opportunityConditions.filter))
      .groupBy('ownerId')
      .execute();

    const won = await qb
      .selectFrom('opportunities')
      .select((eb) => [eb.fn.countAll().as('count')])
      .where('stage', '=', OPPORTUNITY_STAGES.WON)
      .where((eb) => compileFilter(eb, opportunityConditions.filter))
      .executeTakeFirst();
    const lost = await qb
      .selectFrom('opportunities')
      .select((eb) => [eb.fn.countAll().as('count')])
      .where('stage', '=', OPPORTUNITY_STAGES.LOST)
      .where((eb) => compileFilter(eb, opportunityConditions.filter))
      .executeTakeFirst();

    const wonCount = Number(won?.count ?? 0);
    const lostCount = Number(lost?.count ?? 0);
    const winRate =
      wonCount + lostCount > 0 ? wonCount / (wonCount + lostCount) : 0;

    const overdue = await qb
      .selectFrom('followUps')
      .leftJoin('opportunities', 'opportunities.id', 'followUps.opportunityId')
      .select((eb) => [eb.fn.countAll().as('count')])
      .where('followUps.nextFollowUpAt', '<', new Date())
      .where((eb) =>
        eb.or([
          eb('opportunities.stage', 'is', null),
          eb('opportunities.stage', 'not in', [
            OPPORTUNITY_STAGES.WON,
            OPPORTUNITY_STAGES.LOST,
          ]),
        ]),
      )
      .where((eb) =>
        compileFilter(
          eb,
          qualifyFilter(followUpConditions.filter, 'followUps'),
        ),
      )
      .executeTakeFirst();

    return {
      stageDistribution: stageRows.map((row) => ({
        stage: String(row.stage),
        count: Number(row.count),
      })),
      expectedAmount: Number(totals?.expectedAmount ?? 0),
      weightedAmount: Number(totals?.weightedAmount ?? 0),
      opportunityCount: Number(totals?.count ?? 0),
      perOwner: perOwner.map((row) => ({
        ownerId: String(row.ownerId),
        count: Number(row.count),
        expectedAmount: Number(row.expectedAmount),
      })),
      wonCount,
      lostCount,
      winRate,
      overdueFollowUpCount: Number(overdue?.count ?? 0),
    };
  }

  private async loadOpportunity(
    connection: DatabaseConnection,
    id: number,
  ): Promise<Row> {
    const row = await connection.query
      .selectFrom('opportunities')
      .select(OPPORTUNITY_FIELDS)
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return row;
  }
}

// ------------------------------------------------------------------ helpers

const CUSTOMER_FIELDS = [
  'id',
  'customerNo',
  'name',
  'industry',
  'size',
  'status',
  'phone',
  'isPublic',
  'ownerId',
  'createdAt',
  'updatedAt',
] as const;
const CONTACT_FIELDS = [
  'id',
  'name',
  'phone',
  'email',
  'position',
  'customerId',
  'ownerId',
  'createdAt',
  'updatedAt',
] as const;
const LEAD_FIELDS = [
  'id',
  'leadNo',
  'companyName',
  'contactName',
  'phone',
  'email',
  'source',
  'ownerId',
  'status',
  'notes',
  'convertedAt',
  'convertedCustomerId',
  'createdAt',
  'updatedAt',
] as const;
const OPPORTUNITY_FIELDS = [
  'id',
  'opportunityNo',
  'name',
  'customerId',
  'ownerId',
  'stage',
  'expectedAmount',
  'winProbability',
  'weightedAmount',
  'expectedCloseDate',
  'actualAmount',
  'resultReason',
  'approvalStatus',
  'isArchived',
  'createdAt',
  'updatedAt',
] as const;
const FOLLOW_UP_FIELDS = [
  'id',
  'subject',
  'method',
  'followUpAt',
  'nextFollowUpAt',
  'content',
  'customerId',
  'opportunityId',
  'contactId',
  'ownerId',
  'createdAt',
  'updatedAt',
] as const;

function selectFields(
  conditions: DatabaseAuthorizationConditions,
  all: readonly string[],
): string[] {
  if (conditions.fields.output === '*') return [...all];
  return all.filter((field) => conditions.fields.output.includes(field));
}

function weighted(expectedAmount: number, winProbability: number): number {
  return Math.round(expectedAmount * winProbability) / 100;
}

/**
 * Business rule: the next follow-up time must not be earlier than the current
 * follow-up time. Throws a typed business error (mapped to a 400 response)
 * when the rule is violated.
 */
function assertFollowUpTimeOrder(
  followUpAt: Date,
  nextFollowUpAt: Date | null,
): void {
  if (nextFollowUpAt && nextFollowUpAt.getTime() < followUpAt.getTime()) {
    throw new SalesBusinessError(
      'FOLLOW_UP_NEXT_BEFORE_CURRENT',
      '下次跟进时间不能早于本次跟进时间。',
    );
  }
}

function generateNumber(prefix: string): string {
  const date = new Date();
  const ymd = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('');
  return `${prefix}-${ymd}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function replaceOpportunityContacts(
  connection: DatabaseConnection,
  opportunityId: number,
  customerId: number,
  contactIds: number[],
): Promise<void> {
  if (contactIds.length === 0) {
    await connection.query
      .deleteFrom('opportunityContacts')
      .where('opportunityId', '=', opportunityId)
      .execute();
    return;
  }
  const contacts = await connection.query
    .selectFrom('contacts')
    .select(['id'])
    .where('customerId', '=', customerId)
    .where('id', 'in', contactIds)
    .execute();
  const validIds = new Set(contacts.map((row) => Number(row.id)));
  const invalid = contactIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    throw new SalesBusinessError(
      'CONTACT_NOT_IN_CUSTOMER',
      `联系人 ${invalid.join(', ')} 不属于该商机的客户。`,
    );
  }
  const now = new Date();
  await connection.query
    .deleteFrom('opportunityContacts')
    .where('opportunityId', '=', opportunityId)
    .execute();
  for (const contactId of contactIds) {
    await connection.query
      .insertInto('opportunityContacts')
      .values({
        opportunityId,
        contactId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }
}

const filterOperators: Readonly<
  Record<
    DatabaseFilterOperator,
    '=' | '!=' | 'in' | 'not in' | '>' | '>=' | '<' | '<='
  >
> = {
  $eq: '=',
  $ne: '!=',
  $in: 'in',
  $notIn: 'not in',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};

export function compileFilter(
  eb: ExpressionBuilder,
  filter: DatabaseFilter,
): Expression<SqlBool> {
  const expressions = Object.entries(filter).map(([field, value]) => {
    if (field === '$and' || field === '$or') {
      if (!Array.isArray(value))
        throw new TypeError(`${field} must be an array`);
      const nested = (value as DatabaseFilter[]).map((item) =>
        compileFilter(eb, item),
      );
      return field === '$and' ? eb.and(nested) : eb.or(nested);
    }
    if (!value || Array.isArray(value)) {
      throw new TypeError(`Invalid filter for ${field}`);
    }
    return eb.and(
      Object.entries(value).map(([operator, expected]) => {
        const comparison = filterOperators[operator as DatabaseFilterOperator];
        if (!comparison)
          throw new TypeError(`Unknown filter operator: ${operator}`);
        return eb(field, comparison, expected);
      }),
    );
  });
  return eb.and(expressions);
}

/**
 * Prefixes every field name in an authorization filter with a table alias so
 * the filter stays unambiguous when the query joins tables that share column
 * names (e.g. `follow_ups.owner_id` vs `opportunities.owner_id`).
 */
export function qualifyFilter(
  filter: DatabaseFilter,
  table: string,
): DatabaseFilter {
  const qualified: Record<
    string,
    DatabaseFieldFilter | readonly DatabaseFilter[]
  > = {};
  for (const [field, value] of Object.entries(filter)) {
    if (field === '$and' || field === '$or') {
      if (!Array.isArray(value)) {
        qualified[field] = value;
        continue;
      }
      qualified[field] = (value as DatabaseFilter[]).map((item) =>
        qualifyFilter(item, table),
      );
      continue;
    }
    if (!value || Array.isArray(value)) {
      qualified[field] = value;
      continue;
    }
    qualified[`${table}.${field}`] = value;
  }
  return qualified;
}

export function assertInputFields(
  input: Row,
  allowed: '*' | readonly string[],
): void {
  if (allowed === '*') return;
  const rejected = Object.keys(input).filter(
    (field) => !allowed.includes(field),
  );
  if (rejected.length > 0) {
    throw new TypeError(
      `Input fields are not authorized: ${rejected.join(', ')}`,
    );
  }
}
