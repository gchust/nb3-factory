import type { Readable } from 'node:stream';
import type { Logger } from '@nocobase/logging';
import type {
  DatabaseConnection,
  DatabaseManager,
  Repository,
  RepositoryPolicy,
} from '@nocobase/db';
import type {
  AuthorizationContext,
  AuthorizationDecision,
} from '@nocobase/authorization/core';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { ApiError } from '@nocobase/app-server/router';
import type { ServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import type { NotificationService } from '@nocobase/app-plugin-notification/server';
import type { UserAdministrationService } from '@nocobase/app-plugin-authentication/server';
import type { UserManagementService } from '@nocobase/app-plugin-users/server';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type {
  FilterBuilder,
  FilterNode,
  RepositoryFilter,
} from '@nocobase/repository-input';
import {
  type CommentRow,
  type TicketAttachmentSnapshot,
  type TicketPriority,
  type TicketRow,
  type TicketStatus,
  SERVICE_DESK_TICKET_RESOURCE,
} from './resources.js';

const DOMAIN = 'service-desk';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;
const SLA_HOURS: Record<TicketPriority, number> = {
  urgent: 2,
  high: 8,
  normal: 24,
  low: 72,
};
const ALLOWED_FILE_TYPES = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['pdf', 'application/pdf'],
]);
const ACTION_STATUSES: Record<string, readonly TicketStatus[]> = {
  assign: ['open', 'assigned'],
  comment: ['open', 'assigned', 'resolved'],
  resolve: ['open', 'assigned'],
  confirm: ['resolved'],
  reopen: ['resolved', 'closed'],
};
const CANDIDATE_ACTIONS = [
  'assign',
  'comment',
  'resolve',
  'confirm',
  'reopen',
] as const;

