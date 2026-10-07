/**
 * The CRM domain service.
 *
 * It owns every read and write the feature performs. Authorization is resolved
 * first: `resolveCrmAccess` turns the request's identity into one database
 * policy per collection, and every repository the service queries is bound to
 * that policy, so row filtering happens in SQL rather than in memory. A rep
 * therefore sees their own customers and nothing else, and a supervisor sees
 * the whole team — the same code, two policies.
 *
 * Services take an `AuthorizationContext`, never a Hono context, and raise the
 * domain errors declared in `server/crm/access.ts`; the routes translate them.
 */

import type { AuthorizationContext } from '@nocobase/authorization/core';
import type {
  DatabaseConnection,
  DatabaseManager,
  FilterBuilder,
  FilterNode,
  RepositoryOperations,
  RepositoryPolicy,
} from '@nocobase/db';

import {
  CrmDeniedError,
  CrmNotFoundError,
  resolveCrmAccess,
  type CrmAccess,
  type CrmPolicies,
} from './access.js';
import {
  buildSuggestionDrafts,
  suggestionKey,
  validateImportRows,
  type ImportValidationContext,
} from './domain.js';
import type {
  ContactRow,
  ContactView,
  CreateContactInput,
  CreateCustomerInput,
  CreateFollowUpInput,
  CreateOpportunityInput,
  CrmCollection,
  CustomerDetailView,
  CustomerRow,
  CustomerView,
  DashboardView,
  FollowUpRow,
  FollowUpView,
  GenerateSuggestionsResult,
  ImportPreview,
  ImportRowInput,
  OpportunityRow,
  OpportunityView,
  SuggestionRow,
  SuggestionView,
  UpdateContactInput,
  UpdateCustomerInput,
  UpdateFollowUpInput,
  UpdateOpportunityInput,
} from './types.js';

/** Sends the reminder the scheduled scan produced. Supplied by the provider. */
export interface CrmNotifier {
  reminder(input: {
    to: string;
    title: string;
    body: string;
    path: string;
  }): Promise<void>;
}

export interface ListResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerListQuery {
  search?: string;
  level?: string;
  ownerId?: string;
  page?: number;
  pageSize?: number;
  sort?: 'newest' | 'oldest' | 'name';
}

export interface ContactListQuery {
  customerId?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface OpportunityListQuery {
  customerId?: number;
  stage?: string;
  ownerId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: 'newest' | 'oldest' | 'amount' | 'expectedCloseDate';
}

export interface FollowUpListQuery {
  customerId?: number;
  status?: string;
  ownerId?: string;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
  sort?: 'newest' | 'oldest' | 'dueAt';
}

export interface ImportCommitResult {
  created: number;
  preview: ImportPreview;
}

export interface CrmService {
  listCustomers(
    authz: AuthorizationContext,
    query: CustomerListQuery,
  ): Promise<ListResult<CustomerView>>;
  getCustomer(authz: AuthorizationContext, id: number): Promise<CustomerView>;
  customerDetail(
    authz: AuthorizationContext,
    id: number,
  ): Promise<CustomerDetailView>;
  createCustomer(
    authz: AuthorizationContext,
    input: CreateCustomerInput,
  ): Promise<CustomerView>;
  updateCustomer(
    authz: AuthorizationContext,
    id: number,
    input: UpdateCustomerInput,
  ): Promise<CustomerView>;
  deleteCustomer(authz: AuthorizationContext, id: number): Promise<void>;

  listContacts(
    authz: AuthorizationContext,
    query: ContactListQuery,
  ): Promise<ListResult<ContactView>>;
  createContact(
    authz: AuthorizationContext,
    input: CreateContactInput,
  ): Promise<ContactView>;
  updateContact(
    authz: AuthorizationContext,
    id: number,
    input: UpdateContactInput,
  ): Promise<ContactView>;
  deleteContact(authz: AuthorizationContext, id: number): Promise<void>;

  listOpportunities(
    authz: AuthorizationContext,
    query: OpportunityListQuery,
  ): Promise<ListResult<OpportunityView>>;
  createOpportunity(
    authz: AuthorizationContext,
    input: CreateOpportunityInput,
  ): Promise<OpportunityView>;
  updateOpportunity(
    authz: AuthorizationContext,
    id: number,
    input: UpdateOpportunityInput,
  ): Promise<OpportunityView>;
  deleteOpportunity(authz: AuthorizationContext, id: number): Promise<void>;

  listFollowUps(
    authz: AuthorizationContext,
    query: FollowUpListQuery,
  ): Promise<ListResult<FollowUpView>>;
  createFollowUp(
    authz: AuthorizationContext,
    input: CreateFollowUpInput,
  ): Promise<FollowUpView>;
  updateFollowUp(
    authz: AuthorizationContext,
    id: number,
    input: UpdateFollowUpInput,
  ): Promise<FollowUpView>;
  deleteFollowUp(authz: AuthorizationContext, id: number): Promise<void>;

  dashboard(authz: AuthorizationContext): Promise<DashboardView>;
  reminders(authz: AuthorizationContext): Promise<FollowUpView[]>;

  importPreview(
    authz: AuthorizationContext,
    rows: readonly ImportRowInput[],
  ): Promise<ImportPreview>;
  importCustomers(
    authz: AuthorizationContext,
    rows: readonly ImportRowInput[],
  ): Promise<ImportCommitResult>;

