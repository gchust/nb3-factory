import type { DatabaseManager, Row } from '@nocobase/db';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization';

/**
 * Sales domain logic.
 *
 * Authorization is a single business rule: a manager (`system-administrator`
 * or `sales-manager`) sees every customer, while every other signed-in user is
 * a salesperson who sees only the customers they own. The rule is resolved
 * once per request from the Authorization plugin's Permission Sets and every
 * query is then scoped by the resulting customer ids — never filtered in
 * memory after the fact.
 *
 * The service holds no HTTP concerns: routes translate its errors into status
 * codes.
 */

export const STAGES = [
  'initial_contact',
  'needs_confirmation',
  'proposal',
  'negotiation',
  'won',
  'lost',
] as const;
export const CLOSED_STAGES = ['won', 'lost'] as const;
export const CHANNELS = [
  'phone',
  'wechat',
  'email',
  'meeting',
  'visit',
  'other',
] as const;
export const IMPORTANCE = ['high', 'normal', 'low'] as const;
export const CUSTOMER_STATUS = [
  'potential',
  'following',
  'signed',
  'lost',
] as const;
export const FILE_CATEGORIES = ['avatar', 'opportunity', 'followup'] as const;

export type Stage = (typeof STAGES)[number];
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export const MANAGER_PERMISSION_SETS = [
  'system-administrator',
  'sales-manager',
];

export class SalesError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'SalesError';
    this.code = code;
    this.status = status;
  }
}

export function notFound(message = 'Record not found.'): SalesError {
  return new SalesError('NOT_FOUND', message, 404);
}

export function forbidden(message = 'Not allowed.'): SalesError {
  return new SalesError('FORBIDDEN', message, 403);
}

export function invalid(message: string): SalesError {
  return new SalesError('VALIDATION_FAILED', message, 400);
}

export interface SalesViewer {
  readonly userId: string;
  readonly name: string;
  readonly isManager: boolean;
}

type CustomerScope =
  | { readonly all: true }
  | { readonly all: false; readonly ids: readonly string[] };

export interface CustomerInput {
  name?: unknown;
  industry?: unknown;
  source?: unknown;
  importance?: unknown;
  status?: unknown;
  ownerId?: unknown;
  phone?: unknown;
  email?: unknown;
  notes?: unknown;
}

export interface ContactInput {
  name?: unknown;
  title?: unknown;
  phone?: unknown;
  email?: unknown;
  isPrimary?: unknown;
}

export interface OpportunityInput {
  customerId?: unknown;
  name?: unknown;
  amount?: unknown;
  expectedCloseDate?: unknown;
  stage?: unknown;
  closeReason?: unknown;
}

export interface FollowUpInput {
  customerId?: unknown;
  opportunityId?: unknown;
  channel?: unknown;
  content?: unknown;
  occurredAt?: unknown;
  nextFollowUpAt?: unknown;
}

export interface FileAssociation {
  readonly customerId?: string | null;
  readonly opportunityId?: string | null;
  readonly followUpId?: string | null;
  readonly category: FileCategory;
}

export interface CustomerFilters {
  q?: string;
  status?: string;
  industry?: string;
  importance?: string;
  ownerId?: string;
}

export interface OpportunityFilters {
  q?: string;
  stage?: string;
  customerId?: string;
  ownerId?: string;
}

export interface FollowUpFilters {
  customerId?: string;
  opportunityId?: string;
  due?: 'overdue' | 'today' | 'upcoming' | 'none';
}

