/**
 * The ticket desk's domain service: everything the HTTP routes and the
 * lifecycle call, and nothing that knows about either.
 *
 * The routes translate its refusals into statuses and its `available`
 * transitions into buttons; the lifecycle calls {@link TicketDeskService.lifecycleServices}
 * for the two services its guards and effects need. Keeping the desk here
 * means the same rule — who may see a ticket, who may assign it — is stated
 * once and holds for a route, a guard and a job alike.
 */
import type {
  DatabaseConnection,
  FilterBuilder,
  FilterNode,
} from '@nocobase/db';
import { databaseManagerToken } from '@nocobase/db';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { Logger } from '@nocobase/logging';
import type { JsonObject, LifecycleRuntime } from '@nocobase/lifecycle';
import { LifecycleError } from '@nocobase/lifecycle';
import type { ServiceResolver } from '@nocobase/service-provider';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { i18nToken } from '@nocobase/app-server/i18n';
import { APP_NS, type Translator } from '@nocobase/i18n/server';

import {
  DEFAULT_REMIND_AFTER_MS,
  TICKET_LIFECYCLE,
  type TicketNotificationEvent,
  type TicketRecord,
  type TicketServices,
} from '../../lifecycles/ticket.js';
import type {
  TicketAttachmentRow,
  TicketAttachmentView,
  TicketCommentKind,
  TicketCommentRow,
  TicketCommentView,
  TicketContext,
  TicketDashboard,
  TicketDetail,
  TicketHistoryEntry,
  TicketListPage,
  TicketRow,
  TicketScope,
  TicketStaffMember,
  TicketStaffRole,
  TicketStaffRow,
  TicketState,
  TicketStatusFilter,
  TicketSummary,
  TicketUrgency,
  TicketUserOption,
  TicketWorkload,
} from '../../ticket-types.js';
import { isTicketStaffRole, isTicketUrgency } from '../../ticket-types.js';
import { ticketLifecycleRuntimeToken } from '../tokens.js';
import {
  attachmentKey,
  decodeAttachments,
  type AllowedAttachmentType,
} from './attachments.js';
import { notificationContent } from './copy.js';
import { TicketRefusal } from './errors.js';

/** Who is asking, and what they may do. */
export interface TicketViewer {
  readonly id: string;
  readonly name: string;
  readonly serviceDesk: boolean;
  readonly engineer: boolean;
  /** The application root, which runs the desk whether or not a staff row says so. */
  readonly root: boolean;
}

/** A viewer with the translator a detail view needs for its buttons. */
export interface TicketRequest {
  readonly viewer: TicketViewer;
  readonly translate: Translator;
}

export interface TicketListQuery {
  readonly scope?: TicketScope;
  readonly status?: TicketStatusFilter;
  readonly urgency?: TicketUrgency;
  readonly assigneeId?: string;
  readonly requesterId?: string;
  readonly q?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface TicketAttachmentInput {
  readonly filename?: unknown;
  readonly contentType?: unknown;
  readonly dataBase64?: unknown;
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description: string;
  readonly urgency: TicketUrgency;
  readonly attachments?: readonly TicketAttachmentInput[];
}

export interface TicketDeskServiceOptions {
  readonly resolve: ServiceResolver;
  /** The drive disk new screenshots go to; read lazily because configuration loads after registration. */
  readonly defaultDisk: () => string;
  readonly logger?: Logger;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const MAX_ATTACHMENTS_PER_TICKET = 5;

function toIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function nonEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asState(value: string): TicketState {
  if (
    value === 'pending' ||
    value === 'assigned' ||
    value === 'resolved' ||
    value === 'closed'
  ) {
    return value;
  }
  // A status the lifecycle does not know is a corrupted row, not a user error.
  return 'pending';
}

function asUrgency(value: string): TicketUrgency {
  return isTicketUrgency(value) ? value : 'normal';
}

function uniqueRecipients(values: readonly (string | null)[]): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

/**
 * The desk's service. One instance per application, registered by
 * `TicketDeskProvider`; every method is called from a route, a lifecycle
 * guard or a lifecycle effect.
 */
export class TicketDeskService {
  private readonly resolve: ServiceResolver;
  private readonly defaultDisk: () => string;
  private readonly logger?: Logger;

  constructor(options: TicketDeskServiceOptions) {
    this.resolve = options.resolve;
    this.defaultDisk = options.defaultDisk;
    this.logger = options.logger;
  }

  // ---------------------------------------------------------------- lifecycle

