import { randomUUID } from 'node:crypto';

import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { loggingToken } from '@nocobase/app-server/logging';
import { ApiError } from '@nocobase/app-server/router';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { AuthorizationContext } from '@nocobase/authorization/core';
import type {
  DatabaseConnection,
  DatabaseManager,
  RepositoryPolicy,
} from '@nocobase/db';
import { databaseManagerToken } from '@nocobase/db';
import {
  LifecycleError,
  LifecycleRuntime,
  createRepositoryLifecycleStore,
  lifecycleErrorFields,
  type AvailableTransition,
  type JsonObject,
  type LifecycleActor,
  type RecordHistory,
} from '@nocobase/lifecycle';
import {
  createLifecycleJobs,
  type LifecycleJobs,
} from '@nocobase/lifecycle/jobs';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import type { FilterBuilder } from '@nocobase/repository-input';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import { createDiagnosticLogger } from '@nocobase/logging';

import {
  ticketLifecycle,
  ticketLifecycleDescription,
  type TicketTransitionName,
} from '../lifecycles/ticket.js';
import type {
  TicketParameters,
  TicketRecord,
  TicketRoleReader,
  TicketNotifierPort,
} from '../lifecycles/ticket-types.js';
import { TicketNotifier } from './ticket-notifier.js';
import { TicketRoleService } from './ticket-roles.js';
import {
  registerTicketAuthorization,
  type TicketCommentRecord,
} from '../tickets/resources.js';

/** The ticket feature's domain service, resolved by its routes and by the scheduler sweep. */
export const ticketServiceToken = createServiceToken<TicketService>('tickets');
/** The registered ticket lifecycle runtime, for pages that need the diagram or a record's history. */
export const ticketLifecycleRuntimeToken =
  createServiceToken<LifecycleRuntime>('tickets.lifecycle');

/** Who is acting. The routes build it from the session; nothing else may. */
export interface TicketActor {
  readonly id: string;
  readonly name: string;
}

export interface TicketListQuery {
  readonly status?: string;
  readonly urgency?: string;
  readonly assigneeId?: string;
  readonly keyword?: string;
  readonly overdue?: boolean;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface TicketCreateInput {
  readonly title: string;
  readonly description?: string;
  readonly category?: string;
  readonly urgency?: string;
  readonly attachmentId?: string;
}

export interface TicketListResult {
  readonly items: readonly TicketRecord[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface TicketDetailResult {
  readonly ticket: TicketRecord;
  readonly available: readonly AvailableTransition[];
  readonly history: RecordHistory;
  readonly comments: readonly TicketCommentRecord[];
  readonly version: number | null;
}

export interface TicketWorkloadRow {
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly active: number;
  readonly waiting: number;
}

export interface TicketDashboard {
  readonly pendingAssignment: number;
  readonly inProgress: number;
  readonly waitingConfirmation: number;
  readonly overdue: number;
  readonly reportedByMe: number;
  readonly assignedToMe: number;
  readonly overdueHours: number;
  readonly workload: readonly TicketWorkloadRow[];
  readonly recent: readonly TicketRecord[];
}

export interface TicketTransitionRow {
  readonly id: string;
  readonly recordId: string;
  readonly recordTitle: string;
  readonly transition: string;
  readonly from: string | null;
  readonly to: string;
  readonly actorId: string | null;
  readonly at: string;
  readonly version: number;
}

export interface TicketEffectRow {
  readonly id: string;
  readonly recordId: string;
  readonly effect: string;
  readonly status: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly error: string | null;
  readonly createdAt: string;
}

export interface TicketDefinitionSummary {
  readonly name: string;
  readonly title: string;
  readonly collection: string;
  readonly states: readonly string[];
  readonly parameters: TicketParameters;
}

/** Which composite action each lifecycle transition belongs to. */
const TRANSITION_ACTION: Readonly<Record<TicketTransitionName, string>> = {
  assign: 'assign',
  reassign: 'assign',
  start: 'handle',
  resolve: 'handle',
  confirm: 'confirm',
  returnForRework: 'confirm',
  reopen: 'confirm',
};

/** A database or JSON column read as display text; a column that reaches here is never an object. */
function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

/** What the comment log says about a transition, in both of the application's languages. */
function transitionComment(
  transition: TicketTransitionName,
  record: TicketRecord,
  input: Record<string, unknown>,
): { kind: TicketCommentRecord['kind']; body: string } {
  switch (transition) {
    case 'assign':
    case 'reassign':
      return {
        kind: 'system',
        body: `已分派给 ${record.assigneeName ?? record.assigneeId ?? ''} / Assigned to ${record.assigneeName ?? record.assigneeId ?? ''}`,
      };
    case 'start':
      return { kind: 'system', body: '开始处理 / Handling started' };
    case 'resolve':
      return {
        kind: 'resolution',
        body: `处理结果：${record.resolution ?? ''} / Resolution: ${record.resolution ?? ''}`,
      };
    case 'confirm':
      return {
        kind: 'system',
        body: '报修人已确认关闭 / Confirmed and closed by the reporter',
      };
    case 'returnForRework':
      return {
        kind: 'comment',
        body: `退回继续处理：${asText(input.reason)} / Returned for further handling: ${asText(input.reason)}`,
      };
    case 'reopen':
      return {
        kind: 'comment',
        body: `重新打开：${asText(input.reason)} / Reopened: ${asText(input.reason)}`,
      };
  }
}

/**
 * The ticket feature's domain logic.
 *
 * Every method takes the request's `AuthorizationContext` and resolves the composite decision itself, so an endpoint
 * cannot accidentally read a ticket the actor may not see: the decision names both the verb and the record scope, and
 * the repositories below are always bound to the policy it returned. The lifecycle's own guards repeat the
 * who-may-do-what rules inside the transition's transaction, so a concurrent change or a forgotten route check cannot
 * hand a ticket to the wrong person.
 */
export class TicketService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly runtime: LifecycleRuntime,
    private readonly roles: TicketRoleReader,
    private readonly notify: TicketNotifierPort,
  ) {}