export class SalesService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly authorization: Pick<AppAuthorization, 'permissionSets'>,
  ) {}

  /** Resolves the viewer's role from Authorization permission-set assignments. */
  async buildViewer(userId: string, name: string): Promise<SalesViewer> {
    const sets = await this.authorization.permissionSets.getEffective({
      principal: { type: 'user', id: userId },
      subjects: [{ type: 'authenticated', id: '*' }],
    });
    const keys = new Set(sets.map((set) => set.key));
    const isManager = MANAGER_PERMISSION_SETS.some((key) => keys.has(key));
    return { userId, name, isManager };
  }

  private query() {
    return this.database.query();
  }

  private async customerScope(viewer: SalesViewer): Promise<CustomerScope> {
    if (viewer.isManager) return { all: true };
    const rows = await this.query()
      .selectFrom('salesCustomers')
      .select('id')
      .where('ownerId', '=', viewer.userId)
      .execute();
    return { all: false, ids: rows.map((row) => String(row.id)) };
  }

  private canAccessCustomer(scope: CustomerScope, customerId: string): boolean {
    return scope.all || scope.ids.includes(customerId);
  }

  async ownerDirectory(
    viewer: SalesViewer,
  ): Promise<{ id: string; name: string }[]> {
    const rows = await this.query()
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .orderBy('name', 'asc')
      .execute();
    const directory = rows.map((row) => ({
      id: String(row.id),
      name: rowName(row),
    }));
    return viewer.isManager
      ? directory
      : directory.filter((entry) => entry.id === viewer.userId);
  }

  private async ownerNames(
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const rows = await this.query()
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .where('id', 'in', unique)
      .execute();
    return new Map(rows.map((row) => [String(row.id), rowName(row)]));
  }

  // ---------------------------------------------------------------- customers

  async listCustomers(
    viewer: SalesViewer,
    filters: CustomerFilters,
  ): Promise<Row[]> {
    const scope = await this.customerScope(viewer);
    if (!scope.all && scope.ids.length === 0) return [];

    let builder = this.query().selectFrom('salesCustomers').selectAll();
    if (!scope.all) builder = builder.where('id', 'in', scope.ids);
    if (filters.status) builder = builder.where('status', '=', filters.status);
    if (filters.industry)
      builder = builder.where('industry', '=', filters.industry);
    if (filters.importance)
      builder = builder.where('importance', '=', filters.importance);
    if (filters.ownerId) {
      if (!scope.all && filters.ownerId !== viewer.userId) return [];
      builder = builder.where('ownerId', '=', filters.ownerId);
    }
    if (filters.q) {
      const term = `%${filters.q}%`;
      builder = builder.where((eb) =>
        eb.or([
          eb('name', 'like', term),
          eb('industry', 'like', term),
          eb('source', 'like', term),
        ]),
      );
    }
    const rows = await builder.orderBy('updatedAt', 'desc').execute();
    return this.decorateCustomers(rows);
  }

  async getCustomer(viewer: SalesViewer, id: string): Promise<Row> {
    const scope = await this.customerScope(viewer);
    if (!this.canAccessCustomer(scope, id))
      throw notFound('Customer not found.');
    const row = await this.query()
      .selectFrom('salesCustomers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFound('Customer not found.');
    const [decorated] = await this.decorateCustomers([row]);
    return decorated;
  }

  private async decorateCustomers(rows: Row[]): Promise<Row[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => String(row.id));
    const owners = await this.ownerNames(
      rows.map((row) => rowString(row.ownerId)),
    );

    const [contacts, opportunities, followUps] = await Promise.all([
      this.query()
        .selectFrom('salesContacts')
        .select(['customerId', 'id'])
        .where('customerId', 'in', ids)
        .execute(),
      this.query()
        .selectFrom('salesOpportunities')
        .select(['customerId', 'id', 'amount', 'stage'])
        .where('customerId', 'in', ids)
        .execute(),
      this.query()
        .selectFrom('salesFollowUps')
        .select(['customerId', 'nextFollowUpAt'])
        .where('customerId', 'in', ids)
        .execute(),
    ]);

    return rows.map((row) => {
      const id = String(row.id);
      const customerOpportunities = opportunities.filter(
        (item) => String(item.customerId) === id,
      );
      const active = customerOpportunities.filter(
        (item) => !isClosedStage(String(item.stage)),
      );
      const nextDates = followUps
        .filter((item) => String(item.customerId) === id)
        .map((item) => nullableString(item.nextFollowUpAt))
        .filter((value): value is string => value !== null)
        .sort();
      const ownerId = nullableString(row.ownerId);
      return {
        id,
        name: String(row.name),
        industry: nullableString(row.industry),
        source: nullableString(row.source),
        importance: String(row.importance),
        status: String(row.status),
        ownerId,
        ownerName: ownerId ? (owners.get(ownerId) ?? null) : null,
        phone: nullableString(row.phone),
        email: nullableString(row.email),
        notes: nullableString(row.notes),
        avatarFileId: nullableString(row.avatarFileId),
        contactCount: contacts.filter((item) => String(item.customerId) === id)
          .length,
        opportunityCount: customerOpportunities.length,
        openOpportunityAmount: active.reduce(
          (sum, item) => sum + toNumber(item.amount),
          0,
        ),
        nextFollowUpAt: nextDates[0] ?? null,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      };
    });
  }

  async createCustomer(
    viewer: SalesViewer,
    input: CustomerInput,
  ): Promise<Row> {
    const name = requireString(input.name, 'name', 255);
    const ownerId = viewer.isManager
      ? await this.resolveOwner(input.ownerId, viewer.userId)
      : viewer.userId;
    const now = new Date();
    const id = crypto.randomUUID();
    await this.query()
      .insertInto('salesCustomers')
      .values({
        id,
        name,
        industry: optionalString(input.industry, 64),
        source: optionalString(input.source, 64),
        importance: enumValue(
          input.importance,
          IMPORTANCE,
          'importance',
          'normal',
        ),
        status: enumValue(input.status, CUSTOMER_STATUS, 'status', 'potential'),
        ownerId,
        phone: optionalString(input.phone, 64),
        email: optionalString(input.email, 255),
        notes: optionalString(input.notes, 4000),
        avatarFileId: null,
        createdById: viewer.userId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.getCustomer(viewer, id);
  }

  async updateCustomer(
    viewer: SalesViewer,
    id: string,
    input: CustomerInput,
  ): Promise<Row> {
    const existing = await this.requireCustomer(viewer, id);
    const changes: Row = { updatedAt: new Date() };
    if (input.name !== undefined)
      changes.name = requireString(input.name, 'name', 255);
    if (input.industry !== undefined)
      changes.industry = optionalString(input.industry, 64);
    if (input.source !== undefined)
      changes.source = optionalString(input.source, 64);
    if (input.importance !== undefined) {
      changes.importance = enumValue(
        input.importance,
        IMPORTANCE,
        'importance',
        'normal',
      );
    }
    if (input.status !== undefined) {
      changes.status = enumValue(
        input.status,
        CUSTOMER_STATUS,
        'status',
        'potential',
      );
    }
    if (input.phone !== undefined)
      changes.phone = optionalString(input.phone, 64);
    if (input.email !== undefined)
      changes.email = optionalString(input.email, 255);
    if (input.notes !== undefined)
      changes.notes = optionalString(input.notes, 4000);

    if (input.ownerId !== undefined) {
      if (!viewer.isManager)
        throw forbidden('Only a manager can reassign a customer.');
      changes.ownerId = await this.resolveOwner(
        input.ownerId,
        rowString(existing.ownerId),
      );
    }

    await this.query()
      .updateTable('salesCustomers')
      .set(changes)
      .where('id', '=', id)
      .execute();

    if (changes.ownerId !== undefined) {
      await this.query()
        .updateTable('salesOpportunities')
        .set({ ownerId: changes.ownerId, updatedAt: new Date() })
        .where('customerId', '=', id)
        .execute();
    }
    return this.getCustomer(viewer, id);
  }

  private async requireCustomer(viewer: SalesViewer, id: string): Promise<Row> {
    const scope = await this.customerScope(viewer);
    if (!this.canAccessCustomer(scope, id))
      throw notFound('Customer not found.');
    const row = await this.query()
      .selectFrom('salesCustomers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFound('Customer not found.');
    return row;
  }

  private async resolveOwner(
    value: unknown,
    fallback: string,
  ): Promise<string> {
    const candidate =
      typeof value === 'string' && value.trim() ? value.trim() : fallback;
    const user = await this.query()
      .selectFrom('user')
      .select('id')
      .where('id', '=', candidate)
      .executeTakeFirst();
    if (!user) throw invalid('The selected owner does not exist.');
    return String(user.id);
  }

  // ----------------------------------------------------------------- contacts

  async listContacts(viewer: SalesViewer, customerId: string): Promise<Row[]> {
    await this.requireCustomer(viewer, customerId);
    const rows = await this.query()
      .selectFrom('salesContacts')
      .selectAll()
      .where('customerId', '=', customerId)
      .orderBy('isPrimary', 'desc')
      .orderBy('createdAt', 'asc')
      .execute();
    return rows.map(serializeContact);
  }

  async createContact(
    viewer: SalesViewer,
    customerId: string,
    input: ContactInput,
  ): Promise<Row> {
    await this.requireCustomer(viewer, customerId);
    const name = requireString(input.name, 'name', 255);
    const isPrimary = input.isPrimary === true;
    const now = new Date();
    const id = crypto.randomUUID();
    if (isPrimary) await this.clearPrimaryContact(customerId);
    await this.query()
      .insertInto('salesContacts')
      .values({
        id,
        customerId,
        name,
        title: optionalString(input.title, 128),
        phone: optionalString(input.phone, 64),
        email: optionalString(input.email, 255),
        isPrimary,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return {
      id,
      customerId,
      name,
      title: optionalString(input.title, 128),
      phone: optionalString(input.phone, 64),
      email: optionalString(input.email, 255),
      isPrimary,
    };
  }

  async updateContact(
    viewer: SalesViewer,
    id: string,
    input: ContactInput,
  ): Promise<Row> {
    const contact = await this.requireContact(viewer, id);
    const customerId = String(contact.customerId);
    const now = new Date();
    const changes: Row = { updatedAt: now };
    if (input.name !== undefined)
      changes.name = requireString(input.name, 'name', 255);
    if (input.title !== undefined)
      changes.title = optionalString(input.title, 128);
    if (input.phone !== undefined)
      changes.phone = optionalString(input.phone, 64);
    if (input.email !== undefined)
      changes.email = optionalString(input.email, 255);
    if (input.isPrimary !== undefined) {
      changes.isPrimary = input.isPrimary === true;
      if (changes.isPrimary) await this.clearPrimaryContact(customerId, id);
    }
    await this.query()
      .updateTable('salesContacts')
      .set(changes)
      .where('id', '=', id)
      .execute();
    const updated = await this.query()
      .selectFrom('salesContacts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return serializeContact(updated);
  }

  async deleteContact(viewer: SalesViewer, id: string): Promise<void> {
    await this.requireContact(viewer, id);
    await this.query()
      .deleteFrom('salesContacts')
      .where('id', '=', id)
      .execute();
  }

  private async requireContact(viewer: SalesViewer, id: string): Promise<Row> {
    const contact = await this.query()
      .selectFrom('salesContacts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!contact) throw notFound('Contact not found.');
    await this.requireCustomer(viewer, String(contact.customerId));
    return contact;
  }

  private async clearPrimaryContact(
    customerId: string,
    exceptId?: string,
  ): Promise<void> {
    let query = this.query()
      .updateTable('salesContacts')
      .set({ isPrimary: false, updatedAt: new Date() })
      .where('customerId', '=', customerId)
      .where('isPrimary', '=', true);
    if (exceptId) query = query.where('id', '!=', exceptId);
    await query.execute();
  }

  // ------------------------------------------------------------ opportunities

  async listOpportunities(
    viewer: SalesViewer,
    filters: OpportunityFilters,
  ): Promise<Row[]> {
    const scope = await this.customerScope(viewer);
    if (!scope.all && scope.ids.length === 0) return [];

    let builder = this.query().selectFrom('salesOpportunities').selectAll();
    if (!scope.all) builder = builder.where('customerId', 'in', scope.ids);
    if (filters.stage) builder = builder.where('stage', '=', filters.stage);
    if (filters.customerId) {
      if (!this.canAccessCustomer(scope, filters.customerId)) return [];
      builder = builder.where('customerId', '=', filters.customerId);
    }
    if (filters.ownerId) {
      if (!scope.all && filters.ownerId !== viewer.userId) return [];
      builder = builder.where('ownerId', '=', filters.ownerId);
    }
    if (filters.q) builder = builder.where('name', 'like', `%${filters.q}%`);
    const rows = await builder.orderBy('updatedAt', 'desc').execute();
    return this.decorateOpportunities(rows);
  }

  async getOpportunity(viewer: SalesViewer, id: string): Promise<Row> {
    const row = await this.requireOpportunity(viewer, id);
    const [decorated] = await this.decorateOpportunities([row]);
    return decorated;
  }

  private async requireOpportunity(
    viewer: SalesViewer,
    id: string,
  ): Promise<Row> {
    const scope = await this.customerScope(viewer);
    if (!scope.all && scope.ids.length === 0)
      throw notFound('Opportunity not found.');
    let builder = this.query()
      .selectFrom('salesOpportunities')
      .selectAll()
      .where('id', '=', id);
    if (!scope.all) builder = builder.where('customerId', 'in', scope.ids);
    const row = await builder.executeTakeFirst();
    if (!row) throw notFound('Opportunity not found.');
    return row;
  }

  private async decorateOpportunities(rows: Row[]): Promise<Row[]> {
    if (rows.length === 0) return [];
    const customerIds = [...new Set(rows.map((row) => String(row.customerId)))];
    const customers = await this.query()
      .selectFrom('salesCustomers')
      .select(['id', 'name', 'ownerId'])
      .where('id', 'in', customerIds)
      .execute();
    const customerNames = new Map(
      customers.map((row) => [String(row.id), String(row.name)]),
    );
    const owners = await this.ownerNames(
      rows.map((row) => rowString(row.ownerId)),
    );
    return rows.map((row) => {
      const ownerId = nullableString(row.ownerId);
      return {
        id: String(row.id),
        customerId: String(row.customerId),
        customerName: customerNames.get(String(row.customerId)) ?? null,
        name: String(row.name),
        amount: toNumber(row.amount),
        expectedCloseDate: nullableString(row.expectedCloseDate),
        stage: String(row.stage),
        closeReason: nullableString(row.closeReason),
        ownerId,
        ownerName: ownerId ? (owners.get(ownerId) ?? null) : null,
        isClosed: isClosedStage(String(row.stage)),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      };
    });
  }

  async createOpportunity(
    viewer: SalesViewer,
    input: OpportunityInput,
  ): Promise<Row> {
    const customerId = requireString(input.customerId, 'customerId', 64);
    const customer = await this.requireCustomer(viewer, customerId);
    const id = crypto.randomUUID();
    const stage = enumValue(input.stage, STAGES, 'stage', 'initial_contact');
    const closeReason = optionalString(input.closeReason, 2000);
    assertStageReason(stage, closeReason);
    const now = new Date();
    await this.query()
      .insertInto('salesOpportunities')
      .values({
        id,
        customerId,
        name: requireString(input.name, 'name', 255),
        amount: amountValue(input.amount, 0),
        expectedCloseDate: dateValue(
          input.expectedCloseDate,
          'expectedCloseDate',
        ),
        stage,
        closeReason: isClosedStage(stage) ? closeReason : null,
        ownerId: nullableString(customer.ownerId) ?? viewer.userId,
        createdById: viewer.userId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.getOpportunity(viewer, id);
  }

  async updateOpportunity(
    viewer: SalesViewer,
    id: string,
    input: OpportunityInput,
  ): Promise<Row> {
    const existing = await this.requireOpportunity(viewer, id);
    const changes: Row = { updatedAt: new Date() };
    if (input.name !== undefined)
      changes.name = requireString(input.name, 'name', 255);
    if (input.amount !== undefined)
      changes.amount = amountValue(input.amount, 0);
    if (input.expectedCloseDate !== undefined) {
      changes.expectedCloseDate = dateValue(
        input.expectedCloseDate,
        'expectedCloseDate',
      );
    }

    const stage =
      input.stage !== undefined
        ? enumValue(input.stage, STAGES, 'stage', String(existing.stage))
        : String(existing.stage);
    const closeReason =
      input.closeReason !== undefined
        ? optionalString(input.closeReason, 2000)
        : nullableString(existing.closeReason);

    if (input.stage !== undefined || input.closeReason !== undefined) {
      assertStageReason(stage, closeReason);
      changes.stage = stage;
      changes.closeReason = isClosedStage(stage) ? closeReason : null;
    }

    await this.query()
      .updateTable('salesOpportunities')
      .set(changes)
      .where('id', '=', id)
      .execute();
    return this.getOpportunity(viewer, id);
  }

  // ---------------------------------------------------------------- followups

  async listFollowUps(
    viewer: SalesViewer,
    filters: FollowUpFilters,
  ): Promise<Row[]> {
    const scope = await this.customerScope(viewer);
    if (!scope.all && scope.ids.length === 0) return [];

    let builder = this.query().selectFrom('salesFollowUps').selectAll();
    if (!scope.all) builder = builder.where('customerId', 'in', scope.ids);
    if (filters.customerId) {
      if (!this.canAccessCustomer(scope, filters.customerId)) return [];
      builder = builder.where('customerId', '=', filters.customerId);
    }
    if (filters.opportunityId)
      builder = builder.where('opportunityId', '=', filters.opportunityId);
    const rows = await builder.orderBy('occurredAt', 'desc').execute();
    const decorated = await this.decorateFollowUps(rows);
    if (!filters.due) return decorated;
    return decorated.filter((row) => row.dueState === filters.due);
  }

  async getFollowUp(viewer: SalesViewer, id: string): Promise<Row> {
    const row = await this.requireFollowUp(viewer, id);
    const [decorated] = await this.decorateFollowUps([row]);
    return decorated;
  }

  private async requireFollowUp(viewer: SalesViewer, id: string): Promise<Row> {
    const row = await this.query()
      .selectFrom('salesFollowUps')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFound('Follow-up not found.');
    await this.requireCustomer(viewer, String(row.customerId));
    return row;
  }

  private async decorateFollowUps(rows: Row[]): Promise<Row[]> {
    if (rows.length === 0) return [];
    const customerIds = [...new Set(rows.map((row) => String(row.customerId)))];
    const customers = await this.query()
      .selectFrom('salesCustomers')
      .select(['id', 'name'])
      .where('id', 'in', customerIds)
      .execute();
    const customerNames = new Map(
      customers.map((row) => [String(row.id), String(row.name)]),
    );
    const opportunityIds = [
      ...new Set(
        rows.map((row) => nullableString(row.opportunityId)).filter(Boolean),
      ),
    ] as string[];
    const opportunities = opportunityIds.length
      ? await this.query()
          .selectFrom('salesOpportunities')
          .select(['id', 'name', 'stage'])
          .where('id', 'in', opportunityIds)
          .execute()
      : [];
    const opportunityNames = new Map(
      opportunities.map((row) => [String(row.id), String(row.name)]),
    );
    const today = todayDate();
    return rows.map((row) => {
      const next = nullableString(row.nextFollowUpAt);
      const opportunityId = nullableString(row.opportunityId);
      return {
        id: String(row.id),
        customerId: String(row.customerId),
        customerName: customerNames.get(String(row.customerId)) ?? null,
        opportunityId,
        opportunityName: opportunityId
          ? (opportunityNames.get(opportunityId) ?? null)
          : null,
        channel: String(row.channel),
        content: String(row.content),
        occurredAt: toIso(row.occurredAt),
        nextFollowUpAt: next,
        dueState: dueState(next, today),
        createdAt: toIso(row.createdAt),
      };
    });
  }

  async createFollowUp(
    viewer: SalesViewer,
    input: FollowUpInput,
  ): Promise<Row> {
    const customerId = requireString(input.customerId, 'customerId', 64);
    await this.requireCustomer(viewer, customerId);
    const opportunityId = optionalString(input.opportunityId, 64);
    if (opportunityId) {
      const opportunity = await this.query()
        .selectFrom('salesOpportunities')
        .select(['id', 'customerId'])
        .where('id', '=', opportunityId)
        .executeTakeFirst();
      if (!opportunity)
        throw invalid('The selected opportunity does not exist.');
      if (String(opportunity.customerId) !== customerId) {
        throw invalid(
          'The opportunity belongs to a different customer and cannot be linked.',
        );
      }
    }
    const id = crypto.randomUUID();
    const now = new Date();
    await this.query()
      .insertInto('salesFollowUps')
      .values({
        id,
        customerId,
        opportunityId: opportunityId ?? null,
        channel: enumValue(input.channel, CHANNELS, 'channel', 'phone'),
        content: requireString(input.content, 'content', 4000),
        occurredAt: requiredDate(input.occurredAt, 'occurredAt', now),
        nextFollowUpAt: dateValue(input.nextFollowUpAt, 'nextFollowUpAt'),
        createdById: viewer.userId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.getFollowUp(viewer, id);
  }

  // ------------------------------------------------------------------ files

  /** Resolves the customer a file belongs to, rejecting files the viewer cannot reach. */
  async requireFile(viewer: SalesViewer, id: string): Promise<Row> {
    const row = await this.query()
      .selectFrom('salesFiles')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFound('File not found.');
    const scope = await this.customerScope(viewer);
    const customerId = nullableString(row.customerId);
    const owner = nullableString(row.uploadedById);
    const reachable = customerId
      ? this.canAccessCustomer(scope, customerId)
      : owner === viewer.userId;
    if (!reachable) throw notFound('File not found.');
    return row;
  }

  async listFiles(
    viewer: SalesViewer,
    filter: {
      customerId?: string;
      opportunityId?: string;
      followUpId?: string;
      category?: string;
    },
  ): Promise<Row[]> {
    const scope = await this.customerScope(viewer);
    if (!scope.all && scope.ids.length === 0) return [];
    let builder = this.query().selectFrom('salesFiles').selectAll();
    if (!scope.all) builder = builder.where('customerId', 'in', scope.ids);
    if (filter.customerId) {
      if (!this.canAccessCustomer(scope, filter.customerId)) return [];
      builder = builder.where('customerId', '=', filter.customerId);
    }
    if (filter.opportunityId)
      builder = builder.where('opportunityId', '=', filter.opportunityId);
    if (filter.followUpId)
      builder = builder.where('followUpId', '=', filter.followUpId);
    if (filter.category)
      builder = builder.where('category', '=', filter.category);
    const rows = await builder.orderBy('createdAt', 'asc').execute();
    return rows.map(serializeFile);
  }

  /**
   * Attaches a stored file to its business record after re-checking that the
   * viewer may write to that customer.
   */
  async attachFile(
    viewer: SalesViewer,
    fileId: string,
    association: FileAssociation,
  ): Promise<Row> {
    const row = await this.query()
      .selectFrom('salesFiles')
      .selectAll()
      .where('id', '=', fileId)
      .executeTakeFirst();
    if (!row) throw notFound('File not found.');

    // Re-resolve rather than trust the caller: the association is what decides
    // which customer's permission governs the file, so it is checked again here.
    const resolved = await this.resolveFileAssociation(viewer, association);

    await this.query()
      .updateTable('salesFiles')
      .set({
        customerId: resolved.customerId,
        opportunityId: resolved.opportunityId,
        followUpId: resolved.followUpId,
        category: resolved.category,
        uploadedById: viewer.userId,
        uploadedByName: viewer.name,
        updatedAt: new Date(),
      })
      .where('id', '=', fileId)
      .execute();

    const updated = await this.query()
      .selectFrom('salesFiles')
      .selectAll()
      .where('id', '=', fileId)
      .executeTakeFirstOrThrow();
    return serializeFile(updated);
  }

  /** Reads a file's metadata for the content route after the access check. */
  async fileForContent(viewer: SalesViewer, id: string): Promise<Row> {
    return this.requireFile(viewer, id);
  }

  /**
   * Validates where a file is about to be attached before any bytes are
   * stored, so an invalid or unauthorized target never leaves an orphan.
   */
  async resolveFileAssociation(
    viewer: SalesViewer,
    association: FileAssociation,
  ): Promise<Required<FileAssociation>> {
    if (association.category === 'opportunity') {
      if (!association.opportunityId)
        throw invalid('An opportunity is required.');
      const opportunity = await this.query()
        .selectFrom('salesOpportunities')
        .select(['id', 'customerId'])
        .where('id', '=', association.opportunityId)
        .executeTakeFirst();
      if (!opportunity) throw notFound('Opportunity not found.');
      await this.requireCustomer(viewer, String(opportunity.customerId));
      return {
        category: 'opportunity',
        customerId: String(opportunity.customerId),
        opportunityId: String(opportunity.id),
        followUpId: null,
      };
    }
    if (association.category === 'followup') {
      if (!association.followUpId) throw invalid('A follow-up is required.');
      const followUp = await this.query()
        .selectFrom('salesFollowUps')
        .select(['id', 'customerId'])
        .where('id', '=', association.followUpId)
        .executeTakeFirst();
      if (!followUp) throw notFound('Follow-up not found.');
      await this.requireCustomer(viewer, String(followUp.customerId));
      return {
        category: 'followup',
        customerId: String(followUp.customerId),
        opportunityId: null,
        followUpId: String(followUp.id),
      };
    }
    if (!association.customerId) throw invalid('A customer is required.');
    await this.requireCustomer(viewer, association.customerId);
    return {
      category: 'avatar',
      customerId: association.customerId,
      opportunityId: null,
      followUpId: null,
    };
  }

  /** Points a customer at a freshly stored avatar, returning the replaced file. */
  async setCustomerAvatar(
    viewer: SalesViewer,
    customerId: string,
    fileId: string,
  ): Promise<Row | null> {
    const customer = await this.requireCustomer(viewer, customerId);
    const previousId = nullableString(customer.avatarFileId);
    const file = await this.query()
      .selectFrom('salesFiles')
      .selectAll()
      .where('id', '=', fileId)
      .executeTakeFirst();
    if (!file) throw notFound('File not found.');
    await this.query()
      .updateTable('salesFiles')
      .set({
        customerId,
        opportunityId: null,
        followUpId: null,
        category: 'avatar',
        uploadedById: viewer.userId,
        uploadedByName: viewer.name,
        updatedAt: new Date(),
      })
      .where('id', '=', fileId)
      .execute();
    await this.query()
      .updateTable('salesCustomers')
      .set({ avatarFileId: fileId, updatedAt: new Date() })
      .where('id', '=', customerId)
      .execute();
    if (previousId && previousId !== fileId) {
      return this.removeFileRow(previousId);
    }
    return null;
  }

  /** Clears a customer's avatar, returning the removed file for cleanup. */
  async clearCustomerAvatar(
    viewer: SalesViewer,
    customerId: string,
  ): Promise<Row | null> {
    const customer = await this.requireCustomer(viewer, customerId);
    const previousId = nullableString(customer.avatarFileId);
    await this.query()
      .updateTable('salesCustomers')
      .set({ avatarFileId: null, updatedAt: new Date() })
      .where('id', '=', customerId)
      .execute();
    if (!previousId) return null;
    return this.removeFileRow(previousId);
  }

  /** Deletes a file row without an access check; callers have already checked. */
  async removeFileRow(id: string): Promise<Row | null> {
    const row = await this.query()
      .selectFrom('salesFiles')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return null;
    await this.query().deleteFrom('salesFiles').where('id', '=', id).execute();
    return row;
  }

  async deleteFile(viewer: SalesViewer, id: string): Promise<void> {
    const row = await this.requireFile(viewer, id);
    await this.query().deleteFrom('salesFiles').where('id', '=', id).execute();
    const customerId = nullableString(row.customerId);
    if (customerId && row.category === 'avatar') {
      await this.query()
        .updateTable('salesCustomers')
        .set({ avatarFileId: null, updatedAt: new Date() })
        .where('id', '=', customerId)
        .where('avatarFileId', '=', id)
        .execute();
    }
  }

  // -------------------------------------------------------------- dashboard

  async dashboard(viewer: SalesViewer): Promise<Row> {
    const scope = await this.customerScope(viewer);
    if (!scope.all && scope.ids.length === 0) {
      return emptyDashboard();
    }

    const customersQuery = this.query()
      .selectFrom('salesCustomers')
      .select('id');
    const customers = scope.all
      ? await customersQuery.execute()
      : await customersQuery.where('id', 'in', scope.ids).execute();
    const customerIds = customers.map((row) => String(row.id));

    const opportunitiesQuery = this.query()
      .selectFrom('salesOpportunities')
      .select(['stage', 'amount', 'customerId']);
    const opportunities = scope.all
      ? await opportunitiesQuery.execute()
      : await opportunitiesQuery
          .where('customerId', 'in', customerIds)
          .execute();

    const stageCounts = STAGES.map((stage) => {
      const rows = opportunities.filter((row) => String(row.stage) === stage);
      return {
        stage,
        count: rows.length,
        amount: rows.reduce((sum, row) => sum + toNumber(row.amount), 0),
      };
    });
    const activeAmount = opportunities
      .filter((row) => !isClosedStage(String(row.stage)))
      .reduce((sum, row) => sum + toNumber(row.amount), 0);

    const followUpsQuery = this.query()
      .selectFrom('salesFollowUps')
      .select(['customerId', 'nextFollowUpAt', 'occurredAt']);
    const followUps = scope.all
      ? await followUpsQuery.execute()
      : await followUpsQuery.where('customerId', 'in', customerIds).execute();

    const today = todayDate();
    const latestByCustomer = new Map<string, Row>();
    for (const row of followUps) {
      const customerId = String(row.customerId);
      const next = nullableString(row.nextFollowUpAt);
      if (!next) continue;
      const occurred = toIso(row.occurredAt) ?? '';
      const current = latestByCustomer.get(customerId);
      if (!current || occurred > rowString(current.__occurred)) {
        latestByCustomer.set(customerId, {
          ...row,
          __occurred: occurred,
          __next: next,
          __customerId: customerId,
        });
      }
    }

    const customerNames =
      customerIds.length === 0
        ? new Map<string, string>()
        : new Map(
            (
              await this.query()
                .selectFrom('salesCustomers')
                .select(['id', 'name'])
                .where('id', 'in', customerIds)
                .execute()
            ).map((row) => [String(row.id), String(row.name)]),
          );

    let overdue = 0;
    let dueToday = 0;
    let upcoming = 0;
    const needsFollowUp: Row[] = [];
    for (const [customerId, row] of latestByCustomer) {
      const next = String(row.__next);
      const state = dueState(next, today);
      if (state === 'overdue') {
        overdue += 1;
        needsFollowUp.push({
          customerId,
          customerName: customerNames.get(customerId) ?? null,
          nextFollowUpAt: next,
          dueState: state,
        });
      } else if (state === 'today') {
        dueToday += 1;
        needsFollowUp.push({
          customerId,
          customerName: customerNames.get(customerId) ?? null,
          nextFollowUpAt: next,
          dueState: state,
        });
      } else if (state === 'upcoming') {
        upcoming += 1;
      }
    }
    needsFollowUp.sort((left, right) =>
      String(left.nextFollowUpAt).localeCompare(String(right.nextFollowUpAt)),
    );

    return {
      customerCount: customerIds.length,
      openOpportunityCount: opportunities.filter(
        (row) => !isClosedStage(String(row.stage)),
      ).length,
      openOpportunityAmount: activeAmount,
      stageCounts,
      followUp: { overdue, today: dueToday, upcoming },
      customersNeedingFollowUp: needsFollowUp.slice(0, 10),
    };
  }
}

// -------------------------------------------------------------------- helpers

function emptyDashboard(): Row {
  return {
    customerCount: 0,
    openOpportunityCount: 0,
    openOpportunityAmount: 0,
    stageCounts: STAGES.map((stage) => ({ stage, count: 0, amount: 0 })),
    followUp: { overdue: 0, today: 0, upcoming: 0 },
    customersNeedingFollowUp: [],
  };
}

function rowName(row: Row): string {
  const name = nullableString(row.name);
  return name ?? nullableString(row.username) ?? String(row.id);
}

export function isClosedStage(stage: string): boolean {
  return (CLOSED_STAGES as readonly string[]).includes(stage);
}

export function assertStageReason(stage: string, reason: string | null): void {
  if (isClosedStage(stage) && !reason) {
    throw invalid('A close reason is required when a deal is won or lost.');
  }
}

export function dueState(
  nextFollowUpAt: string | null,
  today: string,
): 'overdue' | 'today' | 'upcoming' | 'none' {
  if (!nextFollowUpAt) return 'none';
  if (nextFollowUpAt < today) return 'overdue';
  if (nextFollowUpAt === today) return 'today';
  return 'upcoming';
}

export function serializeContact(row: Row): Row {
  return {
    id: String(row.id),
    customerId: String(row.customerId),
    name: String(row.name),
    title: nullableString(row.title),
    phone: nullableString(row.phone),
    email: nullableString(row.email),
    isPrimary: row.isPrimary === true || row.isPrimary === 1,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function serializeFile(row: Row): Row {
  return {
    id: String(row.id),
    filename: String(row.filename),
    ext: String(row.ext),
    mimeType: String(row.mimeType),
    size: toNumber(row.size),
    category: nullableString(row.category),
    customerId: nullableString(row.customerId),
    opportunityId: nullableString(row.opportunityId),
    followUpId: nullableString(row.followUpId),
    uploadedById: nullableString(row.uploadedById),
    uploadedByName: nullableString(row.uploadedByName),
    createdAt: toIso(row.createdAt),
    contentUrl: `sales/files/${encodeURIComponent(String(row.id))}/content`,
  };
}

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw invalid(`${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max)
    throw invalid(`${field} must be at most ${max} characters.`);
  return trimmed;
}

function optionalString(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalid('Expected a text value.');
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max)
    throw invalid(`Value must be at most ${max} characters.`);
  return trimmed;
}

function nullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value || null;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return null;
}

/** A database value known to be a scalar, rendered as text. */
function rowString(value: unknown): string {
  return nullableString(value) ?? '';
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  fallback: T,
): T {
  if (value === undefined || value === null || value === '') return fallback;
  if (
    typeof value !== 'string' ||
    !(allowed as readonly string[]).includes(value)
  ) {
    throw invalid(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

function amountValue(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw invalid('amount must be a non-negative number.');
  }
  return amount;
}

function dateValue(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalid(`${field} must be a date in YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()))
    throw invalid(`${field} is not a valid date.`);
  return value;
}

function requiredDate(value: unknown, field: string, fallback: Date): Date {
  if (value === undefined || value === null || value === '') return fallback;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw invalid(`${field} must be a valid date and time.`);
}

export function todayDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toIso(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  return null;
}