  listSuggestions(
    authz: AuthorizationContext,
    status?: string,
  ): Promise<SuggestionView[]>;
  generateSuggestions(
    authz: AuthorizationContext,
    now?: Date,
  ): Promise<GenerateSuggestionsResult>;
  decideSuggestion(
    authz: AuthorizationContext,
    id: number,
    decision: 'approve' | 'dismiss',
  ): Promise<SuggestionView>;
}

const DENY_ALL: RepositoryPolicy = {
  read: false,
  create: false,
  update: false,
  delete: false,
};

const DAY = 86_400_000;
const OPEN_STAGES = new Set(['initial_contact', 'quote']);

function nowIso(): string {
  return new Date().toISOString();
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** The last instant of the current ISO week (Monday to Sunday), local time. */
function endOfWeek(date: Date): Date {
  const start = startOfDay(date);
  const weekday = start.getDay() === 0 ? 7 : start.getDay();
  return new Date(start.getTime() + (7 - weekday + 1) * DAY - 1);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optional(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOrZero(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function userRecord(row: unknown): { id: string; name: string | null } {
  return row as { id: string; name: string | null };
}

function requireSuggest(access: CrmAccess): CrmPolicies {
  if (!access.suggest) {
    throw new CrmDeniedError(
      'suggest',
      'Only a supervisor may work with assistant suggestions.',
    );
  }
  return access.suggest;
}

export function createCrmService(
  database: DatabaseManager,
  options: { notifier?: CrmNotifier } = {},
): CrmService {
  function repo<T extends object>(
    policies: CrmPolicies,
    collection: CrmCollection,
    action: CrmPolicies extends never ? never : string,
  ): RepositoryOperations<T> {
    const policy = policies[collection];
    if (!policy) {
      throw new CrmDeniedError(
        action as never,
        `No CRM access to ${collection}.`,
      );
    }
    const bound = database
      .connection()
      .repository<T>(collection)
      .withPolicy(policy as RepositoryPolicy<T>);
    return bound as unknown as RepositoryOperations<T>;
  }

  async function ownerNames(
    ids: readonly string[],
  ): Promise<Map<string, string | null>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const users = await database
      .repository<{ id: string; name: string | null }>('user')
      .findMany({
        filter: (filter) =>
          filter.or(unique.map((id) => filter.string('id').eq(id))),
      });
    return new Map(
      users.map((row) => {
        const user = userRecord(row);
        return [user.id, user.name];
      }),
    );
  }

  async function namesForCustomers(
    ids: readonly number[],
  ): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))];
    if (unique.length === 0) return new Map();
    const customers = await database
      .repository<CustomerRow>('crmCustomers')
      .findMany({
        filter: (filter) =>
          filter.or(unique.map((id) => filter.number('id').eq(id))),
      });
    return new Map(customers.map((row) => [row.id, text(row.name)]));
  }

  function customerView(
    row: CustomerRow,
    owners: Map<string, string | null>,
  ): CustomerView {
    return { ...row, ownerName: owners.get(row.ownerId) ?? null };
  }

  function mapOwner<T extends { ownerId: string }>(
    rows: readonly T[],
    owners: Map<string, string | null>,
  ): (T & { ownerName: string | null })[] {
    return rows.map((row) => ({
      ...row,
      ownerName: owners.get(row.ownerId) ?? null,
    }));
  }

  /**
   * The HTTP view of an opportunity. A decimal column is transported by the
   * database layer as a string to preserve precision, but the CRM response
   * contract declares `amount` as a number, so it is normalised at this
   * boundary rather than leaking the storage representation to clients.
   */
  function opportunityView(
    row: OpportunityRow,
    owners: Map<string, string | null>,
    customerName: string | null,
  ): OpportunityView {
    return {
      ...row,
      amount: numberOrZero(row.amount),
      ownerName: owners.get(row.ownerId) ?? null,
      customerName,
    };
  }