  private denied(action: string, reason: string): ApiError {
    return new ApiError({
      status: 'PERMISSION_DENIED',
      reason,
      domain: 'tickets',
      message: `The current identity may not ${action} this ticket.`,
    });
  }

  private notFound(id: string): ApiError {
    return new ApiError({
      status: 'NOT_FOUND',
      reason: 'TICKET_NOT_FOUND',
      domain: 'tickets',
      message: `Ticket ${id} was not found.`,
    });
  }

  /**
   * Resolves one composite action. A denial, or a decision that carries no policy for the tickets table, is refused
   * the same way: without a policy there is nothing the caller may read.
   */
  private async permit(
    authorization: AuthorizationContext,
    action: string,
  ): Promise<Readonly<Record<string, RepositoryPolicy>>> {
    const decision = await authorization.authorize({
      resource: { type: 'composite', id: 'tickets' },
      action,
    });
    const policies = decision.conditions?.database;
    if (decision.effect === 'deny' || !policies?.tickets) {
      throw this.denied(action, 'TICKET_ACTION_DENIED');
    }
    return policies;
  }

  /** Turns a lifecycle refusal into the standard error body; anything else is the server's own fault. */
  private translate(error: unknown): never {
    if (error instanceof LifecycleError) {
      const fields = lifecycleErrorFields(error, { inputField: 'input' });
      if (fields) {
        throw new ApiError({ ...fields, domain: 'tickets' });
      }
    }
    throw error;
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private async writeComment(
    connection: DatabaseConnection,
    ticketId: string,
    actor: TicketActor,
    kind: TicketCommentRecord['kind'],
    body: string,
  ): Promise<void> {
    const now = this.nowIso();
    await connection
      .repository<TicketCommentRecord>('ticketComments')
      .createOne({
        values: {
          id: randomUUID(),
          ticketId,
          authorId: actor.id,
          authorName: actor.name,
          kind,
          body,
          createdAt: now,
          updatedAt: now,
        },
      });
  }

  /** The definition the management page draws and reads its parameters from. */
  definition(): TicketDefinitionSummary {
    const parameters = this.runtime.parameters('ticket') as TicketParameters;
    return {
      name: ticketLifecycle.name,
      title: '报修处理 / Repair handling',
      collection: ticketLifecycle.collection ?? ticketLifecycle.name,
      states: [...ticketLifecycleDescription.states],
      parameters,
    };
  }

  /** The transition diagram, as the lifecycle describes itself. */
  description() {
    return ticketLifecycleDescription;
  }

  async list(
    authorization: AuthorizationContext,
    actor: TicketActor,
    query: TicketListQuery,
  ): Promise<TicketListResult> {
    const policies = await this.permit(authorization, 'view');
    const policy = policies.tickets;
    const repository = this.database
      .repository<TicketRecord>('tickets')
      .withPolicy(policy);

    const filter = (f: FilterBuilder<TicketRecord>) => {
      const items = [];
      if (query.status) items.push(f.string('status').eq(query.status));
      if (query.urgency) items.push(f.string('urgency').eq(query.urgency));
      if (query.assigneeId)
        items.push(f.string('assigneeId').eq(query.assigneeId));
      if (query.overdue) {
        // The same window the dashboard counts and the reminder sweeps: still open, and older than the configured
        // number of hours. A resolved ticket is not closed yet, so it is still overdue until the reporter confirms.
        const parameters = this.runtime.parameters(
          'ticket',
        ) as TicketParameters;
        const cutoff = new Date(
          Date.now() - parameters.overdueHours * 60 * 60 * 1000,
        ).toISOString();
        items.push(
          f.and([
            f.string('status').ne('closed'),
            f.date('createdAt').notAfter(cutoff),
          ]),
        );
      }
      if (query.keyword) {
        const keyword = query.keyword;
        items.push(
          f.or([
            f.string('title').includes(keyword, { mode: 'insensitive' }),
            f.text('description').includes(keyword, { mode: 'insensitive' }),
          ]),
        );
      }
      if (items.length === 0) {
        return f.string('status').notEmpty();
      }
      return items.length === 1 ? items[0] : f.and(items);
    };

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const [rows, total] = await Promise.all([
      repository.findMany({
        filter,
        sort: (sort) => sort.field('createdAt').desc(),
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      repository.count({ filter }),
    ]);

    void actor;
    // A policy-scoped read returns a partial row; every field the list shows is inside the read policy.
    return { items: rows as readonly TicketRecord[], total, page, pageSize };
  }

  async detail(
    authorization: AuthorizationContext,
    actor: TicketActor,
    id: string,
  ): Promise<TicketDetailResult> {
    const policies = await this.permit(authorization, 'view');
    const policy = policies.tickets;
    const ticket = await this.database
      .repository<TicketRecord>('tickets')
      .withPolicy(policy)
      .findOne({ filter: { id } });
    if (!ticket) {
      throw this.notFound(id);
    }

    const view = await this.runtime.view(
      'ticket',
      id,
      this.lifecycleActor(actor),
    );
    const comments = await this.database
      .repository<TicketCommentRecord>('ticketComments')
      .findMany({
        filter: { ticketId: id },
        sort: (sort) => sort.field('createdAt').asc(),
      });

    return {
      ticket: view.record as TicketRecord,
      available: view.available,
      history: view.history,
      comments,
      version: view.version,
    };
  }

  async create(
    authorization: AuthorizationContext,
    actor: TicketActor,
    input: TicketCreateInput,
  ): Promise<TicketDetailResult> {
    await this.permit(authorization, 'create');
    const now = this.nowIso();
    const id = randomUUID();

    const created = await this.database.transaction(async (connection) => {
      const result = await this.runtime.create(
        'ticket',
        {
          id,
          title: input.title,
          description: input.description ?? null,
          category: input.category ?? null,
          urgency: input.urgency ?? 'normal',
          reporterId: actor.id,
          reporterName: actor.name,
          reopenCount: 0,
          attachmentId: input.attachmentId ?? null,
          createdAt: now,
          updatedAt: now,
        },
        {
          actor: this.lifecycleActor(actor),
          transaction: connection,
          input: {
            title: input.title,
            urgency: input.urgency ?? 'normal',
          },
        },
      );
      await this.writeComment(
        connection,
        id,
        actor,
        'system',
        '已提交报修 / Repair request submitted',
      );
      return result.record as TicketRecord;
    });

    // After the creation committed, so a failed notice can never undo a reported ticket.
    await this.notify.created(created, `ticket-created:${id}`);
    return this.detail(authorization, actor, id);
  }

  async comment(
    authorization: AuthorizationContext,
    actor: TicketActor,
    id: string,
    body: string,
  ): Promise<TicketCommentRecord> {
    const policies = await this.permit(authorization, 'comment');
    const ticket = await this.database
      .repository<TicketRecord>('tickets')
      .withPolicy(policies.tickets)
      .findOne({ filter: { id } });
    if (!ticket) {
      throw this.notFound(id);
    }
    const now = this.nowIso();
    const record: TicketCommentRecord = {
      id: randomUUID(),
      ticketId: id,
      authorId: actor.id,
      authorName: actor.name,
      kind: 'comment',
      body,
      createdAt: now,
      updatedAt: now,
    };
    await this.database
      .repository<TicketCommentRecord>('ticketComments')
      .createOne({ values: record });
    return record;
  }

  async fire(
    authorization: AuthorizationContext,
    actor: TicketActor,
    id: string,
    transition: TicketTransitionName,
    input: Record<string, unknown>,
    options: { version?: number; requestId?: string } = {},
  ): Promise<TicketDetailResult> {
    const action = TRANSITION_ACTION[transition];
    const policies = await this.permit(authorization, action);
    const policy = policies.tickets;

    try {
      await this.database.transaction(async (connection) => {
        const ticket = await connection
          .repository<TicketRecord>('tickets')
          .withPolicy(policy)
          .findOne({ filter: { id } });
        if (!ticket) {
          throw this.notFound(id);
        }
        const result = await this.runtime.fire('ticket', id, transition, {
          manual: true,
          actor: this.lifecycleActor(actor),
          input: input as unknown as JsonObject,
          ...(options.version !== undefined
            ? { expect: { version: options.version } }
            : {}),
          ...(options.requestId ? { requestId: options.requestId } : {}),
          transaction: connection,
        });
        const record = result.record as TicketRecord;
        const comment = transitionComment(transition, record, input);
        await this.writeComment(
          connection,
          id,
          actor,
          comment.kind,
          comment.body,
        );
      });
    } catch (error) {
      this.translate(error);
    }

    return this.detail(authorization, actor, id);
  }

  private lifecycleActor(actor: TicketActor): LifecycleActor {
    return { id: actor.id };
  }

  async dashboard(
    authorization: AuthorizationContext,
    actor: TicketActor,
  ): Promise<TicketDashboard> {
    const policies = await this.permit(authorization, 'dashboard');
    const rows = await this.database
      .repository<TicketRecord>('tickets')
      .withPolicy(policies.tickets)
      .findMany({
        sort: (sort) => sort.field('createdAt').desc(),
        limit: 1000,
      });
    const tickets = rows as readonly TicketRecord[];

    const parameters = this.runtime.parameters('ticket') as TicketParameters;
    const overdueBefore = new Date(
      Date.now() - parameters.overdueHours * 60 * 60 * 1000,
    ).toISOString();

    const workload = new Map<
      string,
      {
        assigneeId: string;
        assigneeName: string;
        active: number;
        waiting: number;
      }
    >();
    let pendingAssignment = 0;
    let inProgress = 0;
    let waitingConfirmation = 0;
    let overdue = 0;
    let reportedByMe = 0;
    let assignedToMe = 0;

    for (const ticket of tickets) {
      if (ticket.reporterId === actor.id) reportedByMe += 1;
      if (ticket.assigneeId === actor.id) assignedToMe += 1;

      if (ticket.status === 'submitted') pendingAssignment += 1;
      if (ticket.status === 'inProgress') inProgress += 1;
      if (ticket.status === 'resolved') waitingConfirmation += 1;
      if (ticket.status !== 'closed' && ticket.createdAt <= overdueBefore) {
        overdue += 1;
      }

      if (ticket.assigneeId && ticket.status !== 'closed') {
        const row = workload.get(ticket.assigneeId) ?? {
          assigneeId: ticket.assigneeId,
          assigneeName: ticket.assigneeName ?? ticket.assigneeId,
          active: 0,
          waiting: 0,
        };
        if (ticket.status === 'resolved') {
          row.waiting += 1;
        } else {
          row.active += 1;
        }
        workload.set(ticket.assigneeId, row);
      }
    }

    return {
      pendingAssignment,
      inProgress,
      waitingConfirmation,
      overdue,
      reportedByMe,
      assignedToMe,
      overdueHours: parameters.overdueHours,
      workload: [...workload.values()].sort((a, b) => b.active - a.active),
      recent: tickets.slice(0, 8),
    };
  }

  /**
   * May the caller read the bytes of a file a ticket carries?
   *
   * A screenshot is reachable through the ticket that names it and through nothing else: the file content route is
   * outside `/api` and therefore outside the framework's authentication, so it asks this question before it streams a
   * byte. A file no visible ticket names answers `false`, which the route reports as `404` so the difference cannot be
   * used to probe which ids exist.
   */
  async canReadAttachment(
    authorization: AuthorizationContext,
    actor: TicketActor,
    fileId: string,
  ): Promise<boolean> {
    // The uploader may always read what they just uploaded: the create form previews the screenshot before the ticket
    // that will name it has been saved.
    const file = await this.database
      .connection()
      .query.selectFrom('ticket_files')
      .select(['ownerId'])
      .where('id', '=', fileId)
      .executeTakeFirst();
    if (file && String(file.ownerId) === actor.id) {
      return true;
    }

    const policies = await this.permit(authorization, 'view');
    const ticket = await this.database
      .repository<TicketRecord>('tickets')
      .withPolicy(policies.tickets)
      .findOne({ filter: { attachmentId: fileId } });
    return !!ticket;
  }

  /** The people the service desk can hand a ticket to, named for a picker. */
  async assignableUsers(): Promise<readonly { id: string; name: string }[]> {
    const ids = await this.roles.engineerUserIds();
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.database
      .connection()
      .query.selectFrom('user')
      .select(['id', 'name', 'email'])
      .where('id', 'in', ids)
      .execute();
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? row.email ?? row.id),
    }));
  }

