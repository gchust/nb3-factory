import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import type {
  AuthorizationContext,
  AuthorizationDecision,
  CompositeResourceConditions,
} from '@nocobase/authorization/core';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { NotificationService } from '@nocobase/app-plugin-notification/server';
import type { Logger } from '@nocobase/logging';
import type {
  DatabaseConnection,
  DatabaseManager,
  RepositoryOperations,
  RepositoryPolicy,
} from '@nocobase/db';
import type { FilterBuilder, FilterNode } from '@nocobase/repository-input';

import {
  canTransition,
  nextStatus,
  OVERDUE_AFTER_MS,
  ServiceDeskError,
  type EngineerWorkload,
  type ServiceDeskDashboard,
  type TicketAction,
  type TicketDetail,
  type TicketNote,
  type TicketNoteView,
  type TicketPage,
  type TicketRecord,
  type TicketStatus,
  type TicketTransition,
  type TicketTransitionView,
  type TicketUrgency,
  type TicketView,
} from './domain.js';
import { SERVICE_DESK_RESOURCE } from './resources.js';

/** The Permission Set that marks an account as an engineer. */
export const ENGINEER_PERMISSION_SET = 'service-engineer';
/** The Permission Set that marks an account as desk staff. */
export const SERVICE_DESK_PERMISSION_SET = 'service-desk';

/** The in-app channel configured in `server/config/notification.ts`. */
const INBOX_CHANNEL = 'inbox';

/** How many tickets a list waits for before paging. */
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface TicketListInput {
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: TicketStatus;
  readonly urgency?: TicketUrgency;
  readonly keyword?: string;
  readonly assigneeId?: string;
  readonly requesterId?: string;
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description: string;
  readonly urgency: TicketUrgency;
  readonly attachmentIds?: readonly string[];
}

export interface AssignTicketInput {
  readonly assigneeId: string;
  readonly note?: string;
}

export interface ResolveTicketInput {
  readonly resolution: string;
  readonly note?: string;
}

export interface ReturnTicketInput {
  readonly reason: string;
}

export interface NoteInput {
  readonly content: string;
}

export interface EngineerOption {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface ServiceDeskServiceOptions {
  readonly database: DatabaseManager;
  readonly authorization: AppAuthorization;
  readonly notifications?: NotificationService;
  readonly logger?: Logger;
}

/** One row of the append-only workflow audit trail, as it is inserted. */
type TicketTransitionValues = Omit<TicketTransition, 'id'>;

/**
 * The ticket workflow. Every method authorizes the calling identity through the
 * composite resource before it reads or writes anything, so the database only
 * ever answers with records the caller's policy selected.
 *
 * Business rules live here: which status may follow which, which field an
 * action requires, and who is told about it. HTTP status codes and request
 * parsing stay in the routes.
 */
export class TicketWorkflow {
  private readonly database: DatabaseManager;
  private readonly authorization: AppAuthorization;
  private readonly notifications?: NotificationService;
  private readonly logger?: Logger;

  constructor(options: ServiceDeskServiceOptions) {
    this.database = options.database;
    this.authorization = options.authorization;
    this.notifications = options.notifications;
    this.logger = options.logger;
  }

  // ---------------------------------------------------------------- reads

  async listTickets(
    context: AuthorizationContext,
    input: TicketListInput,
  ): Promise<TicketPage> {
    const repository = await this.scopedTickets(context, 'view');
    const filter = buildListFilter(input);
    const page = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);

