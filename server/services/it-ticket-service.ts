import type { AuthorizationContext } from '@nocobase/authorization/core';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { UserAdministrationService } from '@nocobase/app-plugin-authentication/server';
import type { UserManagementService } from '@nocobase/app-plugin-users/server';
import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';
import {
  type FilterBuilder,
  type FilterNode,
} from '@nocobase/repository-input';

import {
  OVERDUE_AFTER_MS,
  canTransition,
  ticketNumber,
  type ItTicketStatus,
} from '../it-ticket-domain.js';
import { seedItTicketSampleData } from '../sample-data/it-tickets.js';
import { screenshotContentProblem } from './it-ticket-image.js';
import type { ItTicketNotifier } from './it-ticket-notifier.js';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export interface ItTicketRecord {
  id: number;
  title: string;
  description: string;
  urgency: string;
  status: string;
  requesterId: string;
  assigneeId: string | null;
  resolution: string | null;
  statusChangedAt: Date | string;
  assignedAt: Date | string | null;
  resolvedAt: Date | string | null;
  closedAt: Date | string | null;
  returnedAt: Date | string | null;
  overdueNotifiedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ItTicketActivityRecord {
  id: number;
  ticketId: number;
  authorId: string;
  type: string;
  content: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: Date | string;
}

export interface ItTicketFileRecord {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number | string;
  ticketId: number | null;
  uploadedById: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** The slice of Drive the service needs to inspect stored screenshot bytes. */
export interface ItTicketScreenshotDrive {
  use(disk: string): {
    getBytes(key: string): Promise<Uint8Array>;
  };
}

export type TicketAction =
  | 'view'
  | 'create'
  | 'assign'
  | 'progress'
  | 'resolve'
  | 'close'
  | 'return'
  | 'comment'
  | 'dashboard'
  | 'manage';

export interface TicketListQuery {
  q?: string;
  status?: string;
  urgency?: string;
  assigneeId?: string;
  sort?: 'createdAt' | 'updatedAt' | 'number' | 'title';
  order?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

type TicketPolicy = RepositoryPolicy<ItTicketRecord>;

export class ItTicketError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = 'ItTicketError';
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function principalId(context: AuthorizationContext): string {
  return context.identity.principal.id;
}

export class ItTicketService {
  constructor(
    private readonly options: {
      readonly database: DatabaseManager;
      readonly authz: AppAuthorization;
      readonly users: UserAdministrationService;
      readonly userManagement: UserManagementService;
      readonly notifier: ItTicketNotifier;
      readonly publicBasePath: string;
      readonly drive?: ItTicketScreenshotDrive;
    },
  ) {}

  private get database() {
    return this.options.database;
  }

  private get repository() {
    return this.options.database.repository<ItTicketRecord>('itTickets');
  }

  private async policy(
    context: AuthorizationContext,
    action: TicketAction,
  ): Promise<TicketPolicy> {
    const decision = await context.authorize({
      resource: { type: 'composite', id: 'it.tickets' },
      action,
    });
    if (decision.effect === 'deny') {
      throw new ItTicketError(
        'FORBIDDEN',
        403,
        'You may not perform this action',
      );
    }
    const database = (
      decision.conditions as { database?: Record<string, TicketPolicy> }
    ).database;
    const policy = database?.itTickets;
    if (!policy) {
      throw new ItTicketError(
        'FORBIDDEN',
        403,
        'You may not perform this action',
      );
    }
    return policy;
  }

  private async optionalPolicy(
    context: AuthorizationContext,
    action: TicketAction,
  ): Promise<TicketPolicy | null> {
    try {
      return await this.policy(context, action);
    } catch (error) {
      if (error instanceof ItTicketError) return null;
      throw error;
    }
  }

  private async canAct(
    context: AuthorizationContext,
    action: TicketAction,
    ticketId: number,
  ): Promise<boolean> {
    const policy = await this.optionalPolicy(context, action);
    if (!policy) return false;
    const row = await this.repository.withPolicy(policy).findOne({
      filter: (f) => f.number('id').eq(ticketId),
    });
    return Boolean(row);
  }

  async list(context: AuthorizationContext, query: TicketListQuery) {
    const policy = await this.policy(context, 'view');
    const repo = this.repository.withPolicy(policy);
    const filter = (f: FilterBuilder) => {
      const items: FilterNode[] = [];
      if (query.q) {
        const q = query.q.trim();
        if (q) {
          items.push(
            f.or([
              f.string('title').includes(q, { mode: 'insensitive' }),
              f.text('description').includes(q, { mode: 'insensitive' }),
            ]),
          );
        }
      }
      if (query.status === 'open') {
        items.push(
          f.or([
            f.string('status').eq('pending'),
            f.string('status').eq('in_progress'),
          ]),
        );
      } else if (query.status) {
        items.push(f.string('status').eq(query.status));
      }
      if (query.urgency) items.push(f.string('urgency').eq(query.urgency));
      if (query.assigneeId) {
        items.push(f.string('assigneeId').eq(query.assigneeId));
      }
      return items.length === 1
        ? items[0]
        : f.and(items.length ? items : [f.number('id').gte(1)]);
    };

    const page = Math.max(1, query.page);
    const pageSize = Math.min(100, Math.max(1, query.pageSize));
    const [rows, total] = await Promise.all([
      repo.findMany({
        filter,
        sort: (s) => {
          const direction = query.order === 'asc' ? 'asc' : 'desc';
          // `number` is derived from the id, so ordering by it orders by the
          // column it is derived from rather than by a field that does not exist.
          const field =
            query.sort === 'number' ? 'id' : (query.sort ?? 'createdAt');
          const primary =
            direction === 'asc' ? s.field(field).asc() : s.field(field).desc();
          // `number` already sorts by id; repeating the id tie-breaker would make
          // the Repository reject the query as an invalid repeated sort target.
          return field === 'id' ? [primary] : [primary, s.field('id').desc()];
        },
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      repo.count({ filter }),
    ]);

    const users = await this.userMap(
      rows
        .flatMap((row) => [row.requesterId, row.assigneeId])
        .filter(Boolean) as string[],
    );
    return {
      items: rows.map((row) => this.serialize(row as ItTicketRecord, users)),
      total,
      page,
      pageSize,
    };
  }

  async detail(context: AuthorizationContext, ticketId: number) {
    const policy = await this.policy(context, 'view');
    const ticket = (await this.repository.withPolicy(policy).findOne({
      filter: (f) => f.number('id').eq(ticketId),
    })) as ItTicketRecord | null;
    if (!ticket) {
      throw new ItTicketError('TICKET_NOT_FOUND', 404, 'Ticket not found');
    }

    const [activities, files] = await Promise.all([
      this.database
        .repository<ItTicketActivityRecord>('itTicketActivities')
        .findMany({
          filter: (f) => f.number('ticketId').eq(ticketId),
          sort: (s) => [s.field('createdAt').asc(), s.field('id').asc()],
        }),
      this.database.repository<ItTicketFileRecord>('itTicketFiles').findMany({
        filter: (f) => f.number('ticketId').eq(ticketId),
        sort: (s) => [s.field('createdAt').asc()],
      }),
    ]);

    const [
      canAssign,
      canProgress,
      canResolve,
      canClose,
      canReturn,
      canComment,
    ] = await Promise.all([
      this.canAct(context, 'assign', ticketId),
      this.canAct(context, 'progress', ticketId),
      this.canAct(context, 'resolve', ticketId),
      this.canAct(context, 'close', ticketId),
      this.canAct(context, 'return', ticketId),
      this.canAct(context, 'comment', ticketId),
    ]);

    const users = await this.userMap(
      [
        ticket.requesterId,
        ticket.assigneeId,
        ...activities.map((activity) => activity.authorId),
      ].filter(Boolean) as string[],
    );

    return {
      ...this.serialize(ticket, users),
      resolution: ticket.resolution,
      activities: activities.map((activity) => ({
        id: activity.id,
        type: activity.type,
        // `assigned` stores the assignee's id, which the timeline shows by name.
        content:
          activity.type === 'assigned' && activity.content
            ? (users.get(activity.content)?.name ?? activity.content)
            : activity.content,
        fromStatus: activity.fromStatus,
        toStatus: activity.toStatus,
        authorId: activity.authorId,
        authorName: users.get(activity.authorId)?.name ?? activity.authorId,
        createdAt: toIso(activity.createdAt),
      })),
      attachments: files.map((file) => ({
        id: file.id,
        filename: file.filename,
        ext: file.ext,
        mimeType: file.mimeType,
        size: Number(file.size),
        contentUrl: this.contentUrl(file),
        createdAt: toIso(file.createdAt),
      })),
      permissions: {
        canAssign: canAssign && canTransition('assign', ticket.status),
        canProgress: canProgress && canTransition('progress', ticket.status),
        canResolve: canResolve && canTransition('resolve', ticket.status),
        canClose: canClose && canTransition('close', ticket.status),
        canReturn: canReturn && canTransition('return', ticket.status),
        canComment,
      },
    };
  }

  async create(
    context: AuthorizationContext,
    input: {
      title: string;
      description: string;
      urgency: string;
      fileIds: readonly string[];
    },
  ) {
    const policy = await this.policy(context, 'create');
    const requesterId = principalId(context);
    const now = new Date();

    const ticket = await this.database.transaction(async (connection) => {
      const created = await connection
        .repository<ItTicketRecord>('itTickets')
        .withPolicy(policy)
        .createOne({
          values: {
            title: input.title.trim(),
            description: input.description.trim(),
            urgency: input.urgency,
            status: 'pending',
            requesterId,
            statusChangedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });

      if (input.fileIds.length) {
        const files =
          connection.repository<ItTicketFileRecord>('itTicketFiles');
        for (const fileId of [...new Set(input.fileIds)]) {
          const file = (await files.findOne({
            filter: (f) => f.string('id').eq(fileId),
          })) as ItTicketFileRecord | null;
          if (
            !file ||
            file.uploadedById !== requesterId ||
            file.ticketId !== null
          ) {
            throw new ItTicketError(
              'ATTACHMENT_INVALID',
              400,
              'A screenshot is missing or was uploaded by someone else',
            );
          }
          if (Number(file.size) > MAX_SCREENSHOT_BYTES) {
            throw new ItTicketError(
              'ATTACHMENT_INVALID',
              400,
              'A screenshot is larger than 5 MB',
            );
          }
          if (!file.mimeType.startsWith('image/')) {
            throw new ItTicketError(
              'ATTACHMENT_INVALID',
              400,
              'A screenshot must be an image',
            );
          }
          if (this.options.drive) {
            const problem = await this.screenshotProblem(
              this.options.drive,
              file,
            );
            if (problem) {
              throw new ItTicketError('ATTACHMENT_INVALID', 400, problem);
            }
          }
          await files.updateOne({
            filter: (f) => f.string('id').eq(fileId),
            values: { ticketId: created.record.id, updatedAt: now },
          });
        }
      }

      await connection
        .repository<ItTicketActivityRecord>('itTicketActivities')
        .createOne({
          values: {
            ticketId: created.record.id,
            authorId: requesterId,
            type: 'created',
            content: null,
            fromStatus: null,
            toStatus: 'pending',
            createdAt: now,
          },
        });

      return created.record as ItTicketRecord;
    });

    const serviceDeskIds = await this.userIdsFor('it-service-desk', true);
    await this.options.notifier.created(
      { id: ticket.id, title: ticket.title },
      serviceDeskIds,
    );

    return this.detail(context, ticket.id);
  }

  async assign(
    context: AuthorizationContext,
    ticketId: number,
    assigneeId: string,
  ) {
    await this.assertAssignable(assigneeId);
    const policy = await this.policy(context, 'assign');
    const actor = principalId(context);
    const now = new Date();

    const result = await this.database.transaction(async (connection) => {
      const repo = connection
        .repository<ItTicketRecord>('itTickets')
        .withPolicy(policy);
      const ticket = (await repo.findOne({
        filter: (f) => f.number('id').eq(ticketId),
      })) as ItTicketRecord | null;
      if (!ticket) {
        throw new ItTicketError('TICKET_NOT_FOUND', 404, 'Ticket not found');
      }
      if (!canTransition('assign', ticket.status)) {
        throw new ItTicketError(
          'INVALID_STATE',
          409,
          'This ticket can no longer be assigned',
        );
      }

      const next = await repo.updateOne({
        filter: (f) => f.number('id').eq(ticketId),
        values: {
          assigneeId,
          status: 'in_progress',
          assignedAt: now,
          statusChangedAt: now,
          updatedAt: now,
        },
      });

      await connection
        .repository<ItTicketActivityRecord>('itTicketActivities')
        .createOne({
          values: {
            ticketId,
            authorId: actor,
            type: 'assigned',
            content: assigneeId,
            fromStatus: ticket.status,
            toStatus: 'in_progress',
            createdAt: now,
          },
        });

      // Assigning someone is what makes them an engineer: they receive the
      // permission in the same transaction, so the notification cannot send
      // them to a ticket they are unable to process.
      const authz =
        this.options.authz.permissionSets.withTransaction(connection);
      const existing = await authz.listAssignments('it-engineer');
      const granted = !existing.some(
        (assignment) =>
          assignment.subject.type === 'user' &&
          assignment.subject.id === assigneeId,
      );
      if (granted) {
        await authz.assign({
          subject: { type: 'user', id: assigneeId },
          permissionSet: 'it-engineer',
        });
      }
      return { ticket: next.record as ItTicketRecord, granted };
    });

    if (result.granted) {
      await this.options.authz.permissionSets.notifyAssignmentsChanged({
        type: 'user',
        id: assigneeId,
      });
    }
    await this.options.notifier.assigned(
      { id: result.ticket.id, title: result.ticket.title },
      assigneeId,
    );
    return this.detail(context, ticketId);
  }

  async progress(
    context: AuthorizationContext,
    ticketId: number,
    content: string,
  ) {
    const policy = await this.policy(context, 'progress');
    const actor = principalId(context);
    const now = new Date();

    const ticket = await this.changeState({
      policy,
      ticketId,
      operation: 'progress',
      values: { updatedAt: now },
      activity: {
        authorId: actor,
        type: 'progress',
        content: content.trim(),
        toStatus: 'in_progress',
      },
      now,
    });

    await this.options.notifier.progress(
      { id: ticket.id, title: ticket.title },
      ticket.requesterId,
    );
    return this.detail(context, ticketId);
  }

  async resolve(
    context: AuthorizationContext,
    ticketId: number,
    resolution: string,
  ) {
    const policy = await this.policy(context, 'resolve');
    const actor = principalId(context);
    const now = new Date();

    const ticket = await this.changeState({
      policy,
      ticketId,
      operation: 'resolve',
      values: {
        status: 'resolved',
        resolution: resolution.trim(),
        resolvedAt: now,
        statusChangedAt: now,
        updatedAt: now,
      },
      activity: {
        authorId: actor,
        type: 'resolved',
        content: resolution.trim(),
        toStatus: 'resolved',
      },
      now,
    });

    await this.options.notifier.resolved(
      { id: ticket.id, title: ticket.title },
      ticket.requesterId,
    );
    return this.detail(context, ticketId);
  }

  async close(context: AuthorizationContext, ticketId: number) {
    const policy = await this.policy(context, 'close');
    const actor = principalId(context);
    const now = new Date();

    const ticket = await this.changeState({
      policy,
      ticketId,
      operation: 'close',
      values: {
        status: 'closed',
        closedAt: now,
        statusChangedAt: now,
        updatedAt: now,
      },
      activity: {
        authorId: actor,
        type: 'closed',
        content: null,
        toStatus: 'closed',
      },
      now,
    });

    await this.options.notifier.closed(
      { id: ticket.id, title: ticket.title },
      ticket.assigneeId,
    );
    return this.detail(context, ticketId);
  }

  async returnTicket(
    context: AuthorizationContext,
    ticketId: number,
    reason: string,
  ) {
    const policy = await this.policy(context, 'return');
    const actor = principalId(context);
    const now = new Date();

    const ticket = await this.changeState({
      policy,
      ticketId,
      operation: 'return',
      values: {
        status: 'in_progress',
        returnedAt: now,
        statusChangedAt: now,
        updatedAt: now,
      },
      activity: {
        authorId: actor,
        type: 'returned',
        content: reason.trim(),
        toStatus: 'in_progress',
      },
      now,
    });

    await this.options.notifier.returned(
      { id: ticket.id, title: ticket.title },
      ticket.assigneeId ?? '',
    );
    return this.detail(context, ticketId);
  }

  async comment(
    context: AuthorizationContext,
    ticketId: number,
    content: string,
  ) {
    const policy = await this.policy(context, 'comment');
    const ticket = (await this.repository.withPolicy(policy).findOne({
      filter: (f) => f.number('id').eq(ticketId),
    })) as ItTicketRecord | null;
    if (!ticket) {
      throw new ItTicketError('TICKET_NOT_FOUND', 404, 'Ticket not found');
    }

    const now = new Date();
    await this.database
      .repository<ItTicketActivityRecord>('itTicketActivities')
      .createOne({
        values: {
          ticketId,
          authorId: principalId(context),
          type: 'comment',
          content: content.trim(),
          fromStatus: ticket.status,
          toStatus: ticket.status,
          createdAt: now,
        },
      });
    return this.detail(context, ticketId);
  }

  async engineers(context: AuthorizationContext) {
    await this.policy(context, 'assign');
    // The assignable roster is the people who already carry the engineer or
    // service desk responsibility, plus root administrators (who act as the
    // service desk without a stored assignment). Ordinary employees are
    // requesters, not engineers, even though they may use the same application.
    const groups = await Promise.all([
      this.userIdsFor('it-engineer'),
      this.userIdsFor('it-service-desk', true),
    ]);
    const ids = [...new Set(groups.flat())];
    if (!ids.length) return [];
    return this.activePeopleByIds(ids);
  }

  async dashboard(context: AuthorizationContext) {
    const policy = await this.policy(context, 'dashboard');
    const repo = this.repository.withPolicy(policy);
    const me = principalId(context);
    const now = new Date();
    const cutoff = new Date(now.getTime() - OVERDUE_AFTER_MS);

    const openFilter = (f: FilterBuilder) =>
      f.or([
        f.string('status').eq('pending'),
        f.string('status').eq('in_progress'),
      ]);
    const overdueFilter = (f: FilterBuilder) =>
      f.and([openFilter(f), f.date('createdAt').before(cutoff)]);

    const [
      pendingAssignment,
      inProgress,
      resolvedAwaiting,
      overdue,
      myOpen,
      recent,
    ] = await Promise.all([
      repo.count({ filter: (f) => f.string('status').eq('pending') }),
      repo.count({ filter: (f) => f.string('status').eq('in_progress') }),
      repo.count({ filter: (f) => f.string('status').eq('resolved') }),
      repo.count({ filter: overdueFilter }),
      repo.count({
        filter: (f) =>
          f.and([
            openFilter(f),
            f.or([
              f.string('requesterId').eq(me),
              f.string('assigneeId').eq(me),
            ]),
          ]),
      }),
      repo.findMany({
        sort: (s) => [s.field('createdAt').desc(), s.field('id').desc()],
        limit: 6,
      }),
    ]);

    const canAssign = Boolean(await this.optionalPolicy(context, 'assign'));
    const recentUsers = await this.userMap(
      recent
        .flatMap((row) => [row.requesterId, row.assigneeId])
        .filter(Boolean) as string[],
    );

    let workload: {
      id: string;
      name: string;
      email: string;
      open: number;
      overdue: number;
    }[] = [];
    if (canAssign) {
      const engineerIds = await this.userIdsFor('it-engineer');
      const users = await this.userMap(engineerIds);
      workload = await Promise.all(
        engineerIds.map(async (id) => {
          const [open, engineerOverdue] = await Promise.all([
            repo.count({
              filter: (f) =>
                f.and([openFilter(f), f.string('assigneeId').eq(id)]),
            }),
            repo.count({
              filter: (f) =>
                f.and([overdueFilter(f), f.string('assigneeId').eq(id)]),
            }),
          ]);
          const user = users.get(id);
          return {
            id,
            name: user?.name ?? id,
            email: user?.email ?? '',
            open,
            overdue: engineerOverdue,
          };
        }),
      );
      workload.sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
    }

    return {
      pendingAssignment,
      inProgress,
      resolvedAwaiting,
      overdue,
      myOpen,
      canAssign,
      overdueAfterHours: 24,
      workload,
      recent: recent.map((row) =>
        this.serialize(row as ItTicketRecord, recentUsers),
      ),
      generatedAt: now.toISOString(),
    };
  }

  /**
   * Loads the demonstration people and tickets on request. This is the only
   * way the demo data reaches an installation whose database was initialized
   * without sample mode; the seed remains idempotent, so a second request
   * changes nothing. The overdue reminder runs immediately so the demo ticket
   * older than 24 hours also demonstrates the notification path.
   */
  async loadSampleData(
    context: AuthorizationContext,
  ): Promise<{ loaded: true; overdueReminded: number }> {
    await this.policy(context, 'manage');
    await seedItTicketSampleData({
      database: this.database,
      authz: this.options.authz,
      userManagement: this.options.userManagement,
    });
    let overdueReminded = 0;
    try {
      overdueReminded = await this.remindOverdue();
    } catch {
      // The scheduled reminder retries; loading the demo data itself succeeded.
    }
    return { loaded: true, overdueReminded };
  }

  /** One reminder per ticket; a delivery failure restores the marker for retry. */
  async remindOverdue(): Promise<number> {
    const cutoff = new Date(Date.now() - OVERDUE_AFTER_MS);
    const repo = this.repository;
    const tickets = await repo.findMany({
      filter: (f) =>
        f.and([
          f.or([
            f.string('status').eq('pending'),
            f.string('status').eq('in_progress'),
          ]),
          f.date('createdAt').before(cutoff),
          f.date('overdueNotifiedAt').empty(),
        ]),
      sort: (s) => [s.field('createdAt').asc()],
      limit: 100,
    });
    if (!tickets.length) return 0;

    const serviceDeskIds = await this.userIdsFor('it-service-desk', true);
    if (!serviceDeskIds.length) return 0;

    let sent = 0;
    for (const ticket of tickets) {
      const now = new Date();
      const marker = await repo.updateOne({
        filter: (f) =>
          f.and([
            f.number('id').eq(ticket.id),
            f.date('overdueNotifiedAt').empty(),
          ]),
        values: { overdueNotifiedAt: now, updatedAt: now },
      });
      if (!marker.record) continue;

      const delivered = await this.options.notifier.overdue(
        { id: ticket.id, title: ticket.title },
        serviceDeskIds,
      );
      if (delivered) {
        sent += 1;
      } else {
        await repo.updateOne({
          filter: (f) => f.number('id').eq(ticket.id),
          values: { overdueNotifiedAt: null, updatedAt: new Date() },
        });
      }
    }
    return sent;
  }

  private async changeState(input: {
    policy: TicketPolicy;
    ticketId: number;
    operation: 'progress' | 'resolve' | 'close' | 'return';
    values: Partial<ItTicketRecord>;
    activity: {
      authorId: string;
      type: string;
      content: string | null;
      toStatus: ItTicketStatus;
    };
    now: Date;
  }): Promise<ItTicketRecord> {
    const { policy, ticketId, operation, values, activity, now } = input;
    return this.database.transaction(async (connection) => {
      const repo = connection
        .repository<ItTicketRecord>('itTickets')
        .withPolicy(policy);
      const ticket = (await repo.findOne({
        filter: (f) => f.number('id').eq(ticketId),
      })) as ItTicketRecord | null;
      if (!ticket) {
        throw new ItTicketError('TICKET_NOT_FOUND', 404, 'Ticket not found');
      }
      if (!canTransition(operation, ticket.status)) {
        throw new ItTicketError(
          'INVALID_STATE',
          409,
          'This ticket is not in a state that allows this action',
        );
      }

      const updated = await repo.updateOne({
        filter: (f) => f.number('id').eq(ticketId),
        values,
      });
      await connection
        .repository<ItTicketActivityRecord>('itTicketActivities')
        .createOne({
          values: {
            ticketId,
            authorId: activity.authorId,
            type: activity.type,
            content: activity.content,
            fromStatus: ticket.status,
            toStatus: activity.toStatus,
            createdAt: now,
          },
        });
      return updated.record as ItTicketRecord;
    });
  }

  private async assertAssignable(userId: string) {
    const result = await this.options.users.list({
      page: 1,
      pageSize: 1,
      status: 'enabled',
      kind: 'person',
      userIds: [userId],
    });
    if (!result.items.some((user) => user.id === userId)) {
      throw new ItTicketError(
        'ASSIGNEE_INVALID',
        400,
        'The selected user is not an active person',
      );
    }
  }

  private async activePeopleByIds(ids: readonly string[]) {
    const people: { id: string; name: string; email: string }[] = [];
    for (let page = 1; ; page += 1) {
      const result = await this.options.users.list({
        page,
        pageSize: Math.min(200, Math.max(1, ids.length)),
        status: 'enabled',
        kind: 'person',
        userIds: [...ids],
      });
      for (const user of result.items) {
        people.push({
          id: user.id,
          name: user.name || user.email,
          email: user.email,
        });
      }
      if (result.items.length === 0 || page * result.pageSize >= result.total) {
        break;
      }
    }
    return people.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Root administrators act as the service desk, even without a stored assignment. */
  private async userIdsFor(
    permissionSet: string,
    includeRoot = false,
  ): Promise<string[]> {
    const assignments =
      await this.options.authz.permissionSets.listAssignments(permissionSet);
    const ids = assignments
      .filter((assignment) => assignment.subject.type === 'user')
      .map((assignment) => assignment.subject.id);
    if (!includeRoot) return ids;
    const roots =
      await this.options.authz.permissionSets.listAssignments('root');
    return [
      ...new Set([
        ...ids,
        ...roots
          .filter((assignment) => assignment.subject.type === 'user')
          .map((assignment) => assignment.subject.id),
      ]),
    ];
  }

  private async userMap(ids: readonly string[]) {
    const unique = [...new Set(ids)].filter(Boolean);
    const map = new Map<string, { id: string; name: string; email: string }>();
    if (!unique.length) return map;
    const result = await this.options.users.list({
      page: 1,
      pageSize: Math.min(200, unique.length),
      userIds: unique,
    });
    for (const user of result.items) {
      map.set(user.id, {
        id: user.id,
        name: user.name || user.email,
        email: user.email,
      });
    }
    return map;
  }

  private serialize(
    ticket: ItTicketRecord,
    users: ReadonlyMap<string, { id: string; name: string; email: string }>,
  ) {
    const assignee = ticket.assigneeId
      ? users.get(ticket.assigneeId)
      : undefined;
    return {
      id: ticket.id,
      number: ticketNumber(ticket.id),
      title: ticket.title,
      description: ticket.description,
      urgency: ticket.urgency,
      status: ticket.status,
      requesterId: ticket.requesterId,
      requesterName: users.get(ticket.requesterId)?.name ?? ticket.requesterId,
      assigneeId: ticket.assigneeId,
      assigneeName: assignee?.name ?? null,
      statusChangedAt: toIso(ticket.statusChangedAt),
      assignedAt: toIso(ticket.assignedAt),
      resolvedAt: toIso(ticket.resolvedAt),
      closedAt: toIso(ticket.closedAt),
      returnedAt: toIso(ticket.returnedAt),
      createdAt: toIso(ticket.createdAt),
      updatedAt: toIso(ticket.updatedAt),
    };
  }

  private async screenshotProblem(
    drive: ItTicketScreenshotDrive,
    file: Pick<ItTicketFileRecord, 'disk' | 'key' | 'ext' | 'mimeType'>,
  ): Promise<string | null> {
    let bytes: Uint8Array;
    try {
      bytes = await drive.use(file.disk).getBytes(file.key);
    } catch {
      throw new ItTicketError(
        'ATTACHMENT_INVALID',
        400,
        'A screenshot could not be read',
      );
    }
    return screenshotContentProblem({
      bytes,
      ext: file.ext,
      mimeType: file.mimeType,
    });
  }

  private contentUrl(file: Pick<ItTicketFileRecord, 'id' | 'ext'>) {
    const base = this.options.publicBasePath.replace(/\/$/, '');
    return `${base}/uploads/it-tickets/${encodeURIComponent(file.id)}${file.ext ? `.${encodeURIComponent(file.ext)}` : ''}`;
  }
}