  /** The lifecycle's recent transitions and effect runs, for the management page. */
  async executions(
    authorization: AuthorizationContext,
    options: { page?: number; pageSize?: number; recordId?: string } = {},
  ): Promise<{
    readonly transitions: readonly TicketTransitionRow[];
    readonly effects: readonly TicketEffectRow[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  }> {
    await this.permit(authorization, 'lifecycle');
    const connection = this.database.connection();
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));

    let query = connection.query
      .selectFrom('lifecycleTransitions')
      .selectAll()
      .where('lifecycle', '=', 'ticket');
    if (options.recordId) {
      query = query.where('recordId', '=', options.recordId);
    }
    const rows = await query
      .orderBy('id', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute();

    const recordIds = [...new Set(rows.map((row) => String(row.recordId)))];
    const titles = new Map<string, string>();
    if (recordIds.length > 0) {
      const tickets = await connection.query
        .selectFrom('tickets')
        .select(['id', 'title'])
        .where('id', 'in', recordIds)
        .execute();
      for (const ticket of tickets) {
        titles.set(asText(ticket.id), asText(ticket.title));
      }
    }

    const transitionIds = rows.map((row) => row.id);
    const effects =
      transitionIds.length > 0
        ? await connection.query
            .selectFrom('lifecycleEffectRuns')
            .selectAll()
            .where('transitionId', 'in', transitionIds)
            .orderBy('id', 'desc')
            .execute()
        : [];

    const countQuery = connection.query
      .selectFrom('lifecycleTransitions')
      .select((expression) => [expression.fn.countAll().as('count')])
      .where('lifecycle', '=', 'ticket');
    const totalRow = await (
      options.recordId
        ? countQuery.where('recordId', '=', options.recordId)
        : countQuery
    ).executeTakeFirst();

    return {
      transitions: rows.map((row) => ({
        id: String(row.id),
        recordId: String(row.recordId),
        recordTitle: titles.get(String(row.recordId)) ?? '',
        transition: String(row.transition),
        from: row.from === null ? null : asText(row.from),
        to: asText(row.to),
        actorId: row.actorId === null ? null : asText(row.actorId),
        at: String(row.at),
        version: Number(row.version),
      })),
      effects: effects.map((row) => ({
        id: String(row.id),
        recordId: String(row.recordId),
        effect: String(row.effect),
        status: String(row.status),
        attempts: Number(row.attempts),
        maxAttempts: Number(row.maxAttempts),
        error: row.error === null ? null : asText(row.error),
        createdAt: String(row.createdAt),
      })),
      total: Number(totalRow?.count ?? 0),
      page,
      pageSize,
    };
  }