    const records = await repository.findMany({
      filter,
      sort: (sort) => sort.field('createdAt').desc(),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const total = await repository.count({ filter });

    return { items: await this.viewsOf(records), total, page, pageSize };
  }

  async getTicketDetail(
    context: AuthorizationContext,
    id: number,
  ): Promise<TicketDetail | undefined> {
    const repository = await this.scopedTickets(context, 'view');
    const ticket = await repository.findOne({ filter: { id } });
    if (!ticket) return undefined;
    return this.detailOf(ticket);
  }

  async dashboard(
    context: AuthorizationContext,
  ): Promise<ServiceDeskDashboard> {
    const repository = await this.scopedTickets(context, 'dashboard');
    const now = new Date();
    const overdueBefore = new Date(now.getTime() - OVERDUE_AFTER_MS);

    const openFilter = (filter: FilterBuilder<TicketRecord>): FilterNode =>
      filter.or([
        filter.string('status').eq('pending'),
        filter.string('status').eq('processing'),
      ]);

    const [
      pendingAssignment,
      processing,
      resolved,
      overdue,
      pendingTickets,
      overdueTickets,
    ] = await Promise.all([
      repository.count({
        filter: (filter) => filter.string('status').eq('pending'),
      }),
      repository.count({
        filter: (filter) => filter.string('status').eq('processing'),
      }),
      repository.count({
        filter: (filter) => filter.string('status').eq('resolved'),
      }),
      repository.count({
        filter: (filter) =>
          filter.and([
            openFilter(filter),
            filter.date('statusChangedAt').before(overdueBefore),
          ]),
      }),
      repository.findMany({
        filter: (filter) => filter.string('status').eq('pending'),
        sort: (sort) => sort.field('createdAt').asc(),
        limit: 10,
      }),
      repository.findMany({
        filter: (filter) =>
          filter.and([
            openFilter(filter),
            filter.date('statusChangedAt').before(overdueBefore),
          ]),
        sort: (sort) => sort.field('statusChangedAt').asc(),
        limit: 10,
      }),
    ]);

    const workload = await this.workload(context, repository, openFilter);
    const [pendingViews, overdueViews] = await Promise.all([
      this.viewsOf(pendingTickets),
      this.viewsOf(overdueTickets),
    ]);

    return {
      pendingAssignment,
      processing,
      resolved,
      overdue,
      pendingTickets: pendingViews,
      overdueTickets: overdueViews,
      workload,
    };
  }

  /** The engineers a ticket may be assigned to. */
  async listEngineers(
    context: AuthorizationContext,
  ): Promise<EngineerOption[]> {
    // Assigning is a desk responsibility; listing candidates follows it.
    await this.authorize(context, 'assign');
    const ids = await assignmentsOf(
      this.authorization,
      ENGINEER_PERMISSION_SET,
    );
    return this.usersByIds(ids);
  }

  // --------------------------------------------------------------- writes

  async createTicket(
    context: AuthorizationContext,
    input: CreateTicketInput,
  ): Promise<TicketView> {
    await this.authorize(context, 'create');
    const actorId = context.identity.principal.id;
    const now = new Date();

    const { record } = await this.database
      .repository<TicketRecord>('tickets')
      .createOne({
        values: {
          title: input.title,
          description: input.description,
          urgency: input.urgency,
          status: 'pending',
          requesterId: actorId,
          assigneeId: null,
          resolution: null,
          attachmentIds: input.attachmentIds ? [...input.attachmentIds] : null,
          statusChangedAt: now,
          lifecycleVersion: 1,
          overdueNotifiedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      });
    return (await this.viewsOf([record]))[0];
  }

  async assignTicket(
    context: AuthorizationContext,
    id: number,
    input: AssignTicketInput,
  ): Promise<TicketDetail> {
    const engineers = await assignmentsOf(
      this.authorization,
      ENGINEER_PERMISSION_SET,
    );
    if (!engineers.includes(input.assigneeId)) {
      throw new ServiceDeskError(
        'INVALID_ASSIGNEE',
        'The assignee is not an engineer.',
      );
    }

    const detail = await this.transition(context, 'assign', id, {
      values: () => ({ assigneeId: input.assigneeId }),
      note: input.note,
      payload: { assigneeId: input.assigneeId },
    });

    await this.notify({
      key: `service-desk:assigned:${id}:${detail.ticket.lifecycleVersion}`,
      recipients: [input.assigneeId],
      title: 'A ticket was assigned to you',
      body: `Ticket #${id} "${detail.ticket.title}" is now assigned to you.`,
      ticketId: id,
    });
    return detail;
  }

  async resolveTicket(
    context: AuthorizationContext,
    id: number,
    input: ResolveTicketInput,
  ): Promise<TicketDetail> {
    const detail = await this.transition(context, 'resolve', id, {
      values: () => ({ resolution: input.resolution }),
      note: input.note,
      payload: {},
    });
    await this.notify({
      key: `service-desk:resolved:${id}:${detail.ticket.lifecycleVersion}`,
      recipients: [detail.ticket.requesterId],
      title: 'Your ticket was resolved',
      body: `Ticket #${id} "${detail.ticket.title}" is waiting for your confirmation.`,
      ticketId: id,
    });
    return detail;
  }

  async confirmTicket(
    context: AuthorizationContext,
    id: number,
  ): Promise<TicketDetail> {
    const detail = await this.transition(context, 'confirm', id, {
      values: () => ({}),
      payload: {},
    });
    const assigneeId = detail.ticket.assigneeId;
    await this.notify({
      key: `service-desk:confirmed:${id}:${detail.ticket.lifecycleVersion}`,
      recipients: assigneeId ? [assigneeId] : [],
      title: 'A ticket was confirmed and closed',
      body: `Ticket #${id} "${detail.ticket.title}" was confirmed and closed.`,
      ticketId: id,
    });
    return detail;
  }

  async returnTicket(
    context: AuthorizationContext,
    id: number,
    input: ReturnTicketInput,
  ): Promise<TicketDetail> {
    const detail = await this.transition(context, 'return', id, {
      values: () => ({}),
      // The reporter's reason is the note the engineer works from.
      note: input.reason,
      payload: {},
    });
    const assigneeId = detail.ticket.assigneeId;
    await this.notify({
      key: `service-desk:returned:${id}:${detail.ticket.lifecycleVersion}`,
      recipients: assigneeId ? [assigneeId] : [],
      title: 'A ticket was returned for more work',
      body: `Ticket #${id} "${detail.ticket.title}" was returned: ${input.reason}`,
      ticketId: id,
    });
    return detail;
  }

  async addNote(
    context: AuthorizationContext,
    id: number,
    input: NoteInput,
  ): Promise<TicketDetail> {
    return this.transition(context, 'comment', id, {
      values: () => ({}),
      note: input.content,
      payload: {},
    });
  }

  // ------------------------------------------------------- scheduled work

  /**
   * Reminds the service desk about tickets that have waited more than 24 hours
   * without a state change. Each ticket is marked notified after its message is
   * accepted, so a restart does not repeat it.
   */
  async sendOverdueReminders(now: Date = new Date()): Promise<number> {
    if (!this.notifications) return 0;
    const recipients = await assignmentsOf(
      this.authorization,
      SERVICE_DESK_PERMISSION_SET,
    );
    if (!recipients.length) return 0;

    const overdueBefore = new Date(now.getTime() - OVERDUE_AFTER_MS);
    const repository = this.database.repository<TicketRecord>('tickets');
    const overdue = await repository.findMany({
      filter: (filter) =>
        filter.and([
          filter.or([
            filter.string('status').eq('pending'),
            filter.string('status').eq('processing'),
          ]),
          filter.date('statusChangedAt').before(overdueBefore),
          filter.date('overdueNotifiedAt').empty(),
        ]),
      sort: (sort) => sort.field('statusChangedAt').asc(),
      limit: 200,
    });

    let notified = 0;
    for (const ticket of overdue) {
      // The Repository returns temporal columns as portable strings, but a
      // write path can still hand us a `Date`; normalize before it reaches the
      // idempotency key.
      const stateKey =
        ticket.statusChangedAt instanceof Date
          ? ticket.statusChangedAt.toISOString()
          : ticket.statusChangedAt;
      const sent = await this.notify({
        key: `service-desk:overdue:${ticket.id}:${stateKey}`,
        recipients,
        title: 'A ticket is overdue',
        body: `Ticket #${ticket.id} "${ticket.title}" has been waiting for more than 24 hours.`,
        ticketId: ticket.id,
        // A reminder already sent for this exact state must not be repeated.
        skipIfNotified: ticket.overdueNotifiedAt !== null,
      });
      if (!sent) continue;
      await repository.updateOne({
        filter: {
          id: ticket.id,
          lifecycleVersion: ticket.lifecycleVersion,
        },
        values: { overdueNotifiedAt: now, updatedAt: now },
      });
      notified += 1;
    }
    return notified;
  }

  // --------------------------------------------------------------- helpers

  /**
   * Builds a Repository bound to the caller's record policy for one action. A
   * decision that denies throws; a `permit` with no conditions (root) leaves
   * the Repository unrestricted.
   */
  private async scopedTickets(
    context: AuthorizationContext,
    action: string,
  ): Promise<RepositoryOperations<TicketRecord>> {
    const decision = await this.authorize(context, action);
    const policy = decision.conditions?.database?.tickets;
    const repository = this.database.repository<TicketRecord>('tickets');
    if (!policy) return repository;
    return repository.withPolicy(
      policy as unknown as RepositoryPolicy<TicketRecord>,
    ) as unknown as RepositoryOperations<TicketRecord>;
  }

  private async authorize(
    context: AuthorizationContext,
    action: string,
  ): Promise<AuthorizationDecision<CompositeResourceConditions>> {
    const decision = await context.authorize({
      resource: { type: 'composite', id: SERVICE_DESK_RESOURCE },
      action,
    });
    if (decision.effect === 'deny') {
      throw new AuthorizationDeniedError(decision);
    }
    return decision;
  }

  private async detailOf(
    ticket: TicketRecord,
    connection: DatabaseConnection = this.database.connection(),
  ): Promise<TicketDetail> {
    const [notes, transitions] = await Promise.all([
      connection.repository<TicketNote>('ticketNotes').findMany({
        filter: { ticketId: ticket.id },
        sort: (sort) => sort.field('createdAt').asc(),
      }),
      connection.repository<TicketTransition>('ticketTransitions').findMany({
        filter: { ticketId: ticket.id },
        sort: (sort) => sort.field('createdAt').asc(),
      }),
    ]);
    const ids = new Set<string>([
      ticket.requesterId,
      ...notes.map((note) => note.authorId),
      ...transitions.map((transition) => transition.actorId),
    ]);
    if (ticket.assigneeId) ids.add(ticket.assigneeId);
    const names = await this.namesByIds([...ids], connection);
    return {
      ticket: withNames(ticket, names),
      notes: notes.map((note): TicketNoteView => ({
        ...note,
        authorName: names.get(note.authorId) ?? note.authorId,
      })),
      transitions: transitions.map((transition): TicketTransitionView => ({
        ...transition,
        actorName: names.get(transition.actorId) ?? transition.actorId,
      })),
    };
  }

  /**
   * The one place a ticket changes state: authorize, read under the same
   * policy, check the transition, write with an expected-version predicate,
   * append the audit row and the optional note, all inside one transaction.
   */
  private async transition(
    context: AuthorizationContext,
    action: TicketAction,
    id: number,
    options: {
      readonly values: (ticket: TicketRecord) => Partial<TicketRecord>;
      readonly note?: string;
      readonly payload: Record<string, unknown>;
    },
  ): Promise<TicketDetail> {
    const decision = await this.authorize(context, action);
    const policy = decision.conditions?.database?.tickets;
    const actorId = context.identity.principal.id;
    const now = new Date();

    return this.database.transaction(async (connection) => {
      const base = connection.repository<TicketRecord>('tickets');
      const repository = policy
        ? (base.withPolicy(
            policy as unknown as RepositoryPolicy<TicketRecord>,
          ) as unknown as RepositoryOperations<TicketRecord>)
        : base;

      const current = await repository.findOne({ filter: { id } });
      if (!current) {
        throw new ServiceDeskError(
          'TICKET_NOT_FOUND',
          `Ticket ${id} was not found.`,
        );
      }
      if (!canTransition(action, current.status as TicketStatus)) {
        throw new ServiceDeskError(
          'INVALID_TRANSITION',
          `Ticket ${id} is ${current.status} and cannot be ${action}.`,
        );
      }

      const toStatus = nextStatus(action, current.status as TicketStatus);
      const values = options.values(current);
      const nextVersion = current.lifecycleVersion + 1;
      let updated: TicketRecord | undefined;
      try {
        const result = await repository.updateOne({
          filter: (filter) =>
            filter.and([
              filter.number('id').eq(id),
              filter.number('lifecycleVersion').eq(current.lifecycleVersion),
            ]),
          values: {
            ...values,
            status: toStatus,
            statusChangedAt: now,
            lifecycleVersion: nextVersion,
            // A new state re-arms the overdue reminder.
            overdueNotifiedAt: null,
            updatedAt: now,
          },
        });
        updated = result.record;
      } catch (error) {
        // The version predicate matched no row, or a concurrent change moved
        // the ticket outside the caller's scope: somebody changed it between
        // our read and our write.
        if (isRecordNotFound(error)) {
          throw new ServiceDeskError(
            'TICKET_CONFLICT',
            `Ticket ${id} changed while it was being updated.`,
          );
        }
        throw error;
      }
      if (!updated) {
        throw new ServiceDeskError(
          'TICKET_NOT_FOUND',
          `Ticket ${id} was not found.`,
        );
      }

      const transitions =
        connection.repository<TicketTransition>('ticketTransitions');
      await transitions.createOne({
        values: {
          ticketId: id,
          action,
          fromStatus: current.status,
          toStatus,
          actorId,
          payload: options.payload,
          createdAt: now,
        } satisfies TicketTransitionValues,
      });

      if (options.note) {
        await connection.repository<TicketNote>('ticketNotes').createOne({
          values: {
            ticketId: id,
            authorId: actorId,
            content: options.note,
            createdAt: now,
          },
        });
      }

      return this.detailOf(updated, connection);
    });
  }

  private async workload(
    context: AuthorizationContext,
    repository: RepositoryOperations<TicketRecord>,
    openFilter: (filter: FilterBuilder<TicketRecord>) => FilterNode,
  ): Promise<EngineerWorkload[]> {
    void context;
    const rows = await repository.groupBy({
      by: ['assigneeId'],
      filter: openFilter,
      aggregate: (aggregate) => ({ count: aggregate.count() }),
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.assigneeId) continue;
      counts.set(row.assigneeId, Number(row.count ?? 0));
    }
    if (!counts.size) return [];
    const users = await this.usersByIds([...counts.keys()]);
    return users
      .map((user) => ({
        assigneeId: user.id,
        assigneeName: user.name || user.email,
        openCount: counts.get(user.id) ?? 0,
      }))
      .sort((a, b) => b.openCount - a.openCount);
  }

  private async usersByIds(ids: readonly string[]): Promise<EngineerOption[]> {
    if (!ids.length) return [];
    const users = await this.database
      .repository<{ id: string; name: string; email: string }>('user')
      .findMany({
        filter: (filter) =>
          filter.or(ids.map((id) => filter.string('id').eq(id))),
        sort: (sort) => sort.field('name').asc(),
      });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
    }));
  }