  /**
   * The services the lifecycle's guards, hooks and effects use.
   *
   * `handle` is the transaction the lifecycle is running in, or `undefined`
   * outside one — an effect runs after commit, when there is no transaction
   * left. On SQLite a read outside the open transaction would wait for it
   * forever, so a guard must read through the handle; `undefined` means the
   * root connection is free.
   */
  lifecycleServices(handle: unknown): TicketServices {
    return {
      isServiceDesk: (actorId) => this.isServiceDesk(actorId, handle),
      notify: (event, record, idempotencyKey) =>
        this.notify(event, record, idempotencyKey),
    };
  }

  // ------------------------------------------------------------------- staff

  /** Whether `actorId` runs the desk. A guard calls this with the transaction handle. */
  async isServiceDesk(actorId: string, handle?: unknown): Promise<boolean> {
    const staff = await this.connection(handle)
      .repository<TicketStaffRow>('ticketStaff')
      .findOne({ filter: { userId: actorId } });
    return staff?.role === 'serviceDesk';
  }

  /** The viewer's standing, from the staff registry. */
  async viewerFor(
    userId: string,
    name: string,
    root: boolean,
  ): Promise<TicketViewer> {
    const staff = await this.connection(undefined)
      .repository<TicketStaffRow>('ticketStaff')
      .findOne({ filter: { userId } });
    const role = staff?.role;
    return {
      id: userId,
      name,
      root,
      serviceDesk: root || role === 'serviceDesk',
      engineer: role === 'engineer',
    };
  }

  /** The viewer's standing as the client reads it, so a page renders only what it may do. */
  contextFor(viewer: TicketViewer): TicketContext {
    const role: TicketStaffRole | 'employee' = viewer.serviceDesk
      ? 'serviceDesk'
      : viewer.engineer
        ? 'engineer'
        : 'employee';
    return {
      userId: viewer.id,
      name: viewer.name,
      role,
      serviceDesk: viewer.serviceDesk,
      engineer: viewer.engineer,
      root: viewer.root,
    };
  }

