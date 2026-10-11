import type { Application } from '@nocobase/app-server/application';
import type { AppConfigAccessor } from '@nocobase/app-server/config';
import type {
  DatabaseManager,
  FilterBuilder,
  FilterNode,
  Repository,
} from '@nocobase/db';
import type { AuthorizationConfig } from '@nocobase/app-plugin-authorization/server';
import { type AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { NotificationService } from '@nocobase/app-plugin-notification/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import {
  createServiceToken,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';

/** The two ways a person participates in the service desk. Everyone else is an ordinary reporter. */
export type ItTeamRole = 'engineer' | 'serviceDesk';

/** What a caller may be to the ticket service. */
export interface TicketPrincipal {
  /** The authenticated user, as Better Auth stores it: a 64-character string. */
  userId: string;
}

export interface ItRoleSummary {
  userId: string;
  role: ItTeamRole | null;
  /** Holding the root Permission Set, which the service desk treats as a service-desk member. */
  isRoot: boolean;
  /** `role` with root folded in, for the code that decides visibility. */
  isServiceDesk: boolean;
}

export interface TicketAttachmentView {
  id: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  /** Where the browser reads the bytes, already carrying the deployment base path. */
  contentUrl: string;
}

export interface TicketRecordView {
  id: number;
  kind: string;
  authorId: string | null;
  authorName: string | null;
  content: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
}

export interface TicketView {
  id: number;
  title: string;
  description: string;
  urgency: string;
  status: string;
  statusChangedAt: string;
  reporterId: string;
  reporterName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  closedById: string | null;
  createdAt: string;
  updatedAt: string;
  /** The SLA state the list and dashboard show: neither closed nor resolved, untouched for over a day. */
  overdue: boolean;
  attachments: TicketAttachmentView[];
  records?: TicketRecordView[];
}

export interface TicketListQuery {
  /** `all` is only honoured for the service desk; every role falls back to what it may see. */
  scope?: 'all' | 'mine' | 'assigned';
  /** A single status, or `open` for everything not closed. */
  status?: string;
  urgency?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface TicketListResult {
  items: TicketView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EngineerWorkload {
  userId: string;
  name: string;
  role: ItTeamRole | null;
  open: number;
  total: number;
}

export interface DashboardResult {
  role: ItRoleSummary;
  pending: number;
  processing: number;
  resolved: number;
  closed: number;
  overdue: number;
  /** Tickets this user reported or is assigned, whichever their role makes meaningful. */
  mine: number;
  engineers: EngineerWorkload[];
}

export interface CreateTicketInput {
  title: string;
  description: string;
  urgency: string;
  attachmentIds?: readonly string[];
}

export interface ItUserView {
  userId: string;
  name: string;
  email: string;
  role: ItTeamRole | null;
}

export interface ItTicketService {
  roleOf(principal: TicketPrincipal): Promise<ItRoleSummary>;
  dashboard(principal: TicketPrincipal): Promise<DashboardResult>;
  list(
    principal: TicketPrincipal,
    query: TicketListQuery,
  ): Promise<TicketListResult>;
  get(principal: TicketPrincipal, id: number): Promise<TicketView>;
  create(
    principal: TicketPrincipal,
    input: CreateTicketInput,
  ): Promise<TicketView>;
  assign(
    principal: TicketPrincipal,
    id: number,
    assigneeId: string,
  ): Promise<TicketView>;
  process(
    principal: TicketPrincipal,
    id: number,
    content: string,
  ): Promise<TicketView>;
  resolve(
    principal: TicketPrincipal,
    id: number,
    resolution: string,
  ): Promise<TicketView>;
  returnForRework(
    principal: TicketPrincipal,
    id: number,
    reason: string,
  ): Promise<TicketView>;
  close(
    principal: TicketPrincipal,
    id: number,
    comment?: string,
  ): Promise<TicketView>;
  comment(
    principal: TicketPrincipal,
    id: number,
    content: string,
  ): Promise<TicketView>;
  listUsers(principal: TicketPrincipal): Promise<ItUserView[]>;
  setMemberRole(
    principal: TicketPrincipal,
    userId: string,
    role: ItTeamRole | null,
  ): Promise<ItUserView[]>;
  /** Notifies the service desk about tickets that have waited over a day; returns how many were reminded. */
  scanOverdueReminders(now?: Date): Promise<number>;
}

export const itTicketServiceToken: ServiceToken<ItTicketService> =
  createServiceToken<ItTicketService>('app/it-ticket-service');

/** Tickets untouched for this long while still unresolved are overdue. */
export const OVERDUE_AFTER_MS = 24 * 60 * 60 * 1000;

/** The URL prefix the file exposure in `server/routes/it-tickets.ts` serves bytes under. */
export const IT_TICKET_FILES_ACCESS_PATH = '/uploads/it-tickets';

const TICKET_STATUSES: readonly string[] = [
  'pending',
  'processing',
  'resolved',
  'closed',
];
const URGENCIES: readonly string[] = ['low', 'normal', 'high', 'urgent'];
const TITLE_MAX = 200;

export class ItTicketError extends Error {
  public readonly status: number;
  public readonly reason: string;

  constructor(status: number, reason: string, message: string) {
    super(message);
    this.name = 'ItTicketError';
    this.status = status;
    this.reason = reason;
  }
}

interface TicketRow {
  id: number;
  title: string;
  description: string;
  urgency: string;
  status: string;
  statusChangedAt: Date | string;
  reporterId: string;
  assigneeId: string | null;
  resolution: string | null;
  resolvedAt: Date | string | null;
  closedAt: Date | string | null;
  closedById: string | null;
  remindedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface TicketRecordRow {
  id: number;
  ticketId: number;
  authorId: string | null;
  kind: string;
  content: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: Date | string;
}

interface TicketFileRow {
  id: string;
  ticketId: number | null;
  uploaderId: string | null;
  filename: string;
  ext: string;
  mimeType: string;
  size: number | string;
  updatedAt: Date | string;
}

interface TeamMemberRow {
  id: number;
  userId: string;
  role: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
}

export interface ItTicketServiceOptions {
  readonly app: Application;
  readonly database?: DatabaseManager;
  readonly authz?: AppAuthorization;
  readonly config?: AppConfigAccessor;
}

export function createItTicketService(
  options: ItTicketServiceOptions,
): ItTicketService {
  return new DefaultItTicketService(options);
}

class DefaultItTicketService implements ItTicketService {
  private readonly app: Application;
  private readonly container: ServiceContainer;
  private readonly database: DatabaseManager | undefined;
  private readonly authz: AppAuthorization | undefined;
  private readonly rootSet: string;

  constructor(options: ItTicketServiceOptions) {
    this.app = options.app;
    this.container = options.app.container;
    this.database = options.database;
    this.authz = options.authz;
    this.rootSet =
      options.config?.get<AuthorizationConfig>('authorization')?.permissionSets
        ?.rootSet ?? 'root';
  }

  public async roleOf(principal: TicketPrincipal): Promise<ItRoleSummary> {
    const [member, isRoot] = await Promise.all([
      this.memberRow(principal.userId),
      this.userIsRoot(principal.userId),
    ]);
    const role = this.normalizeRole(member?.role ?? null);

    return {
      userId: principal.userId,
      role,
      isRoot,
      isServiceDesk: role === 'serviceDesk' || isRoot,
    };
  }

  public async dashboard(principal: TicketPrincipal): Promise<DashboardResult> {
    const role = await this.roleOf(principal);
    const repo = this.tickets();
    const now = new Date();

    // Every figure is scoped to what this role may see, so an employee's dashboard counts their own tickets
    // rather than the size of the queue, and the service desk's counts the whole desk.
    const scoped = (
      status?: string,
    ): ((f: FilterBuilder<TicketRow>) => FilterNode) => {
      return (f) => {
        const nodes: FilterNode[] = [];
        const scope = this.scopeNode(f, role, undefined, principal);
        if (scope) {
          nodes.push(scope);
        }
        if (status) {
          nodes.push(f.string('status').eq(status));
        }
        return nodes.length === 1 ? nodes[0] : f.and(nodes);
      };
    };
    // Overdue counts what the reminder job watches: everything still open and untouched for a day.
    const overduePredicate = this.overdueFilter(now);
    const scopedOverdue = (f: FilterBuilder<TicketRow>): FilterNode => {
      const scope = this.scopeNode(f, role, undefined, principal);
      return scope ? f.and([scope, overduePredicate(f)]) : overduePredicate(f);
    };
    const mineFilter = (f: FilterBuilder<TicketRow>): FilterNode => {
      if (role.isServiceDesk) {
        return f.or([
          f.string('reporterId').eq(principal.userId),
          f.string('assigneeId').eq(principal.userId),
        ]);
      }
      if (role.role === 'engineer') {
        return f.string('assigneeId').eq(principal.userId);
      }
      return f.string('reporterId').eq(principal.userId);
    };

    const [pending, processing, resolved, closed, overdue, mine] =
      await Promise.all([
        repo.count({ filter: scoped('pending') }),
        repo.count({ filter: scoped('processing') }),
        repo.count({ filter: scoped('resolved') }),
        repo.count({ filter: scoped('closed') }),
        repo.count({ filter: scopedOverdue }),
        repo.count({ filter: mineFilter }),
      ]);

    const engineers: EngineerWorkload[] = [];
    if (role.isServiceDesk) {
      const members = await this.team().findMany({});
      const candidateIds = new Set<string>();
      for (const member of members) {
        candidateIds.add(member.userId);
      }
      for (const rootId of await this.rootUserIds()) {
        candidateIds.add(rootId);
      }
      const users = await this.loadUsers([...candidateIds]);
      for (const userId of candidateIds) {
        const member = members.find((row) => row.userId === userId);
        const [open, total] = await Promise.all([
          repo.count({
            filter: (f) =>
              f.and([
                f.string('assigneeId').eq(userId),
                f.string('status').ne('closed'),
              ]),
          }),
          repo.count({ filter: { assigneeId: userId } }),
        ]);
        engineers.push({
          userId,
          name: users.get(userId) ?? userId,
          role: this.normalizeRole(member?.role ?? null),
          open,
          total,
        });
      }
      engineers.sort((left, right) => right.open - left.open);
    }

    return {
      role,
      pending,
      processing,
      resolved,
      closed,
      overdue,
      mine,
      engineers,
    };
  }

  public async list(
    principal: TicketPrincipal,
    query: TicketListQuery,
  ): Promise<TicketListResult> {
    const role = await this.roleOf(principal);
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Math.floor(query.pageSize ?? 20)),
    );
    const keyword = query.keyword?.trim();
    const status = query.status?.trim();

    const filter = (f: FilterBuilder<TicketRow>): FilterNode => {
      const nodes: FilterNode[] = [];
      const scope = this.scopeNode(f, role, query.scope, principal);
      if (scope) {
        nodes.push(scope);
      }

      if (status === 'open') {
        nodes.push(
          f.or([
            f.string('status').eq('pending'),
            f.string('status').eq('processing'),
            f.string('status').eq('resolved'),
          ]),
        );
      } else if (status && TICKET_STATUSES.includes(status)) {
        nodes.push(f.string('status').eq(status));
      }

      if (query.urgency && URGENCIES.includes(query.urgency)) {
        nodes.push(f.string('urgency').eq(query.urgency));
      }

      if (keyword) {
        nodes.push(
          f.or([
            f.string('title').includes(keyword, { mode: 'insensitive' }),
            f.text('description').includes(keyword, { mode: 'insensitive' }),
          ]),
        );
      }

      return nodes.length === 1 ? nodes[0] : f.and(nodes);
    };
    const repo = this.tickets();
    const [total, rows] = await Promise.all([
      repo.count({ filter }),
      repo.findMany({
        filter,
        sort: (sort) => [sort.field('createdAt').desc()],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
    ]);

    return {
      items: await this.decorate(rows),
      total,
      page,
      pageSize,
    };
  }

  public async get(
    principal: TicketPrincipal,
    id: number,
  ): Promise<TicketView> {
    const role = await this.roleOf(principal);
    const row = await this.requireTicket(id);

    if (!this.canView(row, role, principal)) {
      throw new ItTicketError(
        403,
        'TICKET_FORBIDDEN',
        'Ticket is not visible.',
      );
    }

    const [view] = await this.decorate([row]);
    return this.withRecords(view, row);
  }

  public async create(
    principal: TicketPrincipal,
    input: CreateTicketInput,
  ): Promise<TicketView> {
    const title = input.title?.trim();
    const description = input.description?.trim();
    this.assertText(title, 'title');
    this.assertText(description, 'description');
    if (title.length > TITLE_MAX) {
      throw new ItTicketError(
        400,
        'TICKET_INVALID_TITLE',
        'Title is too long.',
      );
    }
    const urgency = URGENCIES.includes(input.urgency)
      ? input.urgency
      : 'normal';
    const timestamp = new Date();

    const row = await this.database!.transaction(async (connection) => {
      const { record } = await connection
        .repository<TicketRow>('itTickets')
        .createOne({
          values: {
            title,
            description,
            urgency,
            status: 'pending',
            statusChangedAt: timestamp,
            reporterId: principal.userId,
            assigneeId: null,
            resolution: null,
            resolvedAt: null,
            closedAt: null,
            closedById: null,
            remindedAt: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        });

      await connection
        .repository<TicketRecordRow>('itTicketRecords')
        .createOne({
          values: {
            ticketId: record.id,
            authorId: principal.userId,
            kind: 'created',
            content: null,
            fromStatus: null,
            toStatus: 'pending',
            createdAt: timestamp,
          },
        });

      await this.linkAttachments(
        connection.repository<TicketFileRow>('itTicketFiles'),
        record.id,
        input.attachmentIds,
        principal.userId,
      );

      return record;
    });

    const recipients = await this.serviceDeskUserIds();
    await this.notify(recipients, {
      idempotencyKey: `it-ticket-${row.id}-created`,
      title: `新报修 #${row.id} / New ticket #${row.id}`,
      body: `${row.title}（${this.urgencyLabel(row.urgency)}）待分派 / Pending assignment`,
      path: `/tickets/${row.id}`,
    });

    const [view] = await this.decorate([row]);
    return view;
  }

  public async assign(
    principal: TicketPrincipal,
    id: number,
    assigneeId: string,
  ): Promise<TicketView> {
    const role = await this.roleOf(principal);
    if (!role.isServiceDesk) {
      throw new ItTicketError(
        403,
        'TICKET_FORBIDDEN',
        'Only the service desk may assign tickets.',
      );
    }
    const row = await this.requireTicket(id);
    if (row.status === 'closed') {
      throw new ItTicketError(409, 'TICKET_CLOSED', 'Ticket is closed.');
    }
    const target = await this.loadUsers([assigneeId]);
    if (!target.has(assigneeId)) {
      throw new ItTicketError(
        400,
        'TICKET_INVALID_ASSIGNEE',
        'Assignee does not exist.',
      );
    }

    const timestamp = new Date();
    const updated = await this.transition(row, {
      status: 'processing',
      assigneeId,
      timestamp,
      kind: 'assigned',
      authorId: principal.userId,
      content: null,
      resetResolution: true,
    });

    await this.notify([assigneeId], {
      idempotencyKey: `it-ticket-${row.id}-assigned-${timestamp.getTime()}`,
      title: `工单 #${row.id} 已分派 / Ticket #${row.id} assigned`,
      body: `${row.title} / ${row.title}`,
      path: `/tickets/${row.id}`,
    });

    return updated;
  }

  public async process(
    principal: TicketPrincipal,
    id: number,
    content: string,
  ): Promise<TicketView> {
    const role = await this.roleOf(principal);
    const row = await this.requireTicket(id);
    this.assertCanWork(row, role, principal);
    this.assertText(content, 'content');

    if (row.status === 'closed') {
      throw new ItTicketError(409, 'TICKET_CLOSED', 'Ticket is closed.');
    }

    const timestamp = new Date();
    await this.database!.transaction(async (connection) => {
      await connection
        .repository<TicketRecordRow>('itTicketRecords')
        .createOne({
          values: {
            ticketId: row.id,
            authorId: principal.userId,
            kind: 'processing',
            content: content.trim(),
            fromStatus: row.status,
            toStatus: row.status,
            createdAt: timestamp,
          },
        });
      await connection.repository<TicketRow>('itTickets').updateOne({
        filter: { id: row.id },
        values: { updatedAt: timestamp, remindedAt: null },
      });
    });

    return this.get(principal, row.id);
  }

  public async resolve(
    principal: TicketPrincipal,
    id: number,
    resolution: string,
  ): Promise<TicketView> {
    const role = await this.roleOf(principal);
    const row = await this.requireTicket(id);
    this.assertCanWork(row, role, principal);
    this.assertText(resolution, 'resolution');
    if (row.status !== 'processing' && row.status !== 'pending') {
      throw new ItTicketError(
        409,
        'TICKET_INVALID_STATE',
        'Ticket cannot be resolved from its current status.',
      );
    }

    const timestamp = new Date();
    const updated = await this.transition(row, {
      status: 'resolved',
      timestamp,
      kind: 'resolved',
      authorId: principal.userId,
      content: resolution.trim(),
      setResolution: resolution.trim(),
    });

    await this.notify([row.reporterId], {
      idempotencyKey: `it-ticket-${row.id}-resolved-${timestamp.getTime()}`,
      title: `工单 #${row.id} 已处理 / Ticket #${row.id} resolved`,
      body: `请确认是否解决 / Please confirm the resolution`,
      path: `/tickets/${row.id}`,
    });

    return updated;
  }

  public async returnForRework(
    principal: TicketPrincipal,
    id: number,
    reason: string,
  ): Promise<TicketView> {
    const role = await this.roleOf(principal);
    const row = await this.requireTicket(id);
    if (!this.canConfirm(row, role, principal)) {
      throw new ItTicketError(
        403,
        'TICKET_FORBIDDEN',
        'Only the reporter or the service desk may return a ticket.',
      );
    }
    this.assertText(reason, 'reason');
    if (row.status !== 'resolved') {
      throw new ItTicketError(
        409,
        'TICKET_INVALID_STATE',
        'Only a resolved ticket can be returned.',
      );
    }

    const timestamp = new Date();
    const updated = await this.transition(row, {
      status: 'processing',
      timestamp,
      kind: 'returned',
      authorId: principal.userId,
      content: reason.trim(),
      resetResolution: true,
    });

    const recipients = new Set<string>();
    if (row.assigneeId) {
      recipients.add(row.assigneeId);
    }
    for (const userId of await this.serviceDeskUserIds()) {
      recipients.add(userId);
    }
    await this.notify([...recipients], {
      idempotencyKey: `it-ticket-${row.id}-returned-${timestamp.getTime()}`,
      title: `工单 #${row.id} 被退回 / Ticket #${row.id} returned`,
      body: `需要继续处理 / Needs further work`,
      path: `/tickets/${row.id}`,
    });

    return updated;
  }

  public async close(
    principal: TicketPrincipal,
    id: number,
    comment?: string,
  ): Promise<TicketView> {
    const role = await this.roleOf(principal);
    const row = await this.requireTicket(id);
    if (!this.canConfirm(row, role, principal)) {
      throw new ItTicketError(
        403,
        'TICKET_FORBIDDEN',
        'Only the reporter or the service desk may close a ticket.',
      );
    }
    if (row.status !== 'resolved') {
      throw new ItTicketError(
        409,
        'TICKET_INVALID_STATE',
        'Only a resolved ticket can be closed.',
      );
    }

    const timestamp = new Date();
    const updated = await this.transition(row, {
      status: 'closed',
      timestamp,
      kind: 'closed',
      authorId: principal.userId,
      content: comment?.trim() || null,
      closedById: principal.userId,
    });

    const recipients = new Set<string>();
    if (row.assigneeId) {
      recipients.add(row.assigneeId);
    }
    for (const userId of await this.serviceDeskUserIds()) {
      recipients.add(userId);
    }
    await this.notify([...recipients], {
      idempotencyKey: `it-ticket-${row.id}-closed-${timestamp.getTime()}`,
      title: `工单 #${row.id} 已关闭 / Ticket #${row.id} closed`,
      body: `${row.title} / ${row.title}`,
      path: `/tickets/${row.id}`,
    });

    return updated;
  }

  public async comment(
    principal: TicketPrincipal,
    id: number,
    content: string,
  ): Promise<TicketView> {
    const role = await this.roleOf(principal);
    const row = await this.requireTicket(id);
    if (!this.canView(row, role, principal)) {
      throw new ItTicketError(
        403,
        'TICKET_FORBIDDEN',
        'Ticket is not visible.',
      );
    }
    this.assertText(content, 'content');

    const timestamp = new Date();
    await this.database!.transaction(async (connection) => {
      await connection
        .repository<TicketRecordRow>('itTicketRecords')
        .createOne({
          values: {
            ticketId: row.id,
            authorId: principal.userId,
            kind: 'commented',
            content: content.trim(),
            fromStatus: row.status,
            toStatus: row.status,
            createdAt: timestamp,
          },
        });
      await connection.repository<TicketRow>('itTickets').updateOne({
        filter: { id: row.id },
        values: { updatedAt: timestamp },
      });
    });

    const recipients = new Set<string>([row.reporterId]);
    if (row.assigneeId) {
      recipients.add(row.assigneeId);
    }
    recipients.delete(principal.userId);
    await this.notify([...recipients], {
      idempotencyKey: `it-ticket-${row.id}-comment-${timestamp.getTime()}`,
      title: `工单 #${row.id} 有新回复 / New reply on ticket #${row.id}`,
      body: content.trim().slice(0, 140),
      path: `/tickets/${row.id}`,
    });

    return this.get(principal, row.id);
  }

  public async listUsers(principal: TicketPrincipal): Promise<ItUserView[]> {
    const role = await this.roleOf(principal);
    if (!role.isServiceDesk) {
      throw new ItTicketError(403, 'TEAM_FORBIDDEN', 'Service desk only.');
    }
    return this.userViews();
  }

  public async setMemberRole(
    principal: TicketPrincipal,
    userId: string,
    role: ItTeamRole | null,
  ): Promise<ItUserView[]> {
    const summary = await this.roleOf(principal);
    if (!summary.isRoot) {
      throw new ItTicketError(403, 'TEAM_FORBIDDEN', 'Root only.');
    }
    const users = await this.loadUsers([userId]);
    if (!users.has(userId)) {
      throw new ItTicketError(400, 'TEAM_UNKNOWN_USER', 'User does not exist.');
    }

    const timestamp = new Date();
    await this.database!.transaction(async (connection) => {
      const team = connection.repository<TeamMemberRow>('itTeamMembers');
      const existing = await team.findOne({ filter: { userId } });
      if (!role) {
        if (existing) {
          await team.deleteOne({ filter: { userId } });
        }
        return;
      }
      if (existing) {
        await team.updateOne({
          filter: { userId },
          values: { role, updatedAt: timestamp },
        });
      } else {
        await team.createOne({
          values: {
            userId,
            role,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        });
      }
    });

    return this.userViews();
  }

  public async scanOverdueReminders(now: Date = new Date()): Promise<number> {
    const rows = await this.tickets().findMany({
      filter: this.overdueFilter(now),
      sort: (sort) => [sort.field('statusChangedAt').asc()],
      limit: 100,
    });
    if (rows.length === 0) {
      return 0;
    }

    const recipients = await this.serviceDeskUserIds();
    for (const row of rows) {
      await this.tickets().updateOne({
        filter: { id: row.id },
        values: { remindedAt: now },
      });
      await this.notify(recipients, {
        idempotencyKey: `it-ticket-${row.id}-overdue-${this.dayKey(now)}`,
        title: `工单 #${row.id} 超时未解决 / Ticket #${row.id} overdue`,
        body: `${row.title} 已超过 24 小时未解决 / Unresolved for over 24 hours`,
        path: `/tickets/${row.id}`,
      });
    }
    return rows.length;
  }

  // ---------------------------------------------------------------- internals

  private tickets(): Repository<TicketRow> {
    return this.database!.repository<TicketRow>('itTickets');
  }

  private team(): Repository<TeamMemberRow> {
    return this.database!.repository<TeamMemberRow>('itTeamMembers');
  }

  private memberRow(userId: string): Promise<TeamMemberRow | undefined> {
    return this.team().findOne({ filter: { userId } });
  }

  private normalizeRole(value: string | null): ItTeamRole | null {
    return value === 'engineer' || value === 'serviceDesk' ? value : null;
  }

  private assertText(value: string | undefined, field: string): void {
    if (!value || value.trim().length === 0) {
      throw new ItTicketError(
        400,
        'TICKET_MISSING_FIELD',
        `Field "${field}" is required.`,
      );
    }
  }

  private async requireTicket(id: number): Promise<TicketRow> {
    const row = await this.tickets().findOne({ filter: { id } });
    if (!row) {
      throw new ItTicketError(
        404,
        'TICKET_NOT_FOUND',
        'Ticket does not exist.',
      );
    }
    return row;
  }

  private canView(
    row: TicketRow,
    role: ItRoleSummary,
    principal: TicketPrincipal,
  ): boolean {
    return (
      role.isServiceDesk ||
      row.reporterId === principal.userId ||
      row.assigneeId === principal.userId
    );
  }

  private assertCanWork(
    row: TicketRow,
    role: ItRoleSummary,
    principal: TicketPrincipal,
  ): void {
    if (!role.isServiceDesk && row.assigneeId !== principal.userId) {
      throw new ItTicketError(
        403,
        'TICKET_FORBIDDEN',
        'Only the assignee may work this ticket.',
      );
    }
  }

  private canConfirm(
    row: TicketRow,
    role: ItRoleSummary,
    principal: TicketPrincipal,
  ): boolean {
    return role.isServiceDesk || row.reporterId === principal.userId;
  }

  private scopeShorthand(
    role: ItRoleSummary,
    scope: TicketListQuery['scope'],
    principal: TicketPrincipal,
  ): { reporterId?: string; assigneeId?: string } {
    if (role.isServiceDesk) {
      if (scope === 'mine') {
        return { reporterId: principal.userId };
      }
      if (scope === 'assigned') {
        return { assigneeId: principal.userId };
      }
      return {};
    }
    if (role.role === 'engineer') {
      return scope === 'mine'
        ? { reporterId: principal.userId }
        : { assigneeId: principal.userId };
    }
    return { reporterId: principal.userId };
  }

  private scopeNode(
    f: FilterBuilder<TicketRow>,
    role: ItRoleSummary,
    scope: TicketListQuery['scope'],
    principal: TicketPrincipal,
  ): FilterNode | undefined {
    const shorthand = this.scopeShorthand(role, scope, principal);
    if (shorthand.reporterId) {
      return f.string('reporterId').eq(shorthand.reporterId);
    }
    if (shorthand.assigneeId) {
      return f.string('assigneeId').eq(shorthand.assigneeId);
    }
    // No scope restriction at all: the service desk sees every ticket.
    return undefined;
  }

  private overdueFilter(
    now: Date,
  ): (f: FilterBuilder<TicketRow>) => FilterNode {
    const cutoff = new Date(now.getTime() - OVERDUE_AFTER_MS);
    return (f) =>
      f.and([
        f.string('status').ne('closed'),
        f.string('status').ne('resolved'),
        f.or([
          f.date('updatedAt').before(cutoff),
          f.date('statusChangedAt').before(cutoff),
        ]),
        f.or([
          f.date('remindedAt').empty(),
          f.date('remindedAt').before(cutoff),
        ]),
      ]);
  }

  private dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private async transition(
    row: TicketRow,
    input: {
      status: string;
      timestamp: Date;
      kind: string;
      authorId: string | null;
      content: string | null;
      assigneeId?: string;
      setResolution?: string;
      resetResolution?: boolean;
      closedById?: string;
    },
  ): Promise<TicketView> {
    const values: Partial<TicketRow> = {
      status: input.status,
      statusChangedAt: input.timestamp,
      updatedAt: input.timestamp,
      remindedAt: null,
    };
    if (input.assigneeId !== undefined) {
      values.assigneeId = input.assigneeId;
    }
    if (input.status === 'resolved') {
      values.resolvedAt = input.timestamp;
      values.closedAt = null;
      values.closedById = null;
    }
    if (input.status === 'closed') {
      values.closedAt = input.timestamp;
      values.closedById = input.closedById ?? null;
    }
    if (input.status === 'processing') {
      values.resolvedAt = null;
    }
    if (input.setResolution !== undefined) {
      values.resolution = input.setResolution;
    }
    if (input.resetResolution) {
      values.resolution = null;
      values.resolvedAt = null;
    }

    await this.database!.transaction(async (connection) => {
      await connection.repository<TicketRow>('itTickets').updateOne({
        filter: { id: row.id },
        values,
      });
      await connection
        .repository<TicketRecordRow>('itTicketRecords')
        .createOne({
          values: {
            ticketId: row.id,
            authorId: input.authorId,
            kind: input.kind,
            content: input.content,
            fromStatus: row.status,
            toStatus: input.status,
            createdAt: input.timestamp,
          },
        });
    });

    const updated = await this.requireTicket(row.id);
    const [view] = await this.decorate([updated]);
    return view;
  }

  private async withRecords(
    view: TicketView,
    row: TicketRow,
  ): Promise<TicketView> {
    const records = await this.database!.repository<TicketRecordRow>(
      'itTicketRecords',
    ).findMany({
      filter: { ticketId: row.id },
      sort: (sort) => [sort.field('createdAt').asc()],
    });
    const names = await this.loadUsers(
      records
        .map((record) => record.authorId)
        .filter((value): value is string => Boolean(value)),
    );

    return {
      ...view,
      records: records.map((record) => ({
        id: record.id,
        kind: record.kind,
        authorId: record.authorId,
        authorName: record.authorId
          ? (names.get(record.authorId) ?? record.authorId)
          : null,
        content: record.content,
        fromStatus: record.fromStatus,
        toStatus: record.toStatus,
        createdAt: toIso(record.createdAt),
      })),
    };
  }

  private async decorate(rows: readonly TicketRow[]): Promise<TicketView[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);
    const files = await this.database!.repository<TicketFileRow>(
      'itTicketFiles',
    ).findMany({
      filter: (f) => f.or(ids.map((id) => f.number('ticketId').eq(id))),
      limit: 1000,
    });
    const userIds = new Set<string>();
    for (const row of rows) {
      userIds.add(row.reporterId);
      if (row.assigneeId) {
        userIds.add(row.assigneeId);
      }
    }
    const names = await this.loadUsers([...userIds]);

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      urgency: row.urgency,
      status: row.status,
      statusChangedAt: toIso(row.statusChangedAt),
      reporterId: row.reporterId,
      reporterName: names.get(row.reporterId) ?? null,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeId ? (names.get(row.assigneeId) ?? null) : null,
      resolution: row.resolution,
      resolvedAt: toIsoOrNull(row.resolvedAt),
      closedAt: toIsoOrNull(row.closedAt),
      closedById: row.closedById,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      overdue: this.isOverdue(row),
      attachments: files
        .filter((file) => file.ticketId === row.id)
        .map((file) => ({
          id: file.id,
          filename: file.filename,
          ext: file.ext,
          mimeType: file.mimeType,
          size: Number(file.size),
          contentUrl: this.fileContentUrl(file),
        })),
    }));
  }

  private fileContentUrl(file: TicketFileRow): string {
    const base = (this.app.publicBasePath ?? '').replace(/\/$/, '');
    return `${base}${IT_TICKET_FILES_ACCESS_PATH}/${encodeURIComponent(file.id)}${
      file.ext ? `.${encodeURIComponent(file.ext)}` : ''
    }`;
  }

  private isOverdue(row: TicketRow): boolean {
    if (row.status === 'closed' || row.status === 'resolved') {
      return false;
    }
    const updated = new Date(toIso(row.updatedAt)).getTime();
    return Number.isFinite(updated)
      ? Date.now() - updated > OVERDUE_AFTER_MS
      : false;
  }

  private async linkAttachments(
    files: Repository<TicketFileRow>,
    ticketId: number,
    attachmentIds: readonly string[] | undefined,
    uploaderId: string,
  ): Promise<void> {
    if (!attachmentIds || attachmentIds.length === 0) {
      return;
    }
    const unique = [...new Set(attachmentIds)].slice(0, 20);
    const timestamp = new Date();
    for (const id of unique) {
      const existing = await files.findOne({ filter: { id } });
      if (!existing) {
        throw new ItTicketError(
          400,
          'TICKET_INVALID_ATTACHMENT',
          'Attachment does not exist.',
        );
      }
      await files.updateOne({
        filter: { id },
        values: { ticketId, uploaderId, updatedAt: timestamp },
      });
    }
  }

  private async userViews(): Promise<ItUserView[]> {
    const users = await this.database!.repository<UserRow>('user')
      .findMany({ sort: (sort) => [sort.field('createdAt').asc()] })
      .catch(() => [] as UserRow[]);
    const members = await this.team().findMany({});
    const roots = new Set(await this.rootUserIds());
    const byUser = new Map(
      members.map((member) => [member.userId, member.role]),
    );

    return users.map((user) => ({
      userId: user.id,
      name: user.name || user.email,
      email: user.email,
      role:
        this.normalizeRole(byUser.get(user.id) ?? null) ??
        (roots.has(user.id) ? 'serviceDesk' : null),
    }));
  }

  private async loadUsers(
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) {
      return new Map();
    }
    const users = await this.database!.repository<UserRow>('user')
      .findMany({
        filter: (f) => f.or(unique.map((id) => f.string('id').eq(id))),
      })
      .catch(() => [] as UserRow[]);
    return new Map(users.map((user) => [user.id, user.name || user.email]));
  }

  private async rootUserIds(): Promise<string[]> {
    if (!this.authz) {
      return [];
    }
    try {
      const assignments = await this.authz.permissionSets.listAssignments(
        this.rootSet,
      );
      return assignments
        .filter((assignment) => assignment.subject.type === 'user')
        .map((assignment) => assignment.subject.id);
    } catch {
      return [];
    }
  }

  private async userIsRoot(userId: string): Promise<boolean> {
    if (!this.authz) {
      return false;
    }
    try {
      const sets = await this.authz.permissionSets.getEffective({
        principal: { type: 'user', id: userId },
      });
      return sets.some((set) => set.key === this.rootSet);
    } catch {
      return false;
    }
  }

  private async serviceDeskUserIds(): Promise<string[]> {
    const members = await this.team().findMany({
      filter: { role: 'serviceDesk' },
    });
    const ids = new Set(members.map((member) => member.userId));
    for (const userId of await this.rootUserIds()) {
      ids.add(userId);
    }
    return [...ids];
  }

  private urgencyLabel(urgency: string): string {
    switch (urgency) {
      case 'low':
        return '低/Low';
      case 'high':
        return '高/High';
      case 'urgent':
        return '紧急/Urgent';
      default:
        return '普通/Normal';
    }
  }

  private async notify(
    recipients: readonly string[],
    message: {
      idempotencyKey: string;
      title: string;
      body: string;
      path: string;
    },
  ): Promise<void> {
    const to = [...new Set(recipients)].filter(Boolean);
    if (to.length === 0) {
      return;
    }
    let service: NotificationService | undefined;
    try {
      service = this.container.resolve(notificationServiceToken);
    } catch {
      return;
    }
    await service
      .send({
        idempotencyKey: message.idempotencyKey,
        source: { type: 'itTicket' },
        messages: {
          inbox: {
            to,
            title: message.title,
            body: message.body,
            target: { type: 'route', path: message.path },
          },
        },
      })
      .catch(() => undefined);
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value === null || value === undefined ? null : toIso(value);
}