interface ServiceDeskFileRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number | string;
  uploadedById: string | null;
  ticketId: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TicketSummary {
  id: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  requesterId: string;
  requesterName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  slaDueAt: string;
  assignedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  reopenedAt: string | null;
  resolution: string | null;
  attachments: readonly TicketAttachmentSnapshot[];
  commentCount: number;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketActivity {
  id: number;
  authorId: string;
  authorName: string | null;
  kind: CommentRow['kind'];
  body: string;
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  activities: readonly TicketActivity[];
  availableActions: readonly string[];
}

export interface TicketListInput {
  page: number;
  pageSize: number;
  status?: TicketStatus;
  priority?: TicketPriority;
  q?: string;
}

export interface TicketListResult {
  items: readonly TicketSummary[];
  total: number;
  canCreate: boolean;
}

export interface CreateTicketInput {
  title: string;
  description: string;
  priority: TicketPriority;
  attachmentIds: readonly string[];
}

export interface EngineerWorkload {
  id: string;
  name: string;
  email: string;
  active: number;
  overdue: number;
}

export interface DashboardResult {
  canCreate: boolean;
  canAssign: boolean;
  total: number;
  open: number;
  assigned: number;
  unassigned: number;
  resolved: number;
  closed: number;
  overdue: number;
  resolutionRate: number;
  byPriority: Record<TicketPriority, number>;
  workload: readonly EngineerWorkload[];
  recent: readonly TicketSummary[];
}

export interface Assignee {
  id: string;
  name: string;
  email: string;
}

export interface UploadedAttachment {
  id: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface DownloadedFile {
  stream: Readable;
  filename: string;
  mimeType: string;
  size: number;
  inline: boolean;
}

interface ServiceDeskServiceDependencies {
  database: DatabaseManager;
  files: ServerFileRepositoryManager;
  drive: NocoBaseDriveManager;
  notifications: NotificationService;
  userAdministration: UserAdministrationService;
  userManagement: UserManagementService;
  logger: Logger;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function toError(error: unknown): unknown {
  return error instanceof Error ? error : new Error(String(error));
}

export class ServiceDeskService {
  constructor(private readonly dependencies: ServiceDeskServiceDependencies) {}

  async listTickets(
    authz: AuthorizationContext,
    input: TicketListInput,
  ): Promise<TicketListResult> {
    const decision = await this.authorized(authz, 'view');
    const policy = this.ticketPolicy(decision);
    const repository = this.tickets(policy);
    const filter = this.ticketListFilter(input);
    const count = await repository.count({ filter });
    const rows = await repository.findMany({
      filter,
      sort: (sort) => sort.field('updatedAt').desc(),
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    });
    const names = await this.namesFor(
      rows.flatMap((row) => [row.requesterId, row.assigneeId]),
    );
    const createDecision = await authz.authorize({
      resource: { type: 'composite', id: SERVICE_DESK_TICKET_RESOURCE },
      action: 'create',
    });
    return {
      items: rows.map((row) => this.toSummary(row, names)),
      total: count,
      canCreate: createDecision.effect !== 'deny',
    };
  }

  async getTicket(
    authz: AuthorizationContext,
    ticketId: number,
  ): Promise<TicketDetail> {
    const decision = await this.authorized(authz, 'view');
    const ticketPolicy = this.ticketPolicy(decision);
    const commentPolicy = this.policy(decision, 'serviceDeskComments');
    const ticket = await this.tickets(ticketPolicy).findOne({
      filter: { id: ticketId },
    });
    if (!ticket) throw this.ticketNotFound(ticketId);

    const comments = await this.comments(commentPolicy).findMany({
      filter: { ticketId },
      sort: (sort) => sort.field('createdAt').asc(),
    });
    const names = await this.namesFor([
      ticket.requesterId,
      ticket.assigneeId,
      ...comments.map((comment) => comment.authorId),
    ]);
    const availableActions = await this.availableActions(authz, ticket);
    return {
      ...this.toSummary(ticket, names),
      activities: comments.map((comment) => ({
        id: comment.id,
        authorId: comment.authorId,
        authorName: names.get(comment.authorId) ?? null,
        kind: comment.kind,
        body: comment.body,
        createdAt: iso(comment.createdAt) as string,
      })),
      availableActions,
    };
  }

  async createTicket(
    authz: AuthorizationContext,
    actorId: string,
    input: CreateTicketInput,
  ): Promise<TicketDetail> {
    const decision = await this.authorized(authz, 'create');
    const ticketPolicy = this.ticketPolicy(decision);
    const commentPolicy = this.policy(decision, 'serviceDeskComments');
    const attachmentIds = [...new Set(input.attachmentIds)];
    if (attachmentIds.length > MAX_ATTACHMENTS) {
      throw this.invalidArgument(
        'TOO_MANY_ATTACHMENTS',
        `A ticket may have at most ${MAX_ATTACHMENTS} attachments.`,
        'attachmentIds',
      );
    }

    const now = new Date();
    const slaDueAt = new Date(
      now.getTime() + SLA_HOURS[input.priority] * 60 * 60 * 1000,
    );
    let ticketId = 0;

    await this.dependencies.database.transaction(async (transaction) => {
      const attachments = await this.claimAttachments(
        transaction,
        actorId,
        attachmentIds,
      );
      const created = await this.txTickets(transaction, ticketPolicy).createOne(
        {
          values: {
            title: input.title,
            description: input.description,
            status: 'open',
            priority: input.priority,
            requesterId: actorId,
            slaDueAt,
            commentCount: 0,
            attachments,
            createdAt: now,
            updatedAt: now,
          },
        },
      );
      ticketId = created.record.id;
      if (attachmentIds.length > 0) {
        await transaction
          .repository<ServiceDeskFileRow>('serviceDeskFiles')
          .updateMany({
            filter: (filter) =>
              filter.and(attachmentIds.map((id) => filter.string('id').eq(id))),
            values: { ticketId },
          });
      }
      await this.insertActivity(
        transaction,
        commentPolicy,
        ticketId,
        actorId,
        'created',
        '',
        now,
      );
    });

    const managers = await this.userIdsWithPermissionSet(
      'service-desk-manager',
    );
    await this.notify(
      `service-desk:${ticketId}:created`,
      managers.filter((id) => id !== actorId),
      `New service desk ticket #${ticketId}`,
      input.title,
      ticketId,
    );
    return this.getTicket(authz, ticketId);
  }

  async assignTicket(
    authz: AuthorizationContext,
    actorId: string,
    ticketId: number,
    assigneeId: string,
  ): Promise<TicketDetail> {
    const decision = await this.authorized(authz, 'assign');
    const ticketPolicy = this.ticketPolicy(decision);
    const commentPolicy = this.policy(decision, 'serviceDeskComments');
    const engineers = await this.userIdsWithPermissionSet(
      'service-desk-engineer',
    );
    if (!engineers.includes(assigneeId)) {
      throw this.invalidArgument(
        'INVALID_ASSIGNEE',
        'The selected user is not an enabled service desk engineer.',
        'assigneeId',
      );
    }

    const now = new Date();
    let changed = false;
    await this.dependencies.database.transaction(async (transaction) => {
      const ticket = await this.txTickets(transaction, ticketPolicy).findOne({
        filter: { id: ticketId },
      });
      if (!ticket) throw this.ticketNotFound(ticketId);
      if (!ACTION_STATUSES.assign.includes(ticket.status)) {
        throw this.notAssignable(ticket.status, 'assign');
      }
      if (ticket.status === 'assigned' && ticket.assigneeId === assigneeId)
        return;

      await this.txTickets(transaction, ticketPolicy).updateOne({
        filter: (filter) =>
          filter.and([
            filter.number('id').eq(ticketId),
            filter.string('status').eq(ticket.status),
          ]),
        values: {
          assigneeId,
          status: 'assigned',
          assignedAt: now,
          overdueNotifiedAt: null,
          updatedAt: now,
        },
      });
      await this.insertActivity(
        transaction,
        commentPolicy,
        ticketId,
        actorId,
        'assigned',
        '',
        now,
      );
      changed = true;
    });

    if (changed) {
      await this.notify(
        `service-desk:${ticketId}:assigned:${assigneeId}:${now.toISOString()}`,
        [assigneeId],
        `Ticket #${ticketId} assigned to you`,
        'Open the ticket to review the request and start working on it.',
        ticketId,
      );
    }
    return this.getTicket(authz, ticketId);
  }

  async addComment(
    authz: AuthorizationContext,
    actorId: string,
    ticketId: number,
    body: string,
  ): Promise<TicketDetail> {
    const decision = await this.authorized(authz, 'comment');
    const ticketPolicy = this.ticketPolicy(decision);
    const commentPolicy = this.policy(decision, 'serviceDeskComments');
    const now = new Date();
    let commentId = 0;
    let commentTicket: TicketRow | undefined;

    await this.dependencies.database.transaction(async (transaction) => {
      const ticket = await this.txTickets(transaction, ticketPolicy).findOne({
        filter: { id: ticketId },
      });
      if (!ticket) throw this.ticketNotFound(ticketId);
      if (!ACTION_STATUSES.comment.includes(ticket.status)) {
        throw this.notAvailable(ticket.status, 'comment');
      }
      commentTicket = ticket;
      const comment = await this.insertActivity(
        transaction,
        commentPolicy,
        ticketId,
        actorId,
        'comment',
        body,
        now,
      );
      commentId = comment.id;
      await this.txTickets(transaction, ticketPolicy).updateOne({
        filter: (filter) =>
          filter.and([
            filter.number('id').eq(ticketId),
            filter.string('status').eq(ticket.status),
          ]),
        values: { commentCount: { increment: 1 }, updatedAt: now },
      });
    });

    if (commentTicket && commentId) {
      await this.notifyComment(
        commentTicket,
        actorId,
        ticketId,
        commentId,
        body,
      );
    }
    return this.getTicket(authz, ticketId);
  }

  async resolveTicket(
    authz: AuthorizationContext,
    actorId: string,
    ticketId: number,
    resolution: string,
  ): Promise<TicketDetail> {
    const decision = await this.authorized(authz, 'resolve');
    const ticketPolicy = this.ticketPolicy(decision);
    const commentPolicy = this.policy(decision, 'serviceDeskComments');
    const now = new Date();
    let requesterId = '';

    await this.dependencies.database.transaction(async (transaction) => {
      const ticket = await this.txTickets(transaction, ticketPolicy).findOne({
        filter: { id: ticketId },
      });
      if (!ticket) throw this.ticketNotFound(ticketId);
      if (!ACTION_STATUSES.resolve.includes(ticket.status)) {
        throw this.notAvailable(ticket.status, 'resolve');
      }
      requesterId = ticket.requesterId;
      await this.txTickets(transaction, ticketPolicy).updateOne({
        filter: (filter) =>
          filter.and([
            filter.number('id').eq(ticketId),
            filter.string('status').eq(ticket.status),
          ]),
        values: {
          status: 'resolved',
          resolution,
          resolvedAt: now,
          updatedAt: now,
        },
      });
      await this.insertActivity(
        transaction,
        commentPolicy,
        ticketId,
        actorId,
        'resolved',
        resolution,
        now,
      );
    });

    await this.notify(
      `service-desk:${ticketId}:resolved:${now.toISOString()}`,
      [requesterId],
      `Ticket #${ticketId} resolved`,
      'Please confirm the resolution or reopen the ticket if the issue is not solved.',
      ticketId,
    );
    return this.getTicket(authz, ticketId);
  }

  async confirmTicket(
    authz: AuthorizationContext,
    actorId: string,
    ticketId: number,
  ): Promise<TicketDetail> {
    const decision = await this.authorized(authz, 'confirm');
    const ticketPolicy = this.ticketPolicy(decision);
    const commentPolicy = this.policy(decision, 'serviceDeskComments');
    const now = new Date();
    let assigneeId: string | null = null;

    await this.dependencies.database.transaction(async (transaction) => {
      const ticket = await this.txTickets(transaction, ticketPolicy).findOne({
        filter: { id: ticketId },
      });
      if (!ticket) throw this.ticketNotFound(ticketId);
      if (!ACTION_STATUSES.confirm.includes(ticket.status)) {
        throw this.notAvailable(ticket.status, 'confirm');
      }
      assigneeId = ticket.assigneeId;
      await this.txTickets(transaction, ticketPolicy).updateOne({
        filter: (filter) =>
          filter.and([
            filter.number('id').eq(ticketId),
            filter.string('status').eq(ticket.status),
          ]),
        values: { status: 'closed', closedAt: now, updatedAt: now },
      });
      await this.insertActivity(
        transaction,
        commentPolicy,
        ticketId,
        actorId,
        'confirmed',
        '',
        now,
      );
    });

    await this.notify(
      `service-desk:${ticketId}:confirmed:${now.toISOString()}`,
      assigneeId ? [assigneeId] : [],
      `Ticket #${ticketId} confirmed and closed`,
      'The requester confirmed that the issue is resolved.',
      ticketId,
    );
    return this.getTicket(authz, ticketId);
  }

  async reopenTicket(
    authz: AuthorizationContext,
    actorId: string,
    ticketId: number,
    reason: string,
  ): Promise<TicketDetail> {
    const decision = await this.authorized(authz, 'reopen');
    const ticketPolicy = this.ticketPolicy(decision);
    const commentPolicy = this.policy(decision, 'serviceDeskComments');
    const now = new Date();
    let assigneeId: string | null = null;

    await this.dependencies.database.transaction(async (transaction) => {
      const ticket = await this.txTickets(transaction, ticketPolicy).findOne({
        filter: { id: ticketId },
      });
      if (!ticket) throw this.ticketNotFound(ticketId);
      if (!ACTION_STATUSES.reopen.includes(ticket.status)) {
        throw this.notAvailable(ticket.status, 'reopen');
      }
      assigneeId = ticket.assigneeId;
      await this.txTickets(transaction, ticketPolicy).updateOne({
        filter: (filter) =>
          filter.and([
            filter.number('id').eq(ticketId),
            filter.string('status').eq(ticket.status),
          ]),
        values: {
          status: ticket.assigneeId ? 'assigned' : 'open',
          resolution: null,
          resolvedAt: null,
          closedAt: null,
          reopenedAt: now,
          overdueNotifiedAt: null,
          updatedAt: now,
        },
      });
      await this.insertActivity(
        transaction,
        commentPolicy,
        ticketId,
        actorId,
        'reopened',
        reason,
        now,
      );
    });

    // Looked up after the transaction: a reader takes another connection, and
    // the transaction already holds the only one a single-connection database
    // (SQLite) allows, so asking inside it waits for a lock that never frees.
    const managers = await this.userIdsWithPermissionSet(
      'service-desk-manager',
    );
    const recipients = [
      ...new Set([assigneeId, ...managers].filter(Boolean) as string[]),
    ].filter((id) => id !== actorId);
    await this.notify(
      `service-desk:${ticketId}:reopened:${now.toISOString()}`,
      recipients,
      `Ticket #${ticketId} reopened`,
      reason,
      ticketId,
    );
    return this.getTicket(authz, ticketId);
  }

  async getDashboard(authz: AuthorizationContext): Promise<DashboardResult> {
    const decision = await this.authorized(authz, 'view');
    const createDecision = await authz.authorize({
      resource: { type: 'composite', id: SERVICE_DESK_TICKET_RESOURCE },
      action: 'create',
    });
    const assignDecision = await authz.authorize({
      resource: { type: 'composite', id: SERVICE_DESK_TICKET_RESOURCE },
      action: 'assign',
    });
    const canAssign = assignDecision.effect !== 'deny';
    const repository = this.tickets(this.ticketPolicy(decision));
    const unresolved = (filter: FilterBuilder<TicketRow>) =>
      filter.or([
        filter.string('status').eq('open'),
        filter.string('status').eq('assigned'),
      ]);

    const [total, open, assigned, resolved, closed, overdue, recent] =
      await Promise.all([
        repository.count(),
        repository.count({
          filter: (filter) => filter.string('status').eq('open'),
        }),
        repository.count({
          filter: (filter) => filter.string('status').eq('assigned'),
        }),
        repository.count({
          filter: (filter) => filter.string('status').eq('resolved'),
        }),
        repository.count({
          filter: (filter) => filter.string('status').eq('closed'),
        }),
        repository.count({
          filter: (filter) =>
            filter.and([
              unresolved(filter),
              filter.date('slaDueAt').before(new Date()),
            ]),
        }),
        repository.findMany({
          sort: (sort) => sort.field('updatedAt').desc(),
          limit: 5,
        }),
      ]);

    const priorities = await Promise.all(
      (['urgent', 'high', 'normal', 'low'] as const).map(async (priority) => {
        const count = await repository.count({
          filter: (filter) =>
            filter.and([
              unresolved(filter),
              filter.string('priority').eq(priority),
            ]),
        });
        return [priority, count] as const;
      }),
    );
    // The pending-queue and per-engineer figures only mean something to someone
    // who sees every ticket and may assign it; for everyone else the visible
    // scope would report their own tickets as the team's workload.
    const unassigned = canAssign
      ? await repository.count({
          filter: (filter) =>
            filter.and([
              unresolved(filter),
              filter.string('assigneeId').empty(),
            ]),
        })
      : 0;
    const workload = canAssign
      ? await this.engineerWorkload(repository, unresolved)
      : [];
    const names = await this.namesFor(
      recent.flatMap((ticket) => [ticket.requesterId, ticket.assigneeId]),
    );
    const resolvedTotal = resolved + closed;
    return {
      canCreate: createDecision.effect !== 'deny',
      canAssign,
      total,
      open,
      assigned,
      unassigned,
      resolved,
      closed,
      overdue,
      resolutionRate:
        total === 0 ? 0 : Math.round((resolvedTotal / total) * 100),
      byPriority: Object.fromEntries(priorities) as Record<
        TicketPriority,
        number
      >,
      workload,
      recent: recent.map((ticket) => this.toSummary(ticket, names)),
    };
  }

  /**
   * Active and overdue tickets per engineer, busiest first, so the dashboard
   * shows where the queue is piling up. Engineers with no tickets stay listed
   * at zero instead of disappearing.
   */
  private async engineerWorkload(
    repository: Repository<TicketRow>,
    unresolved: (filter: FilterBuilder<TicketRow>) => FilterNode,
  ): Promise<EngineerWorkload[]> {
    const now = new Date();
    const engineers = await this.roleUsers('service-desk-engineer');
    const workload = await Promise.all(
      engineers.map(async (engineer) => {
        const active = await repository.count({
          filter: (filter) =>
            filter.and([
              unresolved(filter),
              filter.string('assigneeId').eq(engineer.id),
            ]),
        });
        const overdue = await repository.count({
          filter: (filter) =>
            filter.and([
              unresolved(filter),
              filter.string('assigneeId').eq(engineer.id),
              filter.date('slaDueAt').before(now),
            ]),
        });
        return {
          id: engineer.id,
          name: engineer.name,
          email: engineer.email,
          active,
          overdue,
        };
      }),
    );
    return workload.sort(
      (left, right) =>
        right.active - left.active || left.name.localeCompare(right.name),
    );
  }

  async listAssignees(authz: AuthorizationContext): Promise<Assignee[]> {
    await this.authorized(authz, 'assign');
    const users = await this.roleUsers('service-desk-engineer');
    return users
      .map((user) => ({ id: user.id, name: user.name, email: user.email }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async uploadAttachment(
    authz: AuthorizationContext,
    actorId: string,
    file: File,
  ): Promise<UploadedAttachment> {
    await this.authorized(authz, 'create');
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const expectedMime = ALLOWED_FILE_TYPES.get(ext);
    if (!expectedMime || (file.type && file.type !== expectedMime)) {
      throw new ApiError({
        status: 'INVALID_ARGUMENT',
        reason: 'UNSUPPORTED_FILE_TYPE',
        domain: DOMAIN,
        message: 'Only PNG, JPEG, WebP, GIF and PDF files are allowed.',
        fieldViolations: [
          {
            field: 'file',
            description: 'Unsupported file type.',
            reason: 'UNSUPPORTED_FILE_TYPE',
          },
        ],
      });
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new ApiError({
        status: 'INVALID_ARGUMENT',
        reason: 'FILE_TOO_LARGE',
        domain: DOMAIN,
        message: 'Each attachment must be 5 MB or smaller.',
        fieldViolations: [
          {
            field: 'file',
            description: 'File is too large.',
            reason: 'FILE_TOO_LARGE',
          },
        ],
      });
    }

    const repository = this.dependencies.files.repository('serviceDeskFiles', {
      disk: 'local',
      accessPath: '/uploads/service-desk',
      policy: { create: true, read: true, update: false, delete: false },
    });
    await repository.validateCollection();
    const uploaded = await repository.uploadOne({ file });
    await this.dependencies.database
      .repository<ServiceDeskFileRow>('serviceDeskFiles')
      .updateOne({
        filter: { id: uploaded.record.id },
        values: { uploadedById: actorId, ticketId: null },
      });
    return {
      id: uploaded.record.id,
      filename: uploaded.record.filename,
      ext: uploaded.record.ext,
      mimeType: this.safeMime(uploaded.record.mimeType),
      size: Number(uploaded.record.size),
      createdAt: iso(uploaded.record.createdAt) as string,
    };
  }

  async downloadAttachment(
    authz: AuthorizationContext,
    ticketId: number,
    fileId: string,
  ): Promise<DownloadedFile> {
    const decision = await this.authorized(authz, 'view');
    const ticket = await this.tickets(this.ticketPolicy(decision)).findOne({
      filter: { id: ticketId },
    });
    if (!ticket) throw this.ticketNotFound(ticketId);

    const file = await this.dependencies.database
      .repository<ServiceDeskFileRow>('serviceDeskFiles')
      .findOne({ filter: { id: fileId, ticketId } });
    if (!file) {
      throw new ApiError({
        status: 'NOT_FOUND',
        reason: 'ATTACHMENT_NOT_FOUND',
        domain: DOMAIN,
        message: 'The attachment was not found on this ticket.',
      });
    }
    const stream = await this.dependencies.drive
      .use(file.disk)
      .getStream(file.key);
    const mimeType = this.safeMime(file.mimeType);
    return {
      stream,
      filename: file.filename,
      mimeType,
      size: Number(file.size),
      inline: /^image\/(png|jpeg|webp|gif)$/.test(mimeType),
    };
  }

  async scanOverdue(): Promise<number> {
    const now = new Date();
    const repository =
      this.dependencies.database.repository<TicketRow>('serviceDeskTickets');
    const tickets = await repository.findMany({
      filter: (filter) =>
        filter.and([
          filter.or([
            filter.string('status').eq('open'),
            filter.string('status').eq('assigned'),
          ]),
          filter.date('slaDueAt').before(now),
          filter.date('overdueNotifiedAt').empty(),
        ]),
      sort: (sort) => sort.field('slaDueAt').asc(),
      limit: 100,
    });
    if (tickets.length === 0) return 0;

    const managers = await this.userIdsWithPermissionSet(
      'service-desk-manager',
    );
    let notified = 0;
    for (const ticket of tickets) {
      const recipients = [
        ...new Set(
          [ticket.assigneeId, ...managers].filter(Boolean) as string[],
        ),
      ];
      const delivered =
        recipients.length === 0
          ? true
          : await this.notify(
              `service-desk:${ticket.id}:overdue:${iso(ticket.slaDueAt)}`,
              recipients,
              `Ticket #${ticket.id} is overdue`,
              `The SLA for "${ticket.title}" was due at ${iso(ticket.slaDueAt)}.`,
              ticket.id,
            );
      if (!delivered) continue;
      if (recipients.length > 0) notified += 1;
      await repository.updateOne({
        filter: (filter) =>
          filter.and([
            filter.number('id').eq(ticket.id),
            filter.date('overdueNotifiedAt').empty(),
          ]),
        values: { overdueNotifiedAt: now },
      });
    }
    return notified;
  }

  private async authorized(authz: AuthorizationContext, action: string) {
    const decision = await authz.authorize({
      resource: { type: 'composite', id: SERVICE_DESK_TICKET_RESOURCE },
      action,
    });
    if (decision.effect === 'deny')
      throw new AuthorizationDeniedError(decision);
    return decision;
  }

  private policy(
    decision: AuthorizationDecision,
    collection: 'serviceDeskTickets' | 'serviceDeskComments',
  ): RepositoryPolicy {
    const database = (
      decision.conditions as
        | { database?: Record<string, RepositoryPolicy | false | undefined> }
        | undefined
    )?.database;
    const policy = database?.[collection];
    if (!policy) throw new AuthorizationDeniedError(decision);
    return policy;
  }

  private ticketPolicy(decision: AuthorizationDecision): RepositoryPolicy {
    return this.policy(decision, 'serviceDeskTickets');
  }

  private ticketListFilter(
    input: TicketListInput,
  ): RepositoryFilter<TicketRow> | undefined {
    if (!input.status && !input.priority && !input.q) return undefined;
    return (filter: FilterBuilder<TicketRow>) => {
      const items: FilterNode[] = [];
      if (input.status) items.push(filter.string('status').eq(input.status));
      if (input.priority)
        items.push(filter.string('priority').eq(input.priority));
      if (input.q) {
        items.push(
          filter.or([
            filter.string('title').includes(input.q, { mode: 'insensitive' }),
            filter
              .text('description')
              .includes(input.q, { mode: 'insensitive' }),
          ]),
        );
      }
      if (items.length === 0) return filter.and([]);
      return filter.and(items);
    };
  }

  private async availableActions(
    authz: AuthorizationContext,
    ticket: TicketRow,
  ): Promise<string[]> {
    const available: string[] = [];
    for (const action of CANDIDATE_ACTIONS) {
      if (!ACTION_STATUSES[action].includes(ticket.status)) continue;
      const decision = await authz.authorize({
        resource: { type: 'composite', id: SERVICE_DESK_TICKET_RESOURCE },
        action,
      });
      if (decision.effect === 'deny') continue;
      let policy: RepositoryPolicy;
      try {
        policy = this.ticketPolicy(decision);
      } catch {
        continue;
      }
      const record = await this.tickets(policy).findOne({
        filter: { id: ticket.id },
        select: (select) => select.fields('id'),
      });
      if (record) available.push(action);
    }
    return available;
  }

  private async claimAttachments(
    transaction: DatabaseConnection,
    actorId: string,
    attachmentIds: readonly string[],
  ): Promise<TicketAttachmentSnapshot[]> {
    if (attachmentIds.length === 0) return [];
    const repository =
      transaction.repository<ServiceDeskFileRow>('serviceDeskFiles');
    const files = await repository.findMany({
      filter: (filter) =>
        filter.and([
          ...attachmentIds.map((id) => filter.string('id').eq(id)),
          filter.string('uploadedById').eq(actorId),
          filter.number('ticketId').empty(),
        ]),
    });
    const byId = new Map(files.map((file) => [file.id, file]));
    const ordered = attachmentIds.map((id) => byId.get(id));
    if (ordered.some((file) => !file)) {
      throw this.invalidArgument(
        'INVALID_ATTACHMENTS',
        'One or more attachments are missing or already belong to another ticket.',
        'attachmentIds',
      );
    }
    return (ordered as ServiceDeskFileRow[]).map((file) => ({
      id: file.id,
      filename: file.filename,
      ext: file.ext,
      mimeType: this.safeMime(file.mimeType),
      size: Number(file.size),
      createdAt: iso(file.createdAt) as string,
    }));
  }

  private async insertActivity(
    transaction: DatabaseConnection,
    policy: RepositoryPolicy,
    ticketId: number,
    authorId: string,
    kind: CommentRow['kind'],
    body: string,
    now: Date,
  ): Promise<CommentRow> {
    const created = await this.txComments(transaction, policy).createOne({
      values: {
        ticketId,
        authorId,
        kind,
        body,
        createdAt: now,
        updatedAt: now,
      },
    });
    return created.record;
  }

  private tickets(policy: RepositoryPolicy): Repository<TicketRow> {
    return this.dependencies.database
      .repository<TicketRow>('serviceDeskTickets')
      .withPolicy(
        policy as RepositoryPolicy<TicketRow>,
      ) as unknown as Repository<TicketRow>;
  }

  private comments(policy: RepositoryPolicy): Repository<CommentRow> {
    return this.dependencies.database
      .repository<CommentRow>('serviceDeskComments')
      .withPolicy(
        policy as RepositoryPolicy<CommentRow>,
      ) as unknown as Repository<CommentRow>;
  }

  private txTickets(
    transaction: DatabaseConnection,
    policy: RepositoryPolicy,
  ): Repository<TicketRow> {
    return transaction
      .repository<TicketRow>('serviceDeskTickets')
      .withPolicy(
        policy as RepositoryPolicy<TicketRow>,
      ) as unknown as Repository<TicketRow>;
  }

  private txComments(
    transaction: DatabaseConnection,
    policy: RepositoryPolicy,
  ): Repository<CommentRow> {
    return transaction
      .repository<CommentRow>('serviceDeskComments')
      .withPolicy(
        policy as RepositoryPolicy<CommentRow>,
      ) as unknown as Repository<CommentRow>;
  }

  private async namesFor(
    ids: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean) as string[])];
    const names = new Map<string, string>();
    for (let index = 0; index < unique.length; index += 100) {
      const chunk = unique.slice(index, index + 100);
      const page = await this.dependencies.userAdministration.list({
        userIds: chunk,
        pageSize: chunk.length,
        kind: 'all',
      });
      for (const user of page.items) names.set(user.id, user.name);
    }
    return names;
  }

  private async roleUsers(role: string) {
    const items: { id: string; name: string; email: string }[] = [];
    for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
      const page = await this.dependencies.userManagement.list({
        page: pageNumber,
        pageSize: 100,
        status: 'enabled',
        roleScope: 'app',
        role,
      });
      items.push(...page.items.map((user) => user));
      if (items.length >= page.total || page.items.length === 0) break;
    }
    return items;
  }

  private async userIdsWithPermissionSet(role: string): Promise<string[]> {
    return [...new Set((await this.roleUsers(role)).map((user) => user.id))];
  }

  private async notifyComment(
    ticket: TicketRow,
    actorId: string,
    ticketId: number,
    commentId: number,
    body: string,
  ): Promise<void> {
    let recipients: string[];
    if (actorId === ticket.requesterId) {
      recipients = ticket.assigneeId
        ? [ticket.assigneeId]
        : await this.userIdsWithPermissionSet('service-desk-manager');
    } else {
      recipients = [
        ticket.requesterId,
        ...(ticket.assigneeId ? [ticket.assigneeId] : []),
      ];
    }
    await this.notify(
      `service-desk:${ticketId}:comment:${commentId}`,
      recipients.filter((id) => id !== actorId),
      `New comment on ticket #${ticketId}`,
      body.length > 300 ? `${body.slice(0, 297)}...` : body,
      ticketId,
    );
  }

  private async notify(
    idempotencyKey: string,
    recipients: readonly string[],
    title: string,
    body: string,
    ticketId: number,
  ): Promise<boolean> {
    const unique = [...new Set(recipients)].filter(Boolean);
    if (unique.length === 0) return true;
    try {
      await this.dependencies.notifications.send({
        idempotencyKey,
        source: { type: 'service-desk.ticket', referenceId: String(ticketId) },
        messages: {
          inbox: {
            to: unique,
            title,
            body,
            target: { type: 'route', path: `/tickets/${ticketId}` },
          },
        },
      });
      return true;
    } catch (error) {
      this.dependencies.logger.error(
        { idempotencyKey, error: toError(error) },
        'Service desk notification failed.',
      );
      return false;
    }
  }

  private toSummary(
    ticket: TicketRow,
    names: Map<string, string>,
  ): TicketSummary {
    return {
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      requesterId: ticket.requesterId,
      requesterName: names.get(ticket.requesterId) ?? null,
      assigneeId: ticket.assigneeId,
      assigneeName: ticket.assigneeId
        ? (names.get(ticket.assigneeId) ?? null)
        : null,
      slaDueAt: iso(ticket.slaDueAt) as string,
      assignedAt: iso(ticket.assignedAt),
      resolvedAt: iso(ticket.resolvedAt),
      closedAt: iso(ticket.closedAt),
      reopenedAt: iso(ticket.reopenedAt),
      resolution: ticket.resolution,
      attachments: Array.isArray(ticket.attachments) ? ticket.attachments : [],
      commentCount: ticket.commentCount,
      overdue:
        (ticket.status === 'open' || ticket.status === 'assigned') &&
        new Date(ticket.slaDueAt).getTime() < Date.now(),
      createdAt: iso(ticket.createdAt) as string,
      updatedAt: iso(ticket.updatedAt) as string,
    };
  }

  private safeMime(value: string): string {
    return /^[\w.+-]+\/[\w.+-]+$/.test(value)
      ? value
      : 'application/octet-stream';
  }

  private invalidArgument(
    reason: string,
    message: string,
    field: string,
  ): ApiError {
    return new ApiError({
      status: 'INVALID_ARGUMENT',
      reason,
      domain: DOMAIN,
      message,
      fieldViolations: [{ field, description: message, reason }],
    });
  }

  private ticketNotFound(ticketId: number): ApiError {
    return new ApiError({
      status: 'NOT_FOUND',
      reason: 'TICKET_NOT_FOUND',
      domain: DOMAIN,
      message: `Ticket ${ticketId} was not found.`,
    });
  }

  private notAssignable(status: TicketStatus, action: string): ApiError {
    return new ApiError({
      status: 'FAILED_PRECONDITION',
      reason: 'TICKET_NOT_ASSIGNABLE',
      domain: DOMAIN,
      message: `A ${status} ticket cannot be ${action}ed.`,
      metadata: { status, action },
    });
  }

  private notAvailable(status: TicketStatus, action: string): ApiError {
    return new ApiError({
      status: 'FAILED_PRECONDITION',
      reason: 'TICKET_ACTION_NOT_AVAILABLE',
      domain: DOMAIN,
      message: `A ${status} ticket cannot be ${action}ed.`,
      metadata: { status, action },
    });
  }
}