  /** The transition history of one ticket, for a detail page that does not need the diagram. */
  async history(id: string): Promise<RecordHistory> {
    return this.runtime.history('ticket', id);
  }

  /**
   * Reminds the service desk about tickets that have stayed unresolved longer than the configured window.
   *
   * This is a sweep rather than a transition: a self-transition would rewrite `statusChangedAt` and restart the
   * window on every assignment, so a ticket handed between engineers would never look overdue. The stamp is written
   * after the notice, and a failed notice leaves it unset so the next sweep tries again.
   */
  async remindOverdue(): Promise<number> {
    const parameters = this.runtime.parameters('ticket') as TicketParameters;
    const connection = this.database.connection();
    const now = new Date();
    const threshold = new Date(
      now.getTime() - parameters.overdueHours * 60 * 60 * 1000,
    ).toISOString();

    const rows = await connection.query
      .selectFrom('tickets')
      .selectAll()
      .where('status', '!=', 'closed')
      .where('createdAt', '<=', threshold)
      .execute();

    let reminded = 0;
    for (const row of rows) {
      const record = row as unknown as TicketRecord;
      if (record.overdueNotifiedAt && record.overdueNotifiedAt > threshold) {
        continue;
      }
      await this.notify.overdue(record);
      await connection.repository<TicketRecord>('tickets').updateOne({
        filter: { id: record.id },
        values: { overdueNotifiedAt: now.toISOString() },
      });
      reminded += 1;
    }
    return reminded;
  }
}

