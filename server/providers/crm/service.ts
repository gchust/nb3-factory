import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization';
import { type DatabaseManager, type QueryAdapter } from '@nocobase/db';

import {
  computeFunnelStats,
  startOfMonth,
  type ContactWritable,
  type CustomerWritable,
  type FollowUpWritable,
  type FunnelStats,
  type OpportunityWritable,
} from './domain.js';
import { compileDatabaseFilter } from './filter.js';

export const CRM_RESOURCES = {
  customers: 'main.crmCustomers',
  contacts: 'main.crmContacts',
  opportunities: 'main.crmOpportunities',
  followUps: 'main.crmFollowUps',
  attachments: 'main.crmAttachments',
} as const;

export interface CustomerRecord {
  id: number;
  name: string;
  industry: string | null;
  companySize: string | null;
  source: string | null;
  status: string;
  ownerId: string;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ContactRecord {
  id: number;
  customerId: number;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  ownerId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface OpportunityRecord {
  id: number;
  name: string;
  customerId: number;
  amount: number | null;
  stage: string;
  expectedCloseDate: Date | string | null;
  ownerId: string;
  wonAmount: number | null;
  lostReason: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface FollowUpRecord {
  id: number;
  customerId: number | null;
  opportunityId: number | null;
  method: string;
  summary: string;
  nextStep: string | null;
  followedAt: Date | string;
  ownerId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface FileRecord {
  id: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  createdAt: Date | string;
}

export interface AttachmentRecord {
  id: number;
  targetType: string;
  targetId: number;
  fileId: string;
  ownerId: string;
  createdAt: Date | string;
}

export interface AttachmentView extends AttachmentRecord {
  filename: string | null;
  mimeType: string | null;
  size: number | null;
}

const CUSTOMER_COLUMNS = [
  'id',
  'name',
  'industry',
  'companySize',
  'source',
  'status',
  'ownerId',
  'notes',
  'createdAt',
  'updatedAt',
] as const;

const CONTACT_COLUMNS = [
  'id',
  'customerId',
  'name',
  'title',
  'phone',
  'email',
  'isPrimary',
  'ownerId',
  'createdAt',
  'updatedAt',
] as const;

const OPPORTUNITY_COLUMNS = [
  'id',
  'name',
  'customerId',
  'amount',
  'stage',
  'expectedCloseDate',
  'ownerId',
  'wonAmount',
  'lostReason',
  'createdAt',
  'updatedAt',
] as const;

const FOLLOW_UP_COLUMNS = [
  'id',
  'customerId',
  'opportunityId',
  'method',
  'summary',
  'nextStep',
  'followedAt',
  'ownerId',
  'createdAt',
  'updatedAt',
] as const;

const ATTACHMENT_COLUMNS = [
  'id',
  'targetType',
  'targetId',
  'fileId',
  'ownerId',
  'createdAt',
] as const;

export class CrmService {
  constructor(private readonly database: DatabaseManager) {}

  private query(): QueryAdapter {
    return this.database.query();
  }

  // --- customers ---------------------------------------------------------

  async listCustomers(
    conditions: DatabaseAuthorizationConditions,
    filters: { readonly search?: string; readonly status?: string },
  ): Promise<CustomerRecord[]> {
    let builder = this.query()
      .selectFrom('crmCustomers')
      .select([...CUSTOMER_COLUMNS])
      .where((eb) => compileDatabaseFilter(eb, conditions.filter));
    if (filters.status) {
      builder = builder.where('status', '=', filters.status);
    }
    if (filters.search) {
      builder = builder.where('name', 'like', `%${filters.search}%`);
    }
    return builder.orderBy('updatedAt', 'desc').execute<CustomerRecord>();
  }

  async getCustomer(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<CustomerRecord | undefined> {
    return this.query()
      .selectFrom('crmCustomers')
      .select([...CUSTOMER_COLUMNS])
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .executeTakeFirst<CustomerRecord>();
  }

  async createCustomer(
    input: CustomerWritable,
    ownerId: string,
  ): Promise<number> {
    const now = new Date();
    const result = await this.query()
      .insertInto('crmCustomers')
      .values({ ...input, ownerId, createdAt: now, updatedAt: now })
      .execute();
    return Number(result.insertId);
  }

  async updateCustomer(
    id: number,
    input: Partial<CustomerWritable>,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    const result = await this.query()
      .updateTable('crmCustomers')
      .set({ ...input, updatedAt: new Date() })
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .execute();
    return result.updatedCount ?? 0;
  }

  async deleteCustomer(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    const result = await this.query()
      .deleteFrom('crmCustomers')
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .execute();
    return result.deletedCount ?? 0;
  }

  /** Moves the account and everything under it to another salesperson. */
  async reassignCustomer(
    id: number,
    upstreamOwner: string,
    newOwnerId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    return this.database.transaction(async (connection) => {
      const now = new Date();
      const result = await connection.query
        .updateTable('crmCustomers')
        .set({ ownerId: newOwnerId, updatedAt: now })
        .where('id', '=', id)
        .where((eb) => compileDatabaseFilter(eb, conditions.filter))
        .execute();
      if ((result.updatedCount ?? 0) === 0) return 0;

      await connection.query
        .updateTable('crmContacts')
        .set({ ownerId: newOwnerId, updatedAt: now })
        .where('customerId', '=', id)
        .where('ownerId', '=', upstreamOwner)
        .execute();
      await connection.query
        .updateTable('crmOpportunities')
        .set({ ownerId: newOwnerId, updatedAt: now })
        .where('customerId', '=', id)
        .where('ownerId', '=', upstreamOwner)
        .execute();
      await connection.query
        .updateTable('crmFollowUps')
        .set({ ownerId: newOwnerId, updatedAt: now })
        .where('customerId', '=', id)
        .where('ownerId', '=', upstreamOwner)
        .execute();
      await connection.query
        .updateTable('crmAttachments')
        .set({ ownerId: newOwnerId })
        .where('targetType', '=', 'customer')
        .where('targetId', '=', id)
        .where('ownerId', '=', upstreamOwner)
        .execute();
      return result.updatedCount ?? 0;
    });
  }

  // --- contacts ----------------------------------------------------------

  async listContacts(
    customerId: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ContactRecord[]> {
    return this.query()
      .selectFrom('crmContacts')
      .select([...CONTACT_COLUMNS])
      .where('customerId', '=', customerId)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .orderBy('isPrimary', 'desc')
      .orderBy('createdAt', 'asc')
      .execute<ContactRecord>();
  }

  async createContact(
    input: ContactWritable,
    ownerId: string,
  ): Promise<number> {
    return this.database.transaction(async (connection) => {
      const now = new Date();
      if (input.isPrimary) {
        await clearPrimaryContacts(connection.query, input.customerId, now);
      }
      const result = await connection.query
        .insertInto('crmContacts')
        .values({ ...input, ownerId, createdAt: now, updatedAt: now })
        .execute();
      return Number(result.insertId);
    });
  }

  async updateContact(
    id: number,
    customerId: number,
    input: Partial<ContactWritable>,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    return this.database.transaction(async (connection) => {
      const now = new Date();
      if (input.isPrimary) {
        await clearPrimaryContacts(connection.query, customerId, now, id);
      }
      const result = await connection.query
        .updateTable('crmContacts')
        .set({ ...input, updatedAt: now })
        .where('id', '=', id)
        .where((eb) => compileDatabaseFilter(eb, conditions.filter))
        .execute();
      return result.updatedCount ?? 0;
    });
  }

  async getContact(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ContactRecord | undefined> {
    return this.query()
      .selectFrom('crmContacts')
      .select([...CONTACT_COLUMNS])
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .executeTakeFirst<ContactRecord>();
  }

  async deleteContact(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    const result = await this.query()
      .deleteFrom('crmContacts')
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .execute();
    return result.deletedCount ?? 0;
  }

  // --- opportunities -----------------------------------------------------

  async listOpportunities(
    conditions: DatabaseAuthorizationConditions,
    filters: { readonly stage?: string; readonly customerId?: number },
  ): Promise<OpportunityRecord[]> {
    let builder = this.query()
      .selectFrom('crmOpportunities')
      .select([...OPPORTUNITY_COLUMNS])
      .where((eb) => compileDatabaseFilter(eb, conditions.filter));
    if (filters.stage) {
      builder = builder.where('stage', '=', filters.stage);
    }
    if (filters.customerId !== undefined) {
      builder = builder.where('customerId', '=', filters.customerId);
    }
    return builder.orderBy('updatedAt', 'desc').execute<OpportunityRecord>();
  }

  async getOpportunity(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<OpportunityRecord | undefined> {
    return this.query()
      .selectFrom('crmOpportunities')
      .select([...OPPORTUNITY_COLUMNS])
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .executeTakeFirst<OpportunityRecord>();
  }

  async createOpportunity(
    input: OpportunityWritable,
    ownerId: string,
  ): Promise<number> {
    const now = new Date();
    const result = await this.query()
      .insertInto('crmOpportunities')
      .values({ ...input, ownerId, createdAt: now, updatedAt: now })
      .execute();
    return Number(result.insertId);
  }

  async updateOpportunity(
    id: number,
    input: Partial<OpportunityWritable>,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    const result = await this.query()
      .updateTable('crmOpportunities')
      .set({ ...input, updatedAt: new Date() })
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .execute();
    return result.updatedCount ?? 0;
  }

  async deleteOpportunity(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    const result = await this.query()
      .deleteFrom('crmOpportunities')
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .execute();
    return result.deletedCount ?? 0;
  }

  async funnel(
    conditions: DatabaseAuthorizationConditions,
  ): Promise<FunnelStats> {
    const rows = await this.query()
      .selectFrom('crmOpportunities')
      .select('stage')
      .select((eb) => [
        eb.fn.countAll<number>().as('count'),
        eb.fn.sum('amount').as('total'),
      ])
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .groupBy('stage')
      .execute<{ stage: string; count: number; total: number | null }>();

    const newThisMonth = await this.query()
      .selectFrom('crmOpportunities')
      .select((eb) => [eb.fn.countAll<number>().as('count')])
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .where('createdAt', '>=', startOfMonth(new Date()))
      .executeTakeFirst<{ count: number }>();

    return computeFunnelStats({
      byStage: rows.map((row) => ({
        stage: row.stage,
        count: Number(row.count),
        total: row.total === null ? 0 : Number(row.total),
      })),
      newThisMonth: Number(newThisMonth?.count ?? 0),
    });
  }

  // --- follow-ups --------------------------------------------------------

  async listFollowUps(
    conditions: DatabaseAuthorizationConditions,
    filters: {
      readonly customerId?: number;
      readonly opportunityId?: number;
    },
  ): Promise<FollowUpRecord[]> {
    let builder = this.query()
      .selectFrom('crmFollowUps')
      .select([...FOLLOW_UP_COLUMNS])
      .where((eb) => compileDatabaseFilter(eb, conditions.filter));
    if (filters.customerId !== undefined) {
      builder = builder.where('customerId', '=', filters.customerId);
    }
    if (filters.opportunityId !== undefined) {
      builder = builder.where('opportunityId', '=', filters.opportunityId);
    }
    return builder.orderBy('followedAt', 'desc').execute<FollowUpRecord>();
  }

  async createFollowUp(
    input: FollowUpWritable,
    ownerId: string,
    links: {
      readonly customerId: number | null;
      readonly opportunityId: number | null;
    },
  ): Promise<number> {
    const now = new Date();
    const result = await this.query()
      .insertInto('crmFollowUps')
      .values({ ...input, ...links, ownerId, createdAt: now, updatedAt: now })
      .execute();
    return Number(result.insertId);
  }

  async getFollowUp(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<FollowUpRecord | undefined> {
    return this.query()
      .selectFrom('crmFollowUps')
      .select([...FOLLOW_UP_COLUMNS])
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .executeTakeFirst<FollowUpRecord>();
  }

  async updateFollowUp(
    id: number,
    input: Partial<FollowUpWritable>,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    const result = await this.query()
      .updateTable('crmFollowUps')
      .set({ ...input, updatedAt: new Date() })
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .execute();
    return result.updatedCount ?? 0;
  }

  async deleteFollowUp(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    const result = await this.query()
      .deleteFrom('crmFollowUps')
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .execute();
    return result.deletedCount ?? 0;
  }

  // --- attachments -------------------------------------------------------

  async listAttachments(
    targetType: string,
    targetId: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<AttachmentView[]> {
    const rows = await this.query()
      .selectFrom('crmAttachments')
      .select([...ATTACHMENT_COLUMNS])
      .where('targetType', '=', targetType)
      .where('targetId', '=', targetId)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .orderBy('createdAt', 'desc')
      .execute<AttachmentRecord>();
    return this.withFiles(rows);
  }

  async getAttachment(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<AttachmentView | undefined> {
    const row = await this.query()
      .selectFrom('crmAttachments')
      .select([...ATTACHMENT_COLUMNS])
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .executeTakeFirst<AttachmentRecord>();
    if (!row) return undefined;
    const [view] = await this.withFiles([row]);
    return view;
  }

  async createAttachment(input: {
    readonly targetType: string;
    readonly targetId: number;
    readonly fileId: string;
    readonly ownerId: string;
  }): Promise<number> {
    const result = await this.query()
      .insertInto('crmAttachments')
      .values({ ...input, createdAt: new Date() })
      .execute();
    return Number(result.insertId);
  }

  async deleteAttachment(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    const result = await this.query()
      .deleteFrom('crmAttachments')
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .execute();
    return result.deletedCount ?? 0;
  }

  private async withFiles(
    rows: readonly AttachmentRecord[],
  ): Promise<AttachmentView[]> {
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.map((row) => row.fileId))];
    const files = await this.query()
      .selectFrom('crmFiles')
      .select(['id', 'filename', 'ext', 'mimeType', 'size', 'createdAt'])
      .where('id', 'in', ids)
      .execute<FileRecord>();
    const byId = new Map(files.map((file) => [file.id, file]));
    return rows.map((row) => {
      const file = byId.get(row.fileId);
      return {
        ...row,
        filename: file?.filename ?? null,
        mimeType: file?.mimeType ?? null,
        size: file ? Number(file.size) : null,
      };
    });
  }
}

async function clearPrimaryContacts(
  query: QueryAdapter,
  customerId: number,
  now: Date,
  exceptId?: number,
): Promise<void> {
  let builder = query
    .updateTable('crmContacts')
    .set({ isPrimary: false, updatedAt: now })
    .where('customerId', '=', customerId);
  if (exceptId !== undefined) {
    builder = builder.where('id', '!=', exceptId);
  }
  await builder.execute();
}