  /** Adds the display names of the people on each ticket, so no page shows a bare id. */
  private async viewsOf(
    tickets: readonly TicketRecord[],
    connection: DatabaseConnection = this.database.connection(),
  ): Promise<TicketView[]> {
    if (!tickets.length) return [];
    const ids = new Set<string>();
    for (const ticket of tickets) {
      ids.add(ticket.requesterId);
      if (ticket.assigneeId) ids.add(ticket.assigneeId);
    }
    const names = await this.namesByIds([...ids], connection);
    return tickets.map((ticket) => withNames(ticket, names));
  }

  /** The `id -> display name` map for a set of user ids, read through one query. */
  private async namesByIds(
    ids: readonly string[],
    connection: DatabaseConnection = this.database.connection(),
  ): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const users = await connection
      .repository<{ id: string; name: string; email: string }>('user')
      .findMany({
        filter: (filter) =>
          filter.or(ids.map((id) => filter.string('id').eq(id))),
      });
    return new Map(users.map((user) => [user.id, user.name || user.email]));
  }

  private async notify(input: {
    readonly key: string;
    readonly recipients: readonly string[];
    readonly title: string;
    readonly body: string;
    readonly ticketId: number;
    readonly skipIfNotified?: boolean;
  }): Promise<boolean> {
    if (!this.notifications || input.recipients.length === 0) return false;
    if (input.skipIfNotified) return false;
    const to = [...input.recipients];
    try {
      await this.notifications.send({
        idempotencyKey: input.key,
        source: {
          type: 'serviceDesk.ticket',
          referenceId: String(input.ticketId),
        },
        messages: {
          [INBOX_CHANNEL]: {
            to,
            title: input.title,
            body: input.body,
            target: { type: 'route', path: `/tickets/${input.ticketId}` },
          },
        },
      });
      return true;
    } catch (error) {
      // The state change already committed; a notification that could not be
      // queued must not turn a successful action into an error for the user.
      this.logger?.warn(
        `Failed to send service desk notification ${input.key}: ${String(error)}`,
      );
      return false;
    }
  }
}