  /** Finds one customer the caller may read, or reports it as missing. */
  async function visibleCustomer(
    access: CrmAccess,
    id: number,
  ): Promise<CustomerRow> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new CrmNotFoundError('The customer does not exist.');
    }
    const customers = repo<CustomerRow>(access.view, 'crmCustomers', 'view');
    const row = await customers.findOne({ filter: { id } });
    if (!row) throw new CrmNotFoundError('The customer does not exist.');
    return row;
  }

  async function visibleChild<T extends { id: number }>(
    policies: CrmPolicies,
    collection: CrmCollection,
    id: number,
  ): Promise<T> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new CrmNotFoundError('The record does not exist.');
    }
    const rows = repo<T>(policies, collection, 'view');
    const row = await rows.findOne({
      filter: (builder) => builder.number('id').eq(id),
    });
    if (!row) throw new CrmNotFoundError('The record does not exist.');
    return row;
  }

  function pageOf(query: { page?: number; pageSize?: number }): {
    page: number;
    pageSize: number;
    offset: number;
  } {
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.min(
      200,
      Math.max(1, Math.trunc(query.pageSize ?? 20)),
    );
    return { page, pageSize, offset: (page - 1) * pageSize };
  }

  /** The customer names (lower-cased) inside the caller's visible scope. */
  async function visibleCustomerNames(access: CrmAccess): Promise<Set<string>> {
    const customers = repo<CustomerRow>(access.view, 'crmCustomers', 'view');
    const rows = await customers.findMany();
    return new Set(rows.map((row) => text(row.name).trim().toLowerCase()));
  }

  async function ownerIdSet(access: CrmAccess): Promise<Set<string>> {
    if (!access.canManageTeam) {
      return new Set([access.principalId]);
    }
    const users = await database.repository<{ id: string }>('user').findMany();
    return new Set(users.map((row) => userRecord(row).id));
  }

  async function validationContext(
    access: CrmAccess,
  ): Promise<ImportValidationContext> {
    return {
      existingNames: await visibleCustomerNames(access),
      ownerIds: await ownerIdSet(access),
      defaultOwnerId: access.principalId,
      allowOwnerAssignment: access.canManageTeam,
    };
  }

  async function assertOwnerAssignable(
    access: CrmAccess,
    ownerId: string | null | undefined,
  ): Promise<string> {
    const target = ownerId ?? access.principalId;
    if (target === access.principalId) return target;
    if (!access.canManageTeam) {
      throw new CrmDeniedError(
        'manageTeam',
        'Only a supervisor may assign a customer to another representative.',
      );
    }
    const found = await database
      .repository<{ id: string }>('user')
      .findOne({ filter: { id: target } });
    if (!found) {
      throw new CrmNotFoundError('The assigned user does not exist.');
    }
    return target;
  }

  const service: CrmService = {
    async listCustomers(authz, query) {
      const access = await resolveCrmAccess(authz, ['view']);
      const customers = repo<CustomerRow>(access.view, 'crmCustomers', 'view');
      const { page, pageSize, offset } = pageOf(query);
      const search = query.search?.trim();
      const hasFilter = Boolean(search || query.level || query.ownerId);

      const filter = hasFilter
        ? (builder: FilterBuilder<CustomerRow>): FilterNode => {
            const items: FilterNode[] = [];
            if (search) {
              items.push(
                builder.or([
                  builder.string('name').includes(search, {
                    mode: 'insensitive',
                  }),
                  builder.string('email').includes(search, {
                    mode: 'insensitive',
                  }),
                  builder.string('phone').includes(search, {
                    mode: 'insensitive',
                  }),
                  builder.string('industry').includes(search, {
                    mode: 'insensitive',
                  }),
                ]),
              );
            }
            if (query.level)
              items.push(builder.string('level').eq(query.level));
            if (query.ownerId)
              items.push(builder.string('ownerId').eq(query.ownerId));
            return builder.and(items);
          }
        : undefined;

      const [rows, total] = await Promise.all([
        customers.findMany({
          ...(filter ? { filter } : {}),
          sort:
            query.sort === 'oldest'
              ? (sort) => sort.field('createdAt').asc().nullsLast()
              : query.sort === 'name'
                ? (sort) => sort.field('name').asc().nullsLast()
                : (sort) => sort.field('createdAt').desc().nullsLast(),
          limit: pageSize,
          offset,
        }),
        customers.count(filter ? { filter } : {}),
      ]);

      const owners = await ownerNames(rows.map((row) => row.ownerId));
      return {
        rows: rows.map((row) => customerView(row, owners)),
        total,
        page,
        pageSize,
      };
    },

    async getCustomer(authz, id) {
      const access = await resolveCrmAccess(authz, ['view']);
      const row = await visibleCustomer(access, id);
      const owners = await ownerNames([row.ownerId]);
      return customerView(row, owners);
    },

    async customerDetail(authz, id) {
      const access = await resolveCrmAccess(authz, ['view']);
      const customer = await visibleCustomer(access, id);

      const contacts = repo<ContactRow>(access.view, 'crmContacts', 'view');
      const opportunities = repo<OpportunityRow>(
        access.view,
        'crmOpportunities',
        'view',
      );
      const followUps = repo<FollowUpRow>(access.view, 'crmFollowUps', 'view');

      const [contactRows, opportunityRows, followUpRows] = await Promise.all([
        contacts.findMany({
          filter: { customerId: id },
          sort: (sort) => sort.field('isPrimary').desc().nullsLast(),
        }),
        opportunities.findMany({
          filter: { customerId: id },
          sort: (sort) => sort.field('createdAt').desc().nullsLast(),
        }),
        followUps.findMany({
          filter: { customerId: id },
          sort: (sort) => sort.field('createdAt').desc().nullsLast(),
        }),
      ]);

      const owners = await ownerNames([
        customer.ownerId,
        ...contactRows.map((row) => row.ownerId),
        ...opportunityRows.map((row) => row.ownerId),
        ...followUpRows.map((row) => row.ownerId),
      ]);

      return {
        customer: customerView(customer, owners),
        contacts: mapOwner(contactRows, owners),
        opportunities: opportunityRows.map((row) =>
          opportunityView(row, owners, customer.name),
        ),
        followUps: followUpRows.map((row) => ({
          ...row,
          ownerName: owners.get(row.ownerId) ?? null,
          customerName: customer.name,
        })),
      };
    },

    async createCustomer(authz, input) {
      const access = await resolveCrmAccess(authz, ['view', 'edit']);
      const customers = repo<CustomerRow>(access.edit, 'crmCustomers', 'edit');
      const ownerId = await assertOwnerAssignable(access, input.ownerId);
      const now = nowIso();
      const result = await customers.createOne({
        values: {
          name: input.name.trim(),
          ownerId,
          industry: input.industry ?? null,
          level: input.level ?? 'B',
          phone: input.phone ?? null,
          email: input.email ?? null,
          website: input.website ?? null,
          address: input.address ?? null,
          source: input.source ?? null,
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
      const owners = await ownerNames([ownerId]);
      return customerView(result.record, owners);
    },

    async updateCustomer(authz, id, input) {
      const access = await resolveCrmAccess(authz, ['view', 'edit']);
      const current = await visibleCustomer(access, id);
      const customers = repo<CustomerRow>(access.edit, 'crmCustomers', 'edit');

      const changes: Partial<CustomerRow> = { updatedAt: nowIso() };
      if (input.name !== undefined) changes.name = input.name;
      if (input.industry !== undefined) changes.industry = input.industry;
      if (input.level !== undefined) changes.level = input.level;
      if (input.phone !== undefined) changes.phone = input.phone;
      if (input.email !== undefined) changes.email = input.email;
      if (input.website !== undefined) changes.website = input.website;
      if (input.address !== undefined) changes.address = input.address;
      if (input.source !== undefined) changes.source = input.source;
      if (input.notes !== undefined) changes.notes = input.notes;

      let ownerChanged = false;
      if (input.ownerId !== undefined && input.ownerId !== current.ownerId) {
        changes.ownerId = await assertOwnerAssignable(access, input.ownerId);
        ownerChanged = true;
      }

      const updated = await customers.updateOne({
        filter: { id },
        values: changes,
      });

      // Ownership is denormalized onto the child rows so one record-access
      // rule covers the whole tree. Reassignment moves the tree together.
      if (ownerChanged) {
        const ownerId = text(changes.ownerId);
        const at = nowIso();
        for (const collection of [
          'crmContacts',
          'crmOpportunities',
          'crmFollowUps',
        ] as const) {
          const children = repo<{
            id: number;
            ownerId: string;
            updatedAt: string;
          }>(access.edit, collection, 'edit');
          await children.updateMany({
            filter: (builder) => builder.number('customerId').eq(id),
            values: { ownerId, updatedAt: at },
          });
        }
      }

      const owners = await ownerNames([text(updated.record.ownerId)]);
      return customerView(updated.record, owners);
    },

    async deleteCustomer(authz, id) {
      const access = await resolveCrmAccess(authz, ['view', 'delete']);
      await visibleCustomer(access, id);
      const customers = repo<CustomerRow>(
        access.remove,
        'crmCustomers',
        'delete',
      );
      await customers.deleteOne({ filter: { id } });
    },

    async listContacts(authz, query) {
      const access = await resolveCrmAccess(authz, ['view']);
      if (query.customerId) await visibleCustomer(access, query.customerId);
      const contacts = repo<ContactRow>(access.view, 'crmContacts', 'view');
      const { page, pageSize, offset } = pageOf(query);
      const search = query.search?.trim();

      const filterContacts = (
        builder: FilterBuilder<ContactRow>,
      ): FilterNode => {
        const items: FilterNode[] = [];
        if (query.customerId)
          items.push(builder.number('customerId').eq(query.customerId));
        if (search)
          items.push(
            builder.or([
              builder.string('name').includes(search, {
                mode: 'insensitive',
              }),
              builder.string('email').includes(search, {
                mode: 'insensitive',
              }),
            ]),
          );
        return items.length === 0 ? builder.and([]) : builder.and(items);
      };

      const rows = await contacts.findMany({
        filter: filterContacts,
        sort: (sort) => sort.field('isPrimary').desc().nullsLast(),
        limit: pageSize,
        offset,
      });
      const total = await contacts.count(
        query.customerId || search ? { filter: filterContacts } : {},
      );
      const owners = await ownerNames(rows.map((row) => row.ownerId));
      return { rows: mapOwner(rows, owners), total, page, pageSize };
    },

    async createContact(authz, input) {
      const access = await resolveCrmAccess(authz, ['view', 'edit']);
      const customer = await visibleCustomer(access, input.customerId);
      const contacts = repo<ContactRow>(access.edit, 'crmContacts', 'edit');
      const now = nowIso();
      const result = await contacts.createOne({
        values: {
          customerId: input.customerId,
          ownerId: customer.ownerId,
          name: input.name.trim(),
          position: input.position ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          isPrimary: input.isPrimary ?? false,
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
      const owners = await ownerNames([customer.ownerId]);
      return {
        ...result.record,
        ownerName: owners.get(customer.ownerId) ?? null,
      };
    },

    async updateContact(authz, id, input) {
      const access = await resolveCrmAccess(authz, ['view', 'edit']);
      const current = await visibleChild<ContactRow>(
        access.view,
        'crmContacts',
        id,
      );
      await visibleCustomer(access, current.customerId);
      const contacts = repo<ContactRow>(access.edit, 'crmContacts', 'edit');
      const changes: Partial<ContactRow> = { updatedAt: nowIso() };
      if (input.name !== undefined) changes.name = input.name;
      if (input.position !== undefined) changes.position = input.position;
      if (input.phone !== undefined) changes.phone = input.phone;
      if (input.email !== undefined) changes.email = input.email;
      if (input.isPrimary !== undefined) changes.isPrimary = input.isPrimary;
      if (input.notes !== undefined) changes.notes = input.notes;
      const updated = await contacts.updateOne({
        filter: { id },
        values: changes,
      });
      const owners = await ownerNames([updated.record.ownerId]);
      return {
        ...updated.record,
        ownerName: owners.get(updated.record.ownerId) ?? null,
      };
    },

    async deleteContact(authz, id) {
      const access = await resolveCrmAccess(authz, ['view', 'delete']);
      const current = await visibleChild<ContactRow>(
        access.view,
        'crmContacts',
        id,
      );
      await visibleCustomer(access, current.customerId);
      const contacts = repo<ContactRow>(access.remove, 'crmContacts', 'delete');
      await contacts.deleteOne({ filter: { id } });
    },

    async listOpportunities(authz, query) {
      const access = await resolveCrmAccess(authz, ['view']);
      if (query.customerId) await visibleCustomer(access, query.customerId);
      const opportunities = repo<OpportunityRow>(
        access.view,
        'crmOpportunities',
        'view',
      );
      const { page, pageSize, offset } = pageOf(query);
      const search = query.search?.trim();
      const hasFilter = Boolean(
        query.customerId || query.stage || query.ownerId || search,
      );

      const filter = hasFilter
        ? (builder: FilterBuilder<OpportunityRow>): FilterNode => {
            const items: FilterNode[] = [];
            if (query.customerId)
              items.push(builder.number('customerId').eq(query.customerId));
            if (query.stage)
              items.push(builder.string('stage').eq(query.stage));
            if (query.ownerId)
              items.push(builder.string('ownerId').eq(query.ownerId));
            if (search)
              items.push(
                builder
                  .string('name')
                  .includes(search, { mode: 'insensitive' }),
              );
            return builder.and(items);
          }
        : undefined;

      const [rows, total] = await Promise.all([
        opportunities.findMany({
          ...(filter ? { filter } : {}),
          sort:
            query.sort === 'oldest'
              ? (sort) => sort.field('createdAt').asc().nullsLast()
              : query.sort === 'amount'
                ? (sort) => sort.field('amount').desc().nullsLast()
                : query.sort === 'expectedCloseDate'
                  ? (sort) => sort.field('expectedCloseDate').asc().nullsLast()
                  : (sort) => sort.field('createdAt').desc().nullsLast(),
          limit: pageSize,
          offset,
        }),
        opportunities.count(filter ? { filter } : {}),
      ]);
      const owners = await ownerNames(rows.map((row) => row.ownerId));
      const names = await namesForCustomers(rows.map((row) => row.customerId));
      return {
        rows: rows.map((row) =>
          opportunityView(row, owners, names.get(row.customerId) ?? null),
        ),
        total,
        page,
        pageSize,
      };
    },

    async createOpportunity(authz, input) {
      const access = await resolveCrmAccess(authz, ['view', 'edit']);
      const customer = await visibleCustomer(access, input.customerId);
      const opportunities = repo<OpportunityRow>(
        access.edit,
        'crmOpportunities',
        'edit',
      );
      const now = nowIso();
      const result = await opportunities.createOne({
        values: {
          customerId: input.customerId,
          ownerId: customer.ownerId,
          name: input.name.trim(),
          stage: input.stage ?? 'initial_contact',
          amount: input.amount ?? 0,
          expectedCloseDate: input.expectedCloseDate ?? null,
          lostReason: input.lostReason ?? null,
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
      const owners = await ownerNames([customer.ownerId]);
      return opportunityView(result.record, owners, customer.name);
    },

    async updateOpportunity(authz, id, input) {
      const access = await resolveCrmAccess(authz, ['view', 'edit']);
      const current = await visibleChild<OpportunityRow>(
        access.view,
        'crmOpportunities',
        id,
      );
      const customer = await visibleCustomer(access, current.customerId);
      const opportunities = repo<OpportunityRow>(
        access.edit,
        'crmOpportunities',
        'edit',
      );
      const changes: Partial<OpportunityRow> = { updatedAt: nowIso() };
      if (input.name !== undefined) changes.name = input.name;
      if (input.stage !== undefined) changes.stage = input.stage;
      if (input.amount !== undefined) changes.amount = input.amount;
      if (input.expectedCloseDate !== undefined)
        changes.expectedCloseDate = input.expectedCloseDate;
      if (input.lostReason !== undefined) changes.lostReason = input.lostReason;
      if (input.notes !== undefined) changes.notes = input.notes;
      const updated = await opportunities.updateOne({
        filter: { id },
        values: changes,
      });
      const owners = await ownerNames([updated.record.ownerId]);
      return opportunityView(updated.record, owners, customer.name);
    },

    async deleteOpportunity(authz, id) {
      const access = await resolveCrmAccess(authz, ['view', 'delete']);
      const current = await visibleChild<OpportunityRow>(
        access.view,
        'crmOpportunities',
        id,
      );
      await visibleCustomer(access, current.customerId);
      const opportunities = repo<OpportunityRow>(
        access.remove,
        'crmOpportunities',
        'delete',
      );
      await opportunities.deleteOne({ filter: { id } });
    },

    async listFollowUps(authz, query) {
      const access = await resolveCrmAccess(authz, ['view']);
      if (query.customerId) await visibleCustomer(access, query.customerId);
      const followUps = repo<FollowUpRow>(access.view, 'crmFollowUps', 'view');
      const { page, pageSize, offset } = pageOf(query);
      const hasFilter = Boolean(
        query.customerId || query.status || query.ownerId || query.overdueOnly,
      );

      const filter = hasFilter
        ? (builder: FilterBuilder<FollowUpRow>): FilterNode => {
            const items: FilterNode[] = [];
            if (query.customerId)
              items.push(builder.number('customerId').eq(query.customerId));
            if (query.status)
              items.push(builder.string('status').eq(query.status));
            if (query.ownerId)
              items.push(builder.string('ownerId').eq(query.ownerId));
            if (query.overdueOnly) {
              items.push(builder.string('status').eq('pending'));
              items.push(builder.date('dueAt').before(new Date()));
            }
            return builder.and(items);
          }
        : undefined;

      const [rows, total] = await Promise.all([
        followUps.findMany({
          ...(filter ? { filter } : {}),
          sort:
            query.sort === 'newest'
              ? (sort) => sort.field('createdAt').desc().nullsLast()
              : query.sort === 'oldest'
                ? (sort) => sort.field('createdAt').asc().nullsLast()
                : (sort) => sort.field('dueAt').asc().nullsLast(),
          limit: pageSize,
          offset,
        }),
        followUps.count(filter ? { filter } : {}),
      ]);
      const owners = await ownerNames(rows.map((row) => row.ownerId));
      const names = await namesForCustomers(rows.map((row) => row.customerId));
      return {
        rows: rows.map((row) => ({
          ...row,
          ownerName: owners.get(row.ownerId) ?? null,
          customerName: names.get(row.customerId) ?? null,
        })),
        total,
        page,
        pageSize,
      };
    },

    async createFollowUp(authz, input) {
      const access = await resolveCrmAccess(authz, ['view', 'edit']);
      const customer = await visibleCustomer(access, input.customerId);
      const followUps = repo<FollowUpRow>(access.edit, 'crmFollowUps', 'edit');
      const now = nowIso();
      const result = await followUps.createOne({
        values: {
          customerId: input.customerId,
          opportunityId: input.opportunityId ?? null,
          ownerId: customer.ownerId,
          method: input.method ?? 'call',
          content: input.content ?? null,
          status: input.status ?? 'pending',
          dueAt: input.dueAt ?? null,
          completedAt: input.status === 'done' ? now : null,
          createdAt: now,
          updatedAt: now,
        },
      });
      const owners = await ownerNames([customer.ownerId]);
      return {
        ...result.record,
        ownerName: owners.get(customer.ownerId) ?? null,
        customerName: customer.name,
      };
    },

    async updateFollowUp(authz, id, input) {
      const access = await resolveCrmAccess(authz, ['view', 'edit']);
      const current = await visibleChild<FollowUpRow>(
        access.view,
        'crmFollowUps',
        id,
      );
      const customer = await visibleCustomer(access, current.customerId);
      const followUps = repo<FollowUpRow>(access.edit, 'crmFollowUps', 'edit');
      const changes: Partial<FollowUpRow> = { updatedAt: nowIso() };
      if (input.opportunityId !== undefined)
        changes.opportunityId = input.opportunityId;
      if (input.method !== undefined) changes.method = input.method;
      if (input.content !== undefined) changes.content = input.content;
      if (input.dueAt !== undefined) changes.dueAt = input.dueAt;
      if (input.status !== undefined) {
        changes.status = input.status;
        if (input.status === 'done' && current.status !== 'done') {
          changes.completedAt = nowIso();
        } else if (input.status !== 'done') {
          changes.completedAt = null;
        }
      }
      const updated = await followUps.updateOne({
        filter: { id },
        values: changes,
      });
      const owners = await ownerNames([updated.record.ownerId]);
      return {
        ...updated.record,
        ownerName: owners.get(updated.record.ownerId) ?? null,
        customerName: customer.name,
      };
    },

    async deleteFollowUp(authz, id) {
      const access = await resolveCrmAccess(authz, ['view', 'delete']);
      const current = await visibleChild<FollowUpRow>(
        access.view,
        'crmFollowUps',
        id,
      );
      await visibleCustomer(access, current.customerId);
      const followUps = repo<FollowUpRow>(
        access.remove,
        'crmFollowUps',
        'delete',
      );
      await followUps.deleteOne({ filter: { id } });
    },

    async dashboard(authz) {
      const access = await resolveCrmAccess(authz, ['view']);
      const now = new Date();
      const weekEnd = endOfWeek(now);

      const opportunities = repo<OpportunityRow>(
        access.view,
        'crmOpportunities',
        'view',
      );
      const followUps = repo<FollowUpRow>(access.view, 'crmFollowUps', 'view');
      const customers = repo<CustomerRow>(access.view, 'crmCustomers', 'view');

      const [opportunityRows, followUpRows, customerTotal] = await Promise.all([
        opportunities.findMany(),
        followUps.findMany({
          filter: (builder) =>
            builder.and([
              builder.string('status').eq('pending'),
              builder.date('dueAt').notEmpty(),
            ]),
        }),
        customers.count(),
      ]);

      const pendingSuggestionCount = access.suggest
        ? await repo<SuggestionRow>(
            access.suggest,
            'crmSuggestions',
            'suggest',
          ).count({ filter: { status: 'pending' } })
        : 0;

      const stages = ['initial_contact', 'quote', 'won', 'lost'] as const;
      const stageSummaries = stages.map((stage) => {
        const rows = opportunityRows.filter((row) => row.stage === stage);
        return {
          stage,
          count: rows.length,
          amount: rows.reduce((sum, row) => sum + numberOrZero(row.amount), 0),
        };
      });

      const openAmount = opportunityRows
        .filter((row) => OPEN_STAGES.has(text(row.stage)))
        .reduce((sum, row) => sum + numberOrZero(row.amount), 0);
      const wonAmount = opportunityRows
        .filter((row) => text(row.stage) === 'won')
        .reduce((sum, row) => sum + numberOrZero(row.amount), 0);
      const lostCount = opportunityRows.filter(
        (row) => text(row.stage) === 'lost',
      ).length;

      const pending = followUpRows.filter(
        (row) => text(row.status) === 'pending' && optional(row.dueAt),
      );
      const overdue = pending.filter(
        (row) => new Date(text(row.dueAt)).getTime() < now.getTime(),
      );
      const thisWeek = pending.filter((row) => {
        const at = new Date(text(row.dueAt)).getTime();
        return at >= startOfDay(now).getTime() && at <= weekEnd.getTime();
      });

      const owners = await ownerNames(
        [...thisWeek, ...overdue].map((row) => row.ownerId),
      );
      const names = await namesForCustomers(
        [...thisWeek, ...overdue].map((row) => row.customerId),
      );

      const decorate = (row: FollowUpRow): FollowUpView => ({
        ...row,
        ownerName: owners.get(row.ownerId) ?? null,
        customerName: names.get(row.customerId) ?? null,
      });

      const byDue = (left: FollowUpRow, right: FollowUpRow) =>
        new Date(text(left.dueAt)).getTime() -
        new Date(text(right.dueAt)).getTime();

      return {
        stages: stageSummaries,
        totalOpportunities: opportunityRows.length,
        openAmount,
        wonAmount,
        lostCount,
        customerCount: customerTotal,
        pendingFollowUpCount: pending.length,
        overdueFollowUpCount: overdue.length,
        pendingSuggestionCount,
        followUpsThisWeek: [...thisWeek].sort(byDue).map(decorate),
        overdueFollowUps: [...overdue].sort(byDue).map(decorate),
      };
    },

    async reminders(authz) {
      const access = await resolveCrmAccess(authz, ['view']);
      const followUps = repo<FollowUpRow>(access.view, 'crmFollowUps', 'view');
      const horizon = new Date(Date.now() + DAY);
      const rows = await followUps.findMany({
        filter: (builder) =>
          builder.and([
            builder.string('status').eq('pending'),
            builder.date('dueAt').notEmpty(),
            builder.date('dueAt').notAfter(horizon),
          ]),
        sort: (sort) => sort.field('dueAt').asc().nullsLast(),
      });
      const owners = await ownerNames(rows.map((row) => row.ownerId));
      const names = await namesForCustomers(rows.map((row) => row.customerId));
      return rows.map((row) => ({
        ...row,
        ownerName: owners.get(row.ownerId) ?? null,
        customerName: names.get(row.customerId) ?? null,
      }));
    },

    async importPreview(authz, rows) {
      const access = await resolveCrmAccess(authz, ['view', 'edit']);
      return validateImportRows(rows, await validationContext(access));
    },

    async importCustomers(authz, rows) {
      const access = await resolveCrmAccess(authz, ['view', 'edit']);
      const preview = validateImportRows(rows, await validationContext(access));
      const customers = repo<CustomerRow>(access.edit, 'crmCustomers', 'edit');
      let created = 0;
      for (const result of preview.rows) {
        if (result.status !== 'valid') continue;
        const now = nowIso();
        await customers.createOne({
          values: {
            name: result.name,
            ownerId: result.row.ownerId || access.principalId,
            industry: result.row.industry ?? null,
            level: result.row.level ?? 'B',
            phone: result.row.phone ?? null,
            email: result.row.email ?? null,
            website: result.row.website ?? null,
            address: result.row.address ?? null,
            source: result.row.source ?? null,
            notes: result.row.notes ?? null,
            createdAt: now,
            updatedAt: now,
          },
        });
        created += 1;
      }
      return { created, preview };
    },

    async listSuggestions(authz, status) {
      const access = await resolveCrmAccess(authz, ['view', 'suggest']);
      const suggestions = repo<SuggestionRow>(
        requireSuggest(access),
        'crmSuggestions',
        'suggest',
      );
      const rows = await suggestions.findMany({
        ...(status ? { filter: { status } } : {}),
        sort:
          !status || status === 'pending'
            ? (sort) => sort.field('createdAt').desc().nullsLast()
            : (sort) => sort.field('decidedAt').desc().nullsLast(),
      });
      const names = await namesForCustomers(rows.map((row) => row.customerId));
      return rows.map((row) => ({
        ...row,
        customerName: names.get(row.customerId) ?? null,
      }));
    },

    async generateSuggestions(authz, now = new Date()) {
      const access = await resolveCrmAccess(authz, ['view', 'suggest']);
      const suggest = requireSuggest(access);
      const customers = repo<CustomerRow>(suggest, 'crmCustomers', 'view');
      const opportunities = repo<OpportunityRow>(
        suggest,
        'crmOpportunities',
        'view',
      );
      const followUps = repo<FollowUpRow>(suggest, 'crmFollowUps', 'view');
      const suggestions = repo<SuggestionRow>(
        suggest,
        'crmSuggestions',
        'suggest',
      );

      const [customerRows, opportunityRows, followUpRows, existing] =
        await Promise.all([
          customers.findMany(),
          opportunities.findMany(),
          followUps.findMany(),
          suggestions.findMany({ filter: { status: 'pending' } }),
        ]);

      const taken = new Set(existing.map((row) => suggestionKey(row)));
      const drafts = buildSuggestionDrafts({
        now,
        customers: customerRows.map((row) => ({
          id: row.id,
          name: text(row.name),
          ownerId: text(row.ownerId),
        })),
        opportunities: opportunityRows.map((row) => ({
          ...row,
          amount: numberOrZero(row.amount),
        })),
        followUps: followUpRows,
      });

      const created: SuggestionView[] = [];
      const names = new Map(
        customerRows.map((row) => [row.id, text(row.name)]),
      );
      for (const draft of drafts) {
        const key = suggestionKey(draft);
        if (taken.has(key)) continue;
        taken.add(key);
        const at = nowIso();
        const result = await suggestions.createOne({
          values: {
            customerId: draft.customerId,
            opportunityId: draft.opportunityId,
            followUpId: draft.followUpId,
            kind: draft.kind,
            title: draft.title,
            detail: draft.detail,
            status: 'pending',
            decidedById: null,
            decidedAt: null,
            createdAt: at,
            updatedAt: at,
          },
        });
        created.push({
          ...result.record,
          customerName: names.get(draft.customerId) ?? null,
        });
      }
      return { created: created.length, suggestions: created };
    },

    async decideSuggestion(authz, id, decision) {
      const access = await resolveCrmAccess(authz, ['view', 'suggest', 'edit']);
      const suggestions = repo<SuggestionRow>(
        requireSuggest(access),
        'crmSuggestions',
        'suggest',
      );
      const suggestion = await suggestions.findOne({ filter: { id } });
      if (!suggestion) {
        throw new CrmNotFoundError('The suggestion does not exist.');
      }
      if (text(suggestion.status) !== 'pending') {
        throw new CrmDeniedError(
          'suggest',
          'This suggestion has already been decided.',
        );
      }

      const at = new Date();
      if (decision === 'approve') {
        const customer = await visibleCustomer(access, suggestion.customerId);
        const followUps = repo<FollowUpRow>(
          access.edit,
          'crmFollowUps',
          'edit',
        );
        await followUps.createOne({
          values: {
            customerId: suggestion.customerId,
            opportunityId: suggestion.opportunityId ?? null,
            ownerId: customer.ownerId,
            method: 'call',
            content: text(suggestion.detail),
            status: 'pending',
            dueAt: new Date(at.getTime() + DAY).toISOString(),
            completedAt: null,
            createdAt: at.toISOString(),
            updatedAt: at.toISOString(),
          },
        });
      }

      const updated = await suggestions.updateOne({
        filter: { id },
        values: {
          status: decision === 'approve' ? 'approved' : 'dismissed',
          decidedById: access.principalId,
          decidedAt: at.toISOString(),
          updatedAt: at.toISOString(),
        },
      });
      const names = await namesForCustomers([suggestion.customerId]);
      return {
        ...updated.record,
        customerName: names.get(suggestion.customerId) ?? null,
      };
    },
  };

  void DENY_ALL;
  void options;
  return service;
}

/**
 * Scans every pending follow-up that is due and notifies the owner. This is the
 * scheduled entry point: it runs without a request identity, so it uses the
 * unscoped repositories on purpose.
 */
export async function runFollowUpReminderScan(
  database: DatabaseManager,
  notifier: CrmNotifier,
  now: Date = new Date(),
): Promise<number> {
  const connection: DatabaseConnection = database.connection();
  const followUps = connection.repository<FollowUpRow>('crmFollowUps');

  const due = await followUps.findMany({
    filter: (builder) =>
      builder.and([
        builder.string('status').eq('pending'),
        builder.date('dueAt').notEmpty(),
        builder.date('dueAt').notAfter(new Date(now.getTime() + DAY)),
      ]),
    sort: (sort) => sort.field('dueAt').asc().nullsLast(),
  });
  if (due.length === 0) return 0;

  const names = await namesForCustomersIn(connection, due);

  let sent = 0;
  for (const row of due) {
    const dueAt = text(row.dueAt);
    const overdue = dueAt ? new Date(dueAt).getTime() < now.getTime() : false;
    const customerName = names.get(row.customerId) ?? 'a customer';
    const title = overdue ? 'Overdue follow-up' : 'Follow-up due soon';
    const body = `${customerName}: the follow-up ${
      overdue ? 'was due' : 'is due'
    } ${dueAt ? new Date(dueAt).toLocaleString() : 'soon'}.`;
    await notifier.reminder({
      to: text(row.ownerId),
      title,
      body,
      path: `/crm/customers/${row.customerId}`,
    });
    sent += 1;
  }
  return sent;
}

async function namesForCustomersIn(
  connection: DatabaseConnection,
  rows: readonly FollowUpRow[],
): Promise<Map<number, string>> {
  const unique = [...new Set(rows.map((row) => row.customerId))];
  if (unique.length === 0) return new Map();
  const customers = await connection
    .repository<CustomerRow>('crmCustomers')
    .findMany({
      filter: (builder) =>
        builder.or(unique.map((id) => builder.number('id').eq(id))),
    });
  return new Map(customers.map((row) => [row.id, text(row.name)]));
}