  /**
   * Makes the application root a service-desk member once, so the person who
   * installs the application can hand out tickets before anybody else is on
   * the desk. Called by a route when the identity is unrestricted.
   */
  async ensureServiceDesk(userId: string, name: string): Promise<void> {
    const repository =
      this.connection(undefined).repository<TicketStaffRow>('ticketStaff');
    const existing = await repository.findOne({ filter: { userId } });
    if (existing) return;
    const now = new Date();
    try {
      await repository.createOne({
        values: {
          userId,
          role: 'serviceDesk',
          displayName: name,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (error) {
      // A concurrent request may have inserted the same userId; the unique
      // index is the arbiter, and the row we wanted is there either way.
      const raced = await repository.findOne({ filter: { userId } });
      if (!raced) throw error;
    }
  }

  /** Everyone on the desk, with the name the user table gives them. */
  async listStaff(): Promise<TicketStaffMember[]> {
    const rows = [
      ...(await this.connection(undefined)
        .repository<TicketStaffRow>('ticketStaff')
        .findMany({ sort: (sort) => sort.field('id').asc() })),
    ];
    const names = await this.userNames(rows.map((row) => row.userId));
    const members: TicketStaffMember[] = [];
    for (const row of rows) {
      if (!isTicketStaffRole(row.role)) continue;
      members.push({
        id: row.id,
        userId: row.userId,
        role: row.role,
        displayName:
          nonEmpty(row.displayName) || names.get(row.userId) || row.userId,
        userIdLabel: names.get(row.userId) ?? row.userId,
      });
    }
    return members;
  }

  /** Adds or changes one person's role. Only the desk itself does this. */
  async saveStaff(input: {
    readonly userId: unknown;
    readonly role: unknown;
    readonly displayName?: unknown;
  }): Promise<TicketStaffMember> {
    const userId = nonEmpty(input.userId);
    if (!userId) {
      throw new TicketRefusal({
        kind: 'invalid',
        reason: 'STAFF_USER_REQUIRED',
        messageKey: 'ticket.problem.staffUserRequired',
        problems: [
          { field: 'userId', messageKey: 'ticket.problem.staffUserRequired' },
        ],
      });
    }
    if (!isTicketStaffRole(input.role)) {
      throw new TicketRefusal({
        kind: 'invalid',
        reason: 'STAFF_ROLE_INVALID',
        messageKey: 'ticket.problem.staffRoleInvalid',
        problems: [
          { field: 'role', messageKey: 'ticket.problem.staffRoleInvalid' },
        ],
      });
    }
    const role: TicketStaffRole = input.role;
    const displayName = nonEmpty(input.displayName);
    const repository =
      this.connection(undefined).repository<TicketStaffRow>('ticketStaff');
    const existing = await repository.findOne({ filter: { userId } });
    const now = new Date();
    if (existing) {
      await repository.updateOne({
        filter: { id: existing.id },
        values: {
          role,
          displayName: displayName || existing.displayName,
          updatedAt: now,
        },
      });
    } else {
      await repository.createOne({
        values: {
          userId,
          role,
          displayName: displayName || null,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    const saved = await repository.findOne({ filter: { userId } });
    const names = await this.userNames([userId]);
    return {
      id: saved?.id ?? 0,
      userId,
      role,
      displayName: displayName || names.get(userId) || userId,
      userIdLabel: names.get(userId) ?? userId,
    };
  }

  /** Removes a person from the desk; they become an ordinary employee again. */
  async removeStaff(userId: string): Promise<void> {
    await this.connection(undefined)
      .repository<TicketStaffRow>('ticketStaff')
      .deleteOne({ filter: { userId } });
  }

  /** The users a desk may hand a ticket to, for the assignment picker. */
  async listUserOptions(): Promise<TicketUserOption[]> {
    const users = await this.connection(undefined)
      .repository<{
        id: string;
        name: string;
        username: string | null;
        email: string | null;
      }>('user')
      .findMany({ sort: (sort) => sort.field('name').asc(), limit: 500 });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username ?? null,
      email: user.email ?? null,
    }));
  }

  // ------------------------------------------------------------------ reads

  /** One page of the tickets `viewer` may see, narrowed by the query's filters. */
  async listTickets(
    viewer: TicketViewer,
    query: TicketListQuery,
  ): Promise<TicketListPage> {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(query.pageSize ?? DEFAULT_PAGE_SIZE)),
    );
    const status: TicketStatusFilter = query.status ?? 'open';
    const overdueThreshold = await this.overdueThreshold();
    const repository =
      this.connection(undefined).repository<TicketRow>('tickets');

    const buildFilter = (builder: FilterBuilder<TicketRow>): FilterNode => {
      const conditions = [
        ...this.scopeConditions(viewer, query.scope, builder),
        ...this.filterConditions(builder, query, status),
      ];
      return conditions.length === 1 ? conditions[0] : builder.and(conditions);
    };

    const [items, total] = await Promise.all([
      repository.findMany({
        filter: buildFilter,
        sort: (sort) => sort.field('createdAt').desc(),
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      repository.count({ filter: buildFilter }),
    ]);

    return {
      items: items.map((row) => this.toSummary(row, overdueThreshold)),
      total,
      page,
      pageSize,
    };
  }

  /** One ticket with its comments, screenshots, history and allowed buttons. */
  async getTicket(request: TicketRequest, id: number): Promise<TicketDetail> {
    const { viewer, translate } = request;
    const row = await this.requireTicket(id);
    this.assertCanSee(viewer, row);
    const [view, comments, attachments, overdueThreshold] = await Promise.all([
      this.lifecycleRuntime().view(TICKET_LIFECYCLE, id, { id: viewer.id }),
      this.listCommentRows(id),
      this.listAttachmentRows(id),
      this.overdueThreshold(),
    ]);
    const history: TicketHistoryEntry[] = view.history.transitions.map(
      (entry) => ({
        id: entry.id,
        transition: entry.transition,
        from: entry.from,
        to: entry.to,
        actorId: entry.actorId,
        at: toIso(entry.at) ?? '',
      }),
    );
    return {
      ...this.toSummary(row, overdueThreshold),
      version: view.version ?? 0,
      description: row.description,
      available: view.available.map((transition) => ({
        name: transition.name,
        title: translate(transition.title),
        to: transition.to,
        allowed: transition.allowed,
        blockers: transition.blockers.map((blocker) =>
          translate(blocker.message),
        ),
      })),
      comments: comments.map((comment) => this.toCommentView(comment)),
      attachments: attachments.map((attachment) =>
        this.toAttachmentView(attachment),
      ),
      history,
    };
  }

  /**
   * The home page: what waits for the desk, what has waited too long, and how
   * much each engineer carries. A viewer who is not on the desk sees only
   * their own tickets.
   */
  async dashboard(viewer: TicketViewer): Promise<TicketDashboard> {
    const repository =
      this.connection(undefined).repository<TicketRow>('tickets');
    const overdueThreshold = await this.overdueThreshold();
    const onDesk = viewer.serviceDesk || viewer.root;

    const [mineRows, assignedRows] = await Promise.all([
      repository.findMany({
        filter: (builder) =>
          builder.and([
            builder.string('requesterId').eq(viewer.id),
            builder.string('status').ne('closed'),
          ]),
        sort: (sort) => sort.field('createdAt').desc(),
        limit: 20,
      }),
      repository.findMany({
        filter: (builder) =>
          builder.and([
            builder.string('assigneeId').eq(viewer.id),
            builder.string('status').ne('closed'),
          ]),
        sort: (sort) => sort.field('createdAt').desc(),
        limit: 20,
      }),
    ]);

    const empty: TicketSummary[] = [];
    if (!onDesk) {
      return {
        serviceDesk: false,
        pending: empty,
        pendingCount: 0,
        overdue: empty,
        overdueCount: 0,
        workload: [],
        mine: mineRows.map((row) => this.toSummary(row, overdueThreshold)),
        assignedToMe: assignedRows.map((row) =>
          this.toSummary(row, overdueThreshold),
        ),
      };
    }

    const pendingFilter = (builder: FilterBuilder<TicketRow>): FilterNode =>
      builder.string('status').eq('pending');
    const overdueFilter = (builder: FilterBuilder<TicketRow>): FilterNode =>
      builder.and([
        builder.string('status').ne('closed'),
        builder.date('statusChangedAt').before(overdueThreshold),
      ]);

    const [pendingRows, overdueRows, pendingCount, overdueCount] =
      await Promise.all([
        repository.findMany({
          filter: pendingFilter,
          sort: (sort) => sort.field('createdAt').asc(),
          limit: 20,
        }),
        repository.findMany({
          filter: overdueFilter,
          sort: (sort) => sort.field('statusChangedAt').asc(),
          limit: 20,
        }),
        repository.count({ filter: pendingFilter }),
        repository.count({ filter: overdueFilter }),
      ]);

    return {
      serviceDesk: true,
      pending: pendingRows.map((row) => this.toSummary(row, overdueThreshold)),
      pendingCount,
      overdue: overdueRows.map((row) => this.toSummary(row, overdueThreshold)),
      overdueCount,
      workload: await this.workload(),
      mine: mineRows.map((row) => this.toSummary(row, overdueThreshold)),
      assignedToMe: assignedRows.map((row) =>
        this.toSummary(row, overdueThreshold),
      ),
    };
  }

  async listComments(
    viewer: TicketViewer,
    id: number,
  ): Promise<TicketCommentView[]> {
    const row = await this.requireTicket(id);
    this.assertCanSee(viewer, row);
    return (await this.listCommentRows(id)).map((comment) =>
      this.toCommentView(comment),
    );
  }

  async listAttachments(
    viewer: TicketViewer,
    id: number,
  ): Promise<TicketAttachmentView[]> {
    const row = await this.requireTicket(id);
    this.assertCanSee(viewer, row);
    return (await this.listAttachmentRows(id)).map((attachment) =>
      this.toAttachmentView(attachment),
    );
  }

  /** The bytes of one screenshot, after checking the viewer may see the ticket. */
  async readAttachment(
    viewer: TicketViewer,
    ticketId: number,
    attachmentId: number,
  ): Promise<{
    readonly attachment: TicketAttachmentRow;
    readonly bytes: Uint8Array;
  }> {
    const row = await this.requireTicket(ticketId);
    this.assertCanSee(viewer, row);
    const attachment = await this.connection(undefined)
      .repository<TicketAttachmentRow>('ticketAttachments')
      .findOne({ filter: { id: attachmentId, ticketId } });
    if (!attachment) {
      throw new TicketRefusal({
        kind: 'notFound',
        reason: 'ATTACHMENT_NOT_FOUND',
        messageKey: 'ticket.error.attachmentNotFound',
      });
    }
    const disk = this.drive().use(attachment.disk);
    const bytes = await disk.getBytes(attachment.key);
    return { attachment, bytes };
  }

  // ----------------------------------------------------------------- writes

  /** Reports an issue. Attachments are decoded and stored before the route answers. */
  async createTicket(
    request: TicketRequest,
    input: CreateTicketInput,
  ): Promise<TicketDetail> {
    const { viewer } = request;
    const title = nonEmpty(input.title);
    const description = nonEmpty(input.description);
    const problems: { field: string; messageKey: string }[] = [];
    if (!title) {
      problems.push({
        field: 'title',
        messageKey: 'ticket.problem.titleRequired',
      });
    }
    if (!description) {
      problems.push({
        field: 'description',
        messageKey: 'ticket.problem.descriptionRequired',
      });
    }
    if (!isTicketUrgency(input.urgency)) {
      problems.push({
        field: 'urgency',
        messageKey: 'ticket.problem.urgencyInvalid',
      });
    }
    if (problems.length > 0) {
      throw new TicketRefusal({
        kind: 'invalid',
        reason: 'TICKET_INPUT_INVALID',
        messageKey: 'ticket.problem.inputInvalid',
        problems,
      });
    }

    // Decoding before the transaction means a bad screenshot never creates a
    // ticket that would have to be undone.
    const attachments = decodeAttachments(input.attachments);
    const now = new Date();
    let createdId: number;
    try {
      const result = await this.lifecycleRuntime().create(
        TICKET_LIFECYCLE,
        {
          title,
          description,
          urgency: input.urgency,
          requesterId: viewer.id,
          requesterName: viewer.name,
          assigneeId: null,
          assigneeName: null,
          resolution: null,
          lastReason: null,
          assignedAt: null,
          resolvedAt: null,
          closedAt: null,
          remindedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        { actor: { id: viewer.id } },
      );
      createdId = Number(result.record.id);
    } catch (error) {
      throw this.toRefusal(error);
    }

    await this.storeAttachments(createdId, viewer.id, attachments);
    const record = this.toRecord(await this.requireTicket(createdId));
    // The desk hears about a new issue. The lifecycle's own log records the
    // creation, so this is the one send that is not an effect.
    await this.notify('created', record, `ticket:${createdId}:created`).catch(
      (error: unknown) => {
        this.logger?.error(
          { error, ticketId: createdId },
          'Ticket created notification failed',
        );
      },
    );
    return this.getTicket(request, createdId);
  }

  /** Posts a note in the handling process. */
  async addComment(
    viewer: TicketViewer,
    id: number,
    body: string,
  ): Promise<TicketCommentView> {
    const row = await this.requireTicket(id);
    this.assertCanSee(viewer, row);
    const text = nonEmpty(body);
    if (!text) {
      throw new TicketRefusal({
        kind: 'invalid',
        reason: 'COMMENT_REQUIRED',
        messageKey: 'ticket.problem.commentRequired',
        problems: [
          { field: 'body', messageKey: 'ticket.problem.commentRequired' },
        ],
      });
    }
    const created = await this.connection(undefined)
      .repository<TicketCommentRow>('ticketComments')
      .createOne({
        values: {
          ticketId: id,
          authorId: viewer.id,
          authorName: viewer.name,
          kind: 'comment' satisfies TicketCommentKind,
          body: text,
          createdAt: new Date(),
        },
      });
    return this.toCommentView(created.record);
  }

  /** Uploads screenshots to a ticket the viewer may see and that is still open. */
  async addAttachments(
    viewer: TicketViewer,
    id: number,
    values: readonly TicketAttachmentInput[],
  ): Promise<TicketAttachmentView[]> {
    const row = await this.requireTicket(id);
    this.assertCanSee(viewer, row);
    if (row.status === 'closed') {
      throw new TicketRefusal({
        kind: 'invalid',
        reason: 'TICKET_ATTACHMENTS_CLOSED',
        messageKey: 'ticket.problem.attachmentsClosed',
      });
    }
    const decoded = decodeAttachments(values);
    const existing = await this.listAttachmentRows(id);
    if (existing.length + decoded.length > MAX_ATTACHMENTS_PER_TICKET) {
      throw new TicketRefusal({
        kind: 'invalid',
        reason: 'TOO_MANY_ATTACHMENTS',
        messageKey: 'ticket.problem.tooManyAttachments',
        problems: [
          {
            field: 'attachments',
            messageKey: 'ticket.problem.tooManyAttachments',
          },
        ],
      });
    }
    const stored = await this.storeAttachments(id, viewer.id, decoded);
    return stored.map((attachment) => this.toAttachmentView(attachment));
  }

  /**
   * Fires one transition on behalf of the viewer. The lifecycle decides
   * whether the viewer may; the service only translates the result.
   */
  async fireTicket(
    request: TicketRequest,
    id: number,
    transition: string,
    input: JsonObject,
    options: { readonly version?: number; readonly requestId?: string } = {},
  ): Promise<TicketDetail> {
    const { viewer } = request;
    const row = await this.requireTicket(id);
    this.assertCanSee(viewer, row);
    try {
      await this.lifecycleRuntime().fire(TICKET_LIFECYCLE, id, transition, {
        actor: { id: viewer.id },
        manual: true,
        input,
        requestId: options.requestId,
        expect:
          typeof options.version === 'number'
            ? { version: options.version }
            : undefined,
      });
    } catch (error) {
      throw this.toRefusal(error);
    }
    return this.getTicket(request, id);
  }

  // --------------------------------------------------------------- internals

  private connection(handle: unknown): DatabaseConnection {
    if (handle && typeof handle === 'object') {
      return handle as DatabaseConnection;
    }
    return this.resolve.resolve(databaseManagerToken).connection();
  }

  private lifecycleRuntime(): LifecycleRuntime {
    return this.resolve.resolve(ticketLifecycleRuntimeToken);
  }

  private drive(): NocoBaseDriveManager {
    return this.resolve.resolve(driveManagerToken);
  }

  private async storeAttachments(
    ticketId: number,
    uploaderId: string,
    attachments: readonly {
      readonly filename: string;
      readonly mimeType: AllowedAttachmentType;
      readonly bytes: Uint8Array;
    }[],
  ): Promise<TicketAttachmentRow[]> {
    if (attachments.length === 0) return [];
    const diskName = this.defaultDisk();
    const disk = this.drive().use(diskName);
    const now = new Date();
    const stored: TicketAttachmentRow[] = [];
    for (const attachment of attachments) {
      const key = attachmentKey(ticketId, attachment.mimeType);
      await disk.put(key, attachment.bytes);
      const created = await this.connection(undefined)
        .repository<TicketAttachmentRow>('ticketAttachments')
        .createOne({
          values: {
            ticketId,
            uploaderId,
            disk: diskName,
            key,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.bytes.byteLength,
            createdAt: now,
          },
        });
      stored.push(created.record);
    }
    return stored;
  }

  private async requireTicket(id: number): Promise<TicketRow> {
    const row = await this.connection(undefined)
      .repository<TicketRow>('tickets')
      .findOne({ filter: { id } });
    if (!row) {
      throw new TicketRefusal({
        kind: 'notFound',
        reason: 'TICKET_NOT_FOUND',
        messageKey: 'ticket.error.notFound',
      });
    }
    return row;
  }

  private assertCanSee(viewer: TicketViewer, row: TicketRow): void {
    if (viewer.serviceDesk || viewer.root) return;
    if (row.requesterId === viewer.id) return;
    if (row.assigneeId === viewer.id) return;
    throw new TicketRefusal({
      kind: 'denied',
      reason: 'TICKET_FORBIDDEN',
      messageKey: 'ticket.error.forbidden',
    });
  }

  /**
   * The conditions that pick the tickets a viewer may list. Always at least
   * one, because a filter with no condition would return every ticket, and
   * `all` is refused to anyone who does not run the desk.
   */
  private scopeConditions(
    viewer: TicketViewer,
    scope: TicketScope | undefined,
    builder: FilterBuilder<TicketRow>,
  ): FilterNode[] {
    const requested = scope ?? 'default';
    if (requested === 'all') {
      if (!viewer.serviceDesk && !viewer.root) {
        throw new TicketRefusal({
          kind: 'denied',
          reason: 'TICKET_SCOPE_FORBIDDEN',
          messageKey: 'ticket.error.forbidden',
        });
      }
      // A real condition, so the `all` scope is not an unconditioned query.
      return [builder.number('id').gt(0)];
    }
    if (requested === 'assigned') {
      return [builder.string('assigneeId').eq(viewer.id)];
    }
    if (requested === 'reported') {
      return [builder.string('requesterId').eq(viewer.id)];
    }
    // `default`: the desk sees everything, an engineer sees what they were
    // handed or reported, and everyone else sees what they reported.
    if (viewer.serviceDesk || viewer.root) {
      return [builder.number('id').gt(0)];
    }
    if (viewer.engineer) {
      return [
        builder.or([
          builder.string('assigneeId').eq(viewer.id),
          builder.string('requesterId').eq(viewer.id),
        ]),
      ];
    }
    return [builder.string('requesterId').eq(viewer.id)];
  }

  private filterConditions(
    builder: FilterBuilder<TicketRow>,
    query: TicketListQuery,
    status: TicketStatusFilter,
  ): FilterNode[] {
    const conditions: FilterNode[] = [];
    if (status === 'open') {
      conditions.push(builder.string('status').ne('closed'));
    } else {
      conditions.push(builder.string('status').eq(status));
    }
    if (query.urgency) {
      conditions.push(builder.string('urgency').eq(query.urgency));
    }
    if (query.assigneeId) {
      conditions.push(builder.string('assigneeId').eq(query.assigneeId));
    }
    if (query.requesterId) {
      conditions.push(builder.string('requesterId').eq(query.requesterId));
    }
    const q = nonEmpty(query.q);
    if (q) {
      conditions.push(
        builder.or([
          builder.string('title').includes(q, { mode: 'insensitive' }),
          builder.text('description').includes(q, { mode: 'insensitive' }),
        ]),
      );
    }
    return conditions;
  }

  /** Every ticket in an open state longer than the reminder window is overdue. */
  private async overdueThreshold(): Promise<string> {
    return new Date(Date.now() - (await this.remindAfterMs())).toISOString();
  }

  private async remindAfterMs(): Promise<number> {
    try {
      const parameters = this.lifecycleRuntime().parameters(
        TICKET_LIFECYCLE,
      ) as { remindAfterMs?: number };
      return typeof parameters.remindAfterMs === 'number'
        ? parameters.remindAfterMs
        : DEFAULT_REMIND_AFTER_MS;
    } catch {
      return DEFAULT_REMIND_AFTER_MS;
    }
  }

  /** The lifecycle's own view of a ticket row: its state fields are the lifecycle's unions, not raw strings. */
  private toRecord(row: TicketRow): TicketRecord {
    return {
      ...row,
      status: asState(row.status),
      urgency: asUrgency(row.urgency),
      statusChangedAt: toIso(row.statusChangedAt) ?? '',
      assignedAt: toIso(row.assignedAt),
      resolvedAt: toIso(row.resolvedAt),
      closedAt: toIso(row.closedAt),
      remindedAt: toIso(row.remindedAt),
      createdAt: toIso(row.createdAt) ?? '',
      updatedAt: toIso(row.updatedAt) ?? '',
    };
  }

  private toSummary(row: TicketRow, overdueThreshold: string): TicketSummary {
    const status = asState(row.status);
    const statusChangedAt = toIso(row.statusChangedAt) ?? '';
    return {
      id: row.id,
      title: row.title,
      urgency: asUrgency(row.urgency),
      status,
      requesterId: row.requesterId,
      requesterName: row.requesterName,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName,
      resolution: row.resolution,
      lastReason: row.lastReason,
      assignedAt: toIso(row.assignedAt),
      resolvedAt: toIso(row.resolvedAt),
      closedAt: toIso(row.closedAt),
      createdAt: toIso(row.createdAt) ?? '',
      updatedAt: toIso(row.updatedAt) ?? '',
      statusChangedAt,
      overdue:
        status !== 'closed' &&
        statusChangedAt !== '' &&
        statusChangedAt < overdueThreshold,
    };
  }

  private toCommentView(row: TicketCommentRow): TicketCommentView {
    const kind: TicketCommentKind =
      row.kind === 'solution' || row.kind === 'reason' ? row.kind : 'comment';
    return {
      id: row.id,
      kind,
      authorId: row.authorId,
      authorName: row.authorName,
      body: row.body,
      createdAt: toIso(row.createdAt) ?? '',
    };
  }

  private toAttachmentView(row: TicketAttachmentRow): TicketAttachmentView {
    return {
      id: row.id,
      filename: row.filename,
      mimeType: row.mimeType,
      size: row.size,
      createdAt: toIso(row.createdAt) ?? '',
    };
  }

  private async listCommentRows(id: number): Promise<TicketCommentRow[]> {
    return [
      ...(await this.connection(undefined)
        .repository<TicketCommentRow>('ticketComments')
        .findMany({
          filter: { ticketId: id },
          sort: (sort) => sort.field('createdAt').asc(),
        })),
    ];
  }

  private async listAttachmentRows(id: number): Promise<TicketAttachmentRow[]> {
    return [
      ...(await this.connection(undefined)
        .repository<TicketAttachmentRow>('ticketAttachments')
        .findMany({
          filter: { ticketId: id },
          sort: (sort) => sort.field('createdAt').asc(),
        })),
    ];
  }

  private async workload(): Promise<TicketWorkload[]> {
    const staff = (await this.listStaff()).filter(
      (member) => member.role === 'engineer',
    );
    const repository =
      this.connection(undefined).repository<TicketRow>('tickets');
    return Promise.all(
      staff.map(async (member) => {
        const [active, resolved, closed] = await Promise.all([
          repository.count({
            filter: (builder) =>
              builder.and([
                builder.string('assigneeId').eq(member.userId),
                builder.string('status').eq('assigned'),
              ]),
          }),
          repository.count({
            filter: (builder) =>
              builder.and([
                builder.string('assigneeId').eq(member.userId),
                builder.string('status').eq('resolved'),
              ]),
          }),
          repository.count({
            filter: (builder) =>
              builder.and([
                builder.string('assigneeId').eq(member.userId),
                builder.string('status').eq('closed'),
              ]),
          }),
        ]);
        return {
          userId: member.userId,
          name: member.displayName,
          active,
          resolved,
          closed,
        };
      }),
    );
  }

  private async userNames(
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    // The filter builder has no `in`, so a bounded page is read and matched
    // by id; the staff table is small enough for this to be exact.
    const users = await this.connection(undefined)
      .repository<{ id: string; name: string }>('user')
      .findMany({ limit: 500 });
    return new Map(
      users.flatMap((user) =>
        unique.includes(user.id) ? [[user.id, user.name] as const] : [],
      ),
    );
  }

  /**
   * Turns the lifecycle's refusal into the desk's own, keeping its code and
   * what it said, so the route can pick the status and the client can branch.
   */
  private toRefusal(error: unknown): TicketRefusal {
    if (error instanceof TicketRefusal) return error;
    if (error instanceof LifecycleError) {
      const kind =
        error.code === 'INVALID_INPUT'
          ? 'invalid'
          : error.code === 'GUARD_REJECTED'
            ? 'denied'
            : error.code === 'RECORD_NOT_FOUND'
              ? 'notFound'
              : 'conflict';
      return new TicketRefusal({
        kind,
        reason: `LIFECYCLE_${error.code}`,
        messageKey: 'ticket.error.lifecycleRefused',
        problems: error.problems.map((problem) => ({
          field: problem.field,
          messageKey: problem.message,
        })),
      });
    }
    throw error;
  }

  /**
   * Delivers one event to everyone it concerns. A missing notification
   * service, or a delivery that throws, must not undo the transition that
   * caused it, so an effect's failure is caught by the effect machinery and
   * retried with the same idempotency key, which deduplicates it.
   */
  async notify(
    event: TicketNotificationEvent,
    record: TicketRecord,
    idempotencyKey: string,
  ): Promise<void> {
    const notification = this.resolve.resolve(notificationServiceToken);
    const recipients = await this.notificationRecipients(event, record);
    if (recipients.length === 0) return;

    const translate = await this.notificationTranslator();
    const content = notificationContent(translate, event, record);
    await notification.send({
      idempotencyKey: `${TICKET_LIFECYCLE}:${idempotencyKey}`,
      source: { type: 'ticket', referenceId: String(record.id) },
      messages: {
        inbox: {
          to: recipients.length === 1 ? recipients[0] : recipients,
          title: content.title,
          body: content.body,
          target: content.target,
        },
      },
    });
  }

  private async notificationRecipients(
    event: TicketNotificationEvent,
    record: TicketRecord,
  ): Promise<string[]> {
    if (event === 'assigned') {
      return uniqueRecipients([record.assigneeId]);
    }
    if (event === 'resolved') {
      return uniqueRecipients([record.requesterId]);
    }
    if (event === 'confirmed' || event === 'returned') {
      return uniqueRecipients([
        record.assigneeId,
        ...(await this.serviceDeskUserIds()),
      ]);
    }
    // `created` and `reminder` are for the desk.
    return this.serviceDeskUserIds();
  }

  private async serviceDeskUserIds(): Promise<string[]> {
    const staff = await this.connection(undefined)
      .repository<TicketStaffRow>('ticketStaff')
      .findMany({ filter: { role: 'serviceDesk' } });
    return uniqueRecipients(staff.map((row) => row.userId));
  }

  /** The translator outbound text is rendered with: the application's default language. */
  private async notificationTranslator(): Promise<Translator> {
    const i18n = this.resolve.resolve(i18nToken);
    const locale = i18n.getDefaultLocale();
    await i18n.ensureLocaleLoaded(locale);
    return i18n.getFixedT(APP_NS, locale);
  }
}
