import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import type { FilterBuilder, FilterNode } from '@nocobase/repository-input';
import { createServiceToken } from '@nocobase/service-provider';
import {
  EMPLOYEE_PERMISSION_SET,
  ENGINEER_PERMISSION_SET,
  SERVICE_DESK_PERMISSION_SET,
} from './permission-sets.js';

/** The service the ticket routes and the overdue reminder both use. */
export const ticketServiceToken =
  createServiceToken<TicketService>('itsm.tickets');

export const TICKET_COLLECTION = 'serviceTickets';
export const TICKET_LOG_COLLECTION = 'serviceTicketLogs';
export const TICKET_FILE_COLLECTION = 'serviceTicketFiles';
/** Where the file exposure serves a screenshot's bytes. */
export const TICKET_ATTACHMENT_PATH = '/uploads/tickets';
export const TICKET_ATTACHMENT_REPOSITORY = 'ticketAttachments';
export const NOTIFICATION_CHANNEL = 'inbox';
/** How long a ticket may stay open before the service desk is reminded. */
export const OVERDUE_AFTER_MS = 24 * 60 * 60 * 1000;

export const TICKET_STATUSES = [
  'pending',
  'processing',
  'resolved',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_URGENCIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TicketUrgency = (typeof TICKET_URGENCIES)[number];

/** Which of the three service-desk roles a caller holds. */
export type TicketRole = 'employee' | 'engineer' | 'service-desk';

export interface TicketActor {
  readonly id: string;
  readonly name: string;
  readonly role: TicketRole;
}

export interface ServiceTicketRecord {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly urgency: string;
  readonly status: string;
  readonly requesterId: string;
  readonly requesterName: string | null;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly resolution: string | null;
  readonly screenshotIds: unknown;
  readonly submittedAt: string;
  readonly assignedAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly reminderSentAt: string | null;
  readonly lastReturnedAt: string | null;
  readonly returnCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServiceTicketLogRecord {
  readonly id: number;
  readonly ticketId: number;
  readonly authorId: string | null;
  readonly authorName: string | null;
  readonly kind: string;
  readonly content: string;
  readonly createdAt: string;
}

export interface TicketScreenshot {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface TicketLogView {
  readonly id: number;
  readonly kind: string;
  readonly content: string;
  readonly authorId: string | null;
  readonly authorName: string | null;
  readonly createdAt: string;
}

export interface TicketView {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly urgency: TicketUrgency;
  readonly status: TicketStatus;
  readonly requesterId: string;
  readonly requesterName: string | null;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly resolution: string | null;
  readonly screenshots: readonly TicketScreenshot[];
  readonly submittedAt: string;
  readonly assignedAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly lastReturnedAt: string | null;
  readonly returnCount: number;
  readonly overdue: boolean;
  readonly updatedAt: string;
}

export interface TicketDetail extends TicketView {
  readonly logs: readonly TicketLogView[];
}

export interface TicketListQuery {
  readonly status?: TicketStatus;
  readonly urgency?: TicketUrgency;
  readonly assigneeId?: string;
  readonly requesterId?: string;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface TicketListResult {
  readonly items: readonly TicketView[];
  readonly total: number;
}

export interface DashboardSummary {
  readonly role: TicketRole;
  readonly pendingAssignment: readonly TicketView[];
  readonly overdue: readonly TicketView[];
  readonly workloads: readonly {
    readonly engineerId: string;
    readonly engineerName: string;
    readonly active: number;
    readonly resolved: number;
  }[];
}

export interface EngineerOption {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description: string;
  readonly urgency: TicketUrgency;
  readonly screenshotIds?: readonly string[];
}

export type TicketErrorCode =
  | 'TICKET_NOT_FOUND'
  | 'TICKET_FORBIDDEN'
  | 'TICKET_INVALID_STATE'
  | 'TICKET_INVALID_INPUT';

/** A domain failure the route translates into the API's error body. */
export class TicketError extends Error {
  constructor(
    readonly code: TicketErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TicketError';
  }
}

type TicketFilterBuilder = FilterBuilder<ServiceTicketRecord>;

function toStatus(value: string): TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value)
    ? (value as TicketStatus)
    : 'pending';
}

function toUrgency(value: string): TicketUrgency {
  return (TICKET_URGENCIES as readonly string[]).includes(value)
    ? (value as TicketUrgency)
    : 'medium';
}

function decodeIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === 'string')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isOverdue(record: ServiceTicketRecord, now: number): boolean {
  if (record.status === 'resolved' || record.status === 'closed') return false;
  const submitted = Date.parse(record.submittedAt);
  return Number.isFinite(submitted) && now - submitted > OVERDUE_AFTER_MS;
}

export class TicketService {
  constructor(private readonly app: Application) {}

  private get database(): DatabaseManager {
    return this.app.container.resolve(databaseManagerToken);
  }

  private get authz(): AppAuthorization {
    return this.app.container.resolve(authorizationToken);
  }

  private tickets() {
    return this.database.repository<ServiceTicketRecord>(TICKET_COLLECTION);
  }

  private logs() {
    return this.database.repository<ServiceTicketLogRecord>(
      TICKET_LOG_COLLECTION,
    );
  }

  /**
   * The role a signed-in user acts as. Unrestricted access is the dispatcher;
   * otherwise the highest Role Permission Set the user holds wins, and a user
   * with none is an ordinary employee.
   */
  async resolveRole(principalId: string): Promise<TicketRole> {
    const authz = this.authz;
    const identity = { principal: { type: 'user', id: principalId } };
    const context = authz.for(identity);
    const snapshot = await context.snapshot();
    if (snapshot.unrestricted) return 'service-desk';
    const sets = await authz.permissionSets.getEffective(identity);
    const keys = new Set(sets.map((entry) => entry.key));
    if (keys.has(SERVICE_DESK_PERMISSION_SET)) return 'service-desk';
    if (keys.has(ENGINEER_PERMISSION_SET)) return 'engineer';
    return 'employee';
  }

  /**
   * The part of a query that keeps a caller inside the tickets their role may
   * see: everything for the dispatcher, assigned-or-raised for an engineer,
   * and only what they raised for an employee.
   */
  private scopeNode(
    f: TicketFilterBuilder,
    principalId: string,
    role: TicketRole,
  ): FilterNode | undefined {
    if (role === 'service-desk') return undefined;
    if (role === 'engineer') {
      return f.or([
        f.string('assigneeId').eq(principalId),
        f.string('requesterId').eq(principalId),
      ]);
    }
    return f.string('requesterId').eq(principalId);
  }

  private inScope(
    principalId: string,
    role: TicketRole,
  ): ((f: TicketFilterBuilder) => FilterNode) | undefined {
    if (role === 'service-desk') return undefined;
    return (f) => {
      const node = this.scopeNode(f, principalId, role);
      return node ?? f.string('requesterId').eq(principalId);
    };
  }

  private async load(
    actor: TicketActor,
    ticketId: number,
  ): Promise<ServiceTicketRecord> {
    const filter = (f: TicketFilterBuilder): FilterNode => {
      const idNode = f.number('id').eq(ticketId);
      const scope = this.scopeNode(f, actor.id, actor.role);
      return scope ? f.and([idNode, scope]) : idNode;
    };
    const record = await this.tickets().findOne({ filter });
    if (!record) {
      throw new TicketError(
        'TICKET_NOT_FOUND',
        `No ticket has id ${ticketId}.`,
      );
    }
    return record;
  }

  private assertAssignee(
    actor: TicketActor,
    record: ServiceTicketRecord,
  ): void {
    if (actor.role === 'service-desk') return;
    if (record.assigneeId !== actor.id) {
      throw new TicketError(
        'TICKET_FORBIDDEN',
        `Ticket ${record.id} is not assigned to this user.`,
      );
    }
  }

  private assertRequester(
    actor: TicketActor,
    record: ServiceTicketRecord,
  ): void {
    if (record.requesterId !== actor.id) {
      throw new TicketError(
        'TICKET_FORBIDDEN',
        `Ticket ${record.id} was not raised by this user.`,
      );
    }
  }

  private async screenshotsFor(
    records: readonly ServiceTicketRecord[],
  ): Promise<Map<string, TicketScreenshot>> {
    const ids = new Set<string>();
    for (const record of records) {
      for (const id of decodeIds(record.screenshotIds)) ids.add(id);
    }
    const result = new Map<string, TicketScreenshot>();
    if (ids.size === 0) return result;
    const files = await this.database
      .repository<{
        id: string;
        filename: string;
        ext: string;
        mimeType: string;
        size: number;
      }>(TICKET_FILE_COLLECTION)
      .findMany({
        filter: (f) => f.or([...ids].map((id) => f.string('id').eq(id))),
      });
    for (const file of files) {
      result.set(file.id, {
        id: file.id,
        filename: file.filename,
        ext: file.ext,
        mimeType: file.mimeType,
        size: Number(file.size),
      });
    }
    return result;
  }

  private toView(
    record: ServiceTicketRecord,
    files: ReadonlyMap<string, TicketScreenshot>,
    now: number,
  ): TicketView {
    const screenshots = decodeIds(record.screenshotIds)
      .map((id) => files.get(id))
      .filter((entry): entry is TicketScreenshot => entry !== undefined);
    return {
      id: record.id,
      title: record.title,
      description: record.description,
      urgency: toUrgency(record.urgency),
      status: toStatus(record.status),
      requesterId: record.requesterId,
      requesterName: record.requesterName,
      assigneeId: record.assigneeId,
      assigneeName: record.assigneeName,
      resolution: record.resolution,
      screenshots,
      submittedAt: record.submittedAt,
      assignedAt: record.assignedAt,
      resolvedAt: record.resolvedAt,
      closedAt: record.closedAt,
      lastReturnedAt: record.lastReturnedAt,
      returnCount: record.returnCount,
      overdue: isOverdue(record, now),
      updatedAt: record.updatedAt,
    };
  }

  private async views(
    records: readonly ServiceTicketRecord[],
  ): Promise<readonly TicketView[]> {
    const files = await this.screenshotsFor(records);
    const now = Date.now();
    return records.map((record) => this.toView(record, files, now));
  }

  private async logViews(ticketId: number): Promise<readonly TicketLogView[]> {
    const rows = await this.logs().findMany({
      filter: { ticketId },
      sort: (s) => s.field('createdAt').asc(),
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      content: row.content,
      authorId: row.authorId,
      authorName: row.authorName,
      createdAt: row.createdAt,
    }));
  }

  private async appendLog(
    ticketId: number,
    actor: TicketActor,
    kind: string,
    content: string,
  ): Promise<void> {
    await this.logs().createOne({
      values: {
        ticketId,
        authorId: actor.id,
        authorName: actor.name,
        kind,
        content,
        createdAt: new Date().toISOString(),
      },
    });
  }

  private async detail(record: ServiceTicketRecord): Promise<TicketDetail> {
    const [view] = await this.views([record]);
    if (!view) {
      throw new TicketError('TICKET_NOT_FOUND', 'The ticket disappeared.');
    }
    return { ...view, logs: await this.logViews(record.id) };
  }

  async create(
    actor: TicketActor,
    input: CreateTicketInput,
  ): Promise<TicketDetail> {
    const now = new Date().toISOString();
    const { record } = await this.tickets().createOne({
      values: {
        title: input.title,
        description: input.description,
        urgency: input.urgency,
        status: 'pending',
        requesterId: actor.id,
        requesterName: actor.name,
        assigneeId: null,
        assigneeName: null,
        resolution: null,
        screenshotIds: [...(input.screenshotIds ?? [])],
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
    await this.appendLog(record.id, actor, 'submit', 'Ticket submitted.');
    await this.notifyServiceDesk(
      `itsm-submit-${record.id}`,
      'New service ticket',
      `${actor.name} submitted "${record.title}".`,
      record.id,
    );
    return this.detail(record);
  }

  async list(
    actor: TicketActor,
    query: TicketListQuery,
  ): Promise<TicketListResult> {
    const filter = (f: TicketFilterBuilder): FilterNode => {
      const items: FilterNode[] = [];
      const scope = this.scopeNode(f, actor.id, actor.role);
      if (scope) items.push(scope);
      if (query.status) items.push(f.string('status').eq(query.status));
      if (query.urgency) items.push(f.string('urgency').eq(query.urgency));
      if (query.assigneeId) {
        items.push(f.string('assigneeId').eq(query.assigneeId));
      }
      if (query.requesterId) {
        items.push(f.string('requesterId').eq(query.requesterId));
      }
      if (query.search) {
        const term = query.search;
        items.push(
          f.or([
            f.string('title').includes(term),
            f.string('description').includes(term),
          ]),
        );
      }
      return items.length === 1 ? items[0] : f.and(items);
    };
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const [rows, total] = await Promise.all([
      this.tickets().findMany({
        filter,
        sort: (s) => s.field('submittedAt').desc(),
        limit,
        offset,
      }),
      this.tickets().count({ filter }),
    ]);
    return { items: await this.views(rows), total };
  }

  async get(actor: TicketActor, ticketId: number): Promise<TicketDetail> {
    return this.detail(await this.load(actor, ticketId));
  }

  /** Assigns by user id, checking the id names an assignable engineer. */
  async assignById(
    actor: TicketActor,
    ticketId: number,
    assigneeId: string,
  ): Promise<TicketDetail> {
    const engineers = await this.listEngineers();
    const found = engineers.find((engineer) => engineer.id === assigneeId);
    if (!found) {
      throw new TicketError(
        'TICKET_INVALID_INPUT',
        `No engineer has id ${assigneeId}.`,
      );
    }
    return this.assign(actor, ticketId, { id: found.id, name: found.name });
  }

  async assign(
    actor: TicketActor,
    ticketId: number,
    assignee: { id: string; name: string },
  ): Promise<TicketDetail> {
    const record = await this.load(actor, ticketId);
    if (actor.role !== 'service-desk') {
      throw new TicketError(
        'TICKET_FORBIDDEN',
        'Only the service desk may assign a ticket.',
      );
    }
    if (record.status === 'closed') {
      throw new TicketError(
        'TICKET_INVALID_STATE',
        'A closed ticket cannot be reassigned.',
      );
    }
    const now = new Date().toISOString();
    const { record: updated } = await this.tickets().updateOne({
      filter: { id: ticketId },
      values: {
        assigneeId: assignee.id,
        assigneeName: assignee.name,
        status: 'processing',
        assignedAt: record.assignedAt ?? now,
        resolvedAt: null,
        updatedAt: now,
      },
    });
    await this.appendLog(
      ticketId,
      actor,
      'assign',
      `Assigned to ${assignee.name}.`,
    );
    await this.notify(
      [assignee.id],
      `itsm-assign-${ticketId}-${assignee.id}`,
      'Ticket assigned to you',
      `"${updated.title}" is now assigned to you.`,
      ticketId,
    );
    return this.detail(updated);
  }

  async process(
    actor: TicketActor,
    ticketId: number,
    content: string,
  ): Promise<TicketDetail> {
    const record = await this.load(actor, ticketId);
    this.assertAssignee(actor, record);
    if (record.status !== 'processing') {
      throw new TicketError(
        'TICKET_INVALID_STATE',
        'Only a ticket in handling can record processing updates.',
      );
    }
    const now = new Date().toISOString();
    await this.appendLog(ticketId, actor, 'process', content);
    const { record: updated } = await this.tickets().updateOne({
      filter: { id: ticketId },
      values: { updatedAt: now },
    });
    return this.detail(updated);
  }

  async resolve(
    actor: TicketActor,
    ticketId: number,
    resolution: string,
  ): Promise<TicketDetail> {
    const record = await this.load(actor, ticketId);
    this.assertAssignee(actor, record);
    if (record.status !== 'processing') {
      throw new TicketError(
        'TICKET_INVALID_STATE',
        'Only a ticket in handling can be marked resolved.',
      );
    }
    const now = new Date().toISOString();
    const { record: updated } = await this.tickets().updateOne({
      filter: { id: ticketId },
      values: {
        status: 'resolved',
        resolution,
        resolvedAt: now,
        updatedAt: now,
      },
    });
    await this.appendLog(ticketId, actor, 'resolve', resolution);
    await this.notify(
      [record.requesterId],
      `itsm-resolve-${ticketId}`,
      'Your ticket has been resolved',
      `"${updated.title}" was resolved. Confirm to close it, or return it for more work.`,
      ticketId,
    );
    return this.detail(updated);
  }

  async confirm(actor: TicketActor, ticketId: number): Promise<TicketDetail> {
    const record = await this.load(actor, ticketId);
    this.assertRequester(actor, record);
    if (record.status !== 'resolved') {
      throw new TicketError(
        'TICKET_INVALID_STATE',
        'Only a resolved ticket can be confirmed.',
      );
    }
    const now = new Date().toISOString();
    const { record: updated } = await this.tickets().updateOne({
      filter: { id: ticketId },
      values: { status: 'closed', closedAt: now, updatedAt: now },
    });
    await this.appendLog(ticketId, actor, 'confirm', 'Resolution confirmed.');
    if (record.assigneeId) {
      await this.notify(
        [record.assigneeId],
        `itsm-confirm-${ticketId}`,
        'Ticket confirmed and closed',
        `"${updated.title}" was confirmed by the requester and is now closed.`,
        ticketId,
      );
    }
    return this.detail(updated);
  }

  async returnTicket(
    actor: TicketActor,
    ticketId: number,
    reason: string,
  ): Promise<TicketDetail> {
    const record = await this.load(actor, ticketId);
    this.assertRequester(actor, record);
    if (record.status !== 'resolved') {
      throw new TicketError(
        'TICKET_INVALID_STATE',
        'Only a resolved ticket can be returned.',
      );
    }
    const now = new Date().toISOString();
    const { record: updated } = await this.tickets().updateOne({
      filter: { id: ticketId },
      values: {
        status: 'processing',
        resolvedAt: null,
        lastReturnedAt: now,
        returnCount: record.returnCount + 1,
        updatedAt: now,
      },
    });
    await this.appendLog(ticketId, actor, 'return', reason);
    if (record.assigneeId) {
      await this.notify(
        [record.assigneeId],
        `itsm-return-${ticketId}-${updated.returnCount}`,
        'Ticket returned for more work',
        `"${updated.title}" was returned: ${reason}`,
        ticketId,
      );
    }
    return this.detail(updated);
  }

  async comment(
    actor: TicketActor,
    ticketId: number,
    content: string,
  ): Promise<TicketDetail> {
    const record = await this.load(actor, ticketId);
    void record;
    await this.appendLog(ticketId, actor, 'comment', content);
    const now = new Date().toISOString();
    const { record: updated } = await this.tickets().updateOne({
      filter: { id: ticketId },
      values: { updatedAt: now },
    });
    return this.detail(updated);
  }

  async dashboard(actor: TicketActor): Promise<DashboardSummary> {
    const scope = this.inScope(actor.id, actor.role);
    const [all, engineers] = await Promise.all([
      this.tickets().findMany({
        ...(scope ? { filter: scope } : {}),
        sort: (s) => s.field('submittedAt').asc(),
      }),
      this.listEngineers(),
    ]);
    const views = await this.views(all);
    const pendingAssignment = views.filter((view) => view.status === 'pending');
    const overdue = views.filter((view) => view.overdue);
    const workloads = engineers.map((engineer) => {
      let active = 0;
      let resolved = 0;
      for (const record of all) {
        if (record.assigneeId !== engineer.id) continue;
        if (record.status === 'processing') active += 1;
        else if (record.status === 'resolved') resolved += 1;
      }
      return {
        engineerId: engineer.id,
        engineerName: engineer.name,
        active,
        resolved,
      };
    });
    return { role: actor.role, pendingAssignment, overdue, workloads };
  }

  async listEngineers(): Promise<readonly EngineerOption[]> {
    const assignments = await this.authz.permissionSets.listAssignments(
      ENGINEER_PERMISSION_SET,
    );
    const ids = assignments
      .filter((assignment) => assignment.subject.type === 'user')
      .map((assignment) => assignment.subject.id);
    const users = await this.database
      .repository<{
        id: string;
        name: string | null;
        email: string | null;
      }>('user')
      .findMany({
        filter: (f) =>
          ids.length > 0
            ? f.and([
                f.date('disabledAt').empty(),
                f.or(ids.map((id) => f.string('id').eq(id))),
              ])
            : f.date('disabledAt').empty(),
        sort: (s) => s.field('name').asc(),
      });
    return users.map((user) => ({
      id: user.id,
      name: user.name ?? user.email ?? user.id,
      email: user.email ?? '',
    }));
  }

  /** Every user holding the dispatcher role, for the overdue reminder. */
  private async serviceDeskIds(): Promise<readonly string[]> {
    const assignments = await this.authz.permissionSets.listAssignments(
      SERVICE_DESK_PERMISSION_SET,
    );
    return assignments
      .filter((assignment) => assignment.subject.type === 'user')
      .map((assignment) => assignment.subject.id);
  }

  private async notifyServiceDesk(
    key: string,
    title: string,
    body: string,
    ticketId: number,
  ): Promise<void> {
    const recipients = await this.serviceDeskIds();
    if (recipients.length === 0) return;
    await this.notify(recipients, key, title, body, ticketId);
  }

  private async notify(
    recipients: readonly string[],
    idempotencyKey: string,
    title: string,
    body: string,
    ticketId: number,
  ): Promise<void> {
    const unique = [...new Set(recipients)].filter((id) => id.length > 0);
    if (unique.length === 0) return;
    const service =
      this.app.container.resolveIfCreated(notificationServiceToken) ??
      this.app.container.resolve(notificationServiceToken);
    await service.send({
      idempotencyKey,
      source: { type: 'itsm.ticket', referenceId: String(ticketId) },
      messages: {
        [NOTIFICATION_CHANNEL]: {
          to: unique,
          title,
          body,
          target: { type: 'route', path: `/tickets/${ticketId}` },
        },
      },
    });
  }

  /**
   * Sends the one reminder a ticket may receive per overdue period. Returns how
   * many reminders went out, which is what a test asserts on.
   */
  async runOverdueReminders(): Promise<number> {
    const now = Date.now();
    const cutoff = new Date(now - OVERDUE_AFTER_MS).toISOString();
    const rows = await this.tickets().findMany({
      filter: (f) =>
        f.and([
          f.or([
            f.string('status').eq('pending'),
            f.string('status').eq('processing'),
          ]),
          f.date('submittedAt').before(cutoff),
        ]),
    });
    const recipients = await this.serviceDeskIds();
    let sent = 0;
    for (const record of rows) {
      const lastSent = record.reminderSentAt
        ? Date.parse(record.reminderSentAt)
        : Number.NaN;
      if (Number.isFinite(lastSent) && now - lastSent < OVERDUE_AFTER_MS) {
        continue;
      }
      const stamp = new Date(now).toISOString().slice(0, 10);
      await this.notify(
        recipients,
        `itsm-overdue-${record.id}-${stamp}`,
        'Ticket unresolved for over 24 hours',
        `"${record.title}" has been unresolved for more than 24 hours.`,
        record.id,
      );
      await this.tickets().updateOne({
        filter: { id: record.id },
        values: { reminderSentAt: new Date(now).toISOString() },
      });
      sent += 1;
    }
    return sent;
  }
}

/** The role marker keys, exported so callers and tests need not repeat them. */
export const ITSM_ROLE_KEYS = {
  employee: EMPLOYEE_PERMISSION_SET,
  engineer: ENGINEER_PERMISSION_SET,
  serviceDesk: SERVICE_DESK_PERMISSION_SET,
} as const;