/**
 * Builds the ticket runtime, its jobs and its service, and registers the feature's permission model.
 *
 * The runtime is created and its lifecycle registered in `register()`, before any route is built, so a route factory
 * can resolve `ticketServiceToken` at creation time. The jobs dispatcher is started in `start()`, once the jobs
 * service provider has registered its own token, and `createLifecycleJobs.start()` also recovers whatever a previous
 * process left queued.
 */
export class TicketServiceProvider extends ServiceProvider<Application> {
  readonly name = 'tickets';

  private runtime?: LifecycleRuntime;
  private jobs?: LifecycleJobs;
  private service?: TicketService;

  private logger() {
    const logging = this.app.container.resolveIfCreated(loggingToken);
    return createDiagnosticLogger(logging?.getLogger('tickets'));
  }

  register(): void {
    // Resolving here proves the database provider registered its token before this feature's routes are built.
    this.app.container.resolve(databaseManagerToken);
  }

  boot(): Promise<void> {
    return this.setup();
  }

  private async setup(): Promise<void> {
    const database = this.app.container.resolve(databaseManagerToken);
    // A host that builds an application without the authorization plugin (some framework tests do) still gets the
    // runtime and the service; only the permission model registration needs the plugin, and its absence is reported
    // rather than thrown so the rest of the application can still boot.
    const authz = this.app.container.resolveIfCreated(authorizationToken);
    if (authz) {
      registerTicketAuthorization(authz);
    } else {
      this.logger().warn(
        'The authorization plugin is not registered, so the ticket permission model was not declared.',
      );
    }

    const runtime = new LifecycleRuntime({
      store: createRepositoryLifecycleStore(database),
      logger: this.logger(),
    });

    const roles = new TicketRoleService(database.connection());
    // The notification manager is registered as a lazy singleton, so `resolveIfCreated` would report it absent until
    // something else happened to resolve it first and every notice would be dropped. Ask whether the plugin registered
    // the token, and resolve it on demand: the singleton is built once and reused for every message after that.
    const notify = new TicketNotifier(roles, () =>
      this.app.container.has(notificationServiceToken)
        ? this.app.container.resolve(notificationServiceToken)
        : undefined,
    );

    runtime.register(ticketLifecycle, {
      // A guard runs inside the transition's transaction and receives its handle; an effect runs after the commit
      // and does not. Reading roles through the handle while a transaction is open is what keeps SQLite from
      // deadlocking on its single connection.
      services: (handle) => ({
        roles: new TicketRoleService(
          (handle as DatabaseConnection | undefined) ?? database.connection(),
        ),
        notify,
      }),
    });

    const service = new TicketService(database, runtime, roles, notify);
    this.runtime = runtime;
    this.service = service;
    this.app.container.instance(ticketLifecycleRuntimeToken, runtime);
    this.app.container.instance(ticketServiceToken, service);
  }

  async start(): Promise<void> {
    const runtime = this.runtime;
    if (!runtime) {
      throw new Error('The ticket runtime was not built before start.');
    }
    // Effect dispatch reads the lifecycle log tables. An application whose migrations have not run yet has no such
    // collections, and starting the dispatcher would fail the whole boot over a schema that is about to be created.
    const database = this.app.container.resolve(databaseManagerToken);
    const effectRuns = await database
      .connection()
      .collections.get('lifecycleEffectRuns');
    if (!effectRuns) {
      this.logger().warn(
        'The ticket lifecycle log tables are not installed yet; effect dispatch and the overdue sweep start once the database has been migrated.',
      );
      return;
    }
    const executors = this.app.container.resolve(jobExecutorServiceToken);
    const jobs = createLifecycleJobs({
      jobs: executors.getJobExecutor('tickets'),
      schedule: executors.getScheduleExecutor('tickets'),
      jobName: 'tickets/lifecycle-effect',
      onSweep: async () => {
        await this.service?.remindOverdue();
        await runtime.prune({
          olderThan: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        });
      },
      logger: this.logger(),
    });
    this.jobs = jobs;
    await jobs.start(runtime);
  }

  async shutdown(): Promise<void> {
    await this.jobs?.shutdown();
  }
}