/** The Permission Set assignments that name user accounts. */
async function assignmentsOf(
  authorization: AppAuthorization,
  permissionSet: string,
): Promise<string[]> {
  const assignments =
    await authorization.permissionSets.listAssignments(permissionSet);
  return assignments
    .filter((assignment) => assignment.subject.type === 'user')
    .map((assignment) => assignment.subject.id);
}

function buildListFilter(
  input: TicketListInput,
): (filter: FilterBuilder<TicketRecord>) => FilterNode {
  return (filter) => {
    const nodes: FilterNode[] = [];
    if (input.status) nodes.push(filter.string('status').eq(input.status));
    if (input.urgency) nodes.push(filter.string('urgency').eq(input.urgency));
    if (input.assigneeId) {
      nodes.push(filter.string('assigneeId').eq(input.assigneeId));
    }
    if (input.requesterId) {
      nodes.push(filter.string('requesterId').eq(input.requesterId));
    }
    if (input.keyword) {
      nodes.push(
        filter.or([
          filter.string('title').includes(input.keyword),
          filter.string('description').includes(input.keyword),
        ]),
      );
    }
    return nodes.length ? filter.and(nodes) : filter.and([]);
  };
}

function normalizePage(page: number | undefined): number {
  if (!page || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

function normalizePageSize(pageSize: number | undefined): number {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
}

function isRecordNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'RECORD_NOT_FOUND'
  );
}

/** Attaches the people's display names to one stored ticket. */
function withNames(
  ticket: TicketRecord,
  names: ReadonlyMap<string, string>,
): TicketView {
  return {
    ...ticket,
    requesterName: names.get(ticket.requesterId) ?? ticket.requesterId,
    assigneeName: ticket.assigneeId
      ? (names.get(ticket.assigneeId) ?? ticket.assigneeId)
      : null,
  };
}
