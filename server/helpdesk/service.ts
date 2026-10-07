import type { Application } from '@nocobase/app-server/application';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import { databaseManagerToken, type DatabaseConnection } from '@nocobase/db';

import {
  isHelpdeskOverseer,
  resolveHelpdeskRole,
  type HelpdeskRole,
  type HelpdeskViewer,
} from './roles.js';

export { helpdeskServiceToken } from './tokens.js';

/** The lifecycle a ticket moves through. */
export type TicketStatus = 'pending' | 'processing' | 'resolved' | 'closed';
export type TicketUrgency = 'low' | 'normal' | 'high' | 'urgent';

export interface TicketLogView {
  readonly id: number;
  readonly action: string;
  readonly content: string | null;
  readonly authorId: string | null;
  readonly authorName: string | null;
  readonly createdAt: string;
}

export interface TicketView {
  readonly id: number;
  readonly ticketNo: string;
  readonly title: string;
  readonly description: string;
  readonly urgency: string;
  readonly status: string;
  readonly reporterId: string;
  readonly reporterName: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly screenshot: string | null;
  readonly solution: string | null;
  readonly lastRejectedReason: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly overdue: boolean;
  readonly logs?: readonly TicketLogView[];
}

export interface TicketStats {
  readonly total: number;
  readonly pending: number;
  readonly processing: number;
  readonly resolved: number;
  readonly closed: number;
  readonly overdue: number;
  readonly engineerWorkload: readonly {
    readonly userId: string;
    readonly name: string;
    readonly open: number;
    readonly resolved: number;
  }[];
}

export interface TicketListQuery {
  readonly status?: string;
  readonly urgency?: string;
  readonly overdue?: boolean;
  readonly q?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description: string;
  readonly urgency?: string;
  readonly screenshot?: string | null;
}

type RawTicket = {
  readonly id: number;
  readonly ticketNo: string;
  readonly title: string;
  readonly description: string;
  readonly urgency: string;
  readonly status: string;
  readonly reporterId: string;
  readonly reporterName: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly screenshot: string | null;
  readonly solution: string | null;
  readonly lastRejectedReason: string | null;
  readonly resolvedAt: string | Date | null;
  readonly closedAt: string | Date | null;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
  readonly remindedAt: string | Date | null;
};

type RawLog = {
  readonly id: number;
  readonly action: string;
  readonly content: string | null;
  readonly authorId: string | null;
  readonly authorName: string | null;
  readonly createdAt: string | Date;
};

const OVERDUE_MS = 24 * 60 * 60 * 1000;

function toIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function isOpen(status: string): boolean {
  return status !== 'closed' && status !== 'resolved';
}

export class HelpdeskService {
  public constructor(private readonly app: Application) {}

  private get database() {
    return this.app.container.resolve(databaseManagerToken);
  }

  private connection(): DatabaseConnection {
    return this.database.connection('main');
  }

  /** The business role of a signed-in user, resolved from the profile or root assignment. */
  public async roleOf(userId: string): Promise<HelpdeskRole> {
    return resolveHelpdeskRole(this.connection(), userId);
  }

  public async listAssignableEngineers(): Promise<
    readonly { readonly id: string; readonly name: string }[]
  > {
    const rows = await this.connection()
      .query.selectFrom('helpdeskProfiles')
      .select(['userId', 'displayName'])
      .where('role', '=', 'engineer')
      .execute<{ userId: string; displayName: string | null }>();
    const engineers = await Promise.all(
      rows.map(async (row) => ({
        id: row.userId,
        name: await this.displayName(row.userId, row.displayName),
      })),
    );
    return engineers.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async displayName(
    userId: string,
    fallback: string | null,
  ): Promise<string> {
    if (fallback) return fallback;
    const user = await this.connection()
      .query.selectFrom('user')
      .select(['name', 'email'])
      .where('id', '=', userId)
      .executeTakeFirst<{ name: string | null; email: string | null }>();
    return user?.name ?? user?.email ?? userId;
  }

  private canSee(viewer: HelpdeskViewer, ticket: RawTicket): boolean {
    if (isHelpdeskOverseer(viewer.role)) return true;
    if (ticket.reporterId === viewer.userId) return true;
    if (viewer.role === 'engineer' && ticket.assigneeId === viewer.userId) {
      return true;
    }
    return false;
  }

  private async fetchTicket(id: number): Promise<RawTicket | undefined> {
    return this.connection()
      .query.selectFrom('helpDeskTickets')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<RawTicket>();
  }

  private toView(ticket: RawTicket): TicketView {
    const created = ticket.createdAt;
    const createdAt = toIso(created) ?? new Date().toISOString();
    const overdue =
      isOpen(ticket.status) &&
      Date.now() - new Date(createdAt).getTime() > OVERDUE_MS;
    return {
      id: ticket.id,
      ticketNo: ticket.ticketNo,
      title: ticket.title,
      description: ticket.description,
      urgency: ticket.urgency,
      status: ticket.status,
      reporterId: ticket.reporterId,
      reporterName: ticket.reporterName,
      assigneeId: ticket.assigneeId,
      assigneeName: ticket.assigneeName,
      screenshot: ticket.screenshot,
      solution: ticket.solution,
      lastRejectedReason: ticket.lastRejectedReason,
      resolvedAt: toIso(ticket.resolvedAt),
      closedAt: toIso(ticket.closedAt),
      createdAt,
      updatedAt: toIso(ticket.updatedAt) ?? createdAt,
      overdue,
    };
  }

  public async listTickets(
    viewer: HelpdeskViewer,
    query: TicketListQuery = {},
  ): Promise<{ data: TicketView[]; total: number }> {
    const connection = this.connection();
    let statement = connection.query.selectFrom('helpDeskTickets').selectAll();
    if (viewer.role === 'employee' && !isHelpdeskOverseer(viewer.role)) {
      statement = statement.where('reporterId', '=', viewer.userId);
    } else if (viewer.role === 'engineer') {
      statement = statement.where((eb) =>
        eb.or([
          eb('assigneeId', '=', viewer.userId),
          eb('reporterId', '=', viewer.userId),
        ]),
      );
    }
    const rows = await statement
      .orderBy('createdAt', 'desc')
      .execute<RawTicket>();

    // `overdue` is derived from the row's age and status, so it is applied to the
    // views rather than the SQL, keeping one definition of "overdue" (toView).
    let filtered = rows.map((row) => this.toView(row));
    if (query.status) {
      filtered = filtered.filter((row) => row.status === query.status);
    }
    if (query.urgency) {
      filtered = filtered.filter((row) => row.urgency === query.urgency);
    }
    if (query.overdue !== undefined) {
      filtered = filtered.filter((row) => row.overdue === query.overdue);
    }
    if (query.q) {
      const needle = query.q.trim().toLowerCase();
      if (needle) {
        filtered = filtered.filter(
          (row) =>
            row.title.toLowerCase().includes(needle) ||
            row.ticketNo.toLowerCase().includes(needle) ||
            row.description.toLowerCase().includes(needle),
        );
      }
    }

    const total = filtered.length;
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Math.trunc(query.pageSize ?? 20)),
    );
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);
    return { data, total };
  }

  public async getTicket(
    viewer: HelpdeskViewer,
    id: number,
  ): Promise<TicketView | undefined> {
    const ticket = await this.fetchTicket(id);
    if (!ticket || !this.canSee(viewer, ticket)) return undefined;
    const logs = await this.connection()
      .query.selectFrom('helpDeskTicketLogs')
      .selectAll()
      .where('ticketId', '=', id)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .execute<RawLog>();
    return {
      ...this.toView(ticket),
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        content: log.content,
        authorId: log.authorId,
        authorName: log.authorName,
        createdAt: toIso(log.createdAt) ?? '',
      })),
    };
  }

  private async nextTicketNo(): Promise<string> {
    const row = await this.connection()
      .query.selectFrom('helpDeskTickets')
      .select((eb) => [eb.fn.countAll<number>().as('count')])
      .executeTakeFirst<{ count: number | string }>();
    const count = Number(row?.count ?? 0) + 1;
    return 'HD-' + String(count).padStart(5, '0');
  }

  public async createTicket(
    viewer: HelpdeskViewer,
    input: CreateTicketInput,
  ): Promise<TicketView> {
    const connection = this.connection();
    const now = new Date();
    const ticketNo = await this.nextTicketNo();
    const inserted = await connection.query
      .insertInto('helpDeskTickets')
      .values({
        ticketNo,
        title: input.title,
        description: input.description,
        urgency: input.urgency ?? 'normal',
        status: 'pending',
        reporterId: viewer.userId,
        reporterName: viewer.name,
        assigneeId: null,
        assigneeName: null,
        screenshot: input.screenshot ?? null,
        solution: null,
        lastRejectedReason: null,
        resolvedAt: null,
        closedAt: null,
        remindedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const id = Number(inserted.insertId ?? inserted.rows?.[0]?.id);
    await this.addLog(connection, id, 'created', '提交了报修工单', {
      id: viewer.userId,
      name: viewer.name,
    });
    const ticket = await this.fetchTicket(id);
    await this.notifyServiceDesk(ticketNo, id, viewer.name);
    return this.toView(ticket as RawTicket);
  }

  private async addLog(
    connection: DatabaseConnection,
    ticketId: number,
    action: string,
    content: string | null,
    author: { id: string; name: string } | null,
  ): Promise<void> {
    await connection.query
      .insertInto('helpDeskTicketLogs')
      .values({
        ticketId,
        action,
        content,
        authorId: author?.id ?? null,
        authorName: author?.name ?? null,
        createdAt: new Date(),
      })
      .execute();
  }

  private async updateTicket(
    id: number,
    values: Record<string, unknown>,
  ): Promise<void> {
    await this.connection()
      .query.updateTable('helpDeskTickets')
      .set({ ...values, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  private async notify(
    userIds: readonly string[],
    title: string,
    body: string,
    ticketId: number,
    event: string,
  ): Promise<void> {
    const targets = userIds.filter(Boolean);
    if (!targets.length || !this.app.container.has(notificationServiceToken)) {
      return;
    }
    try {
      const notification = this.app.container.resolve(notificationServiceToken);
      await notification.send({
        idempotencyKey: `helpdesk-${event}-${ticketId}-${Date.now()}`,
        source: { type: 'helpdesk-ticket', referenceId: String(ticketId) },
        messages: {
          inbox: {
            to: targets,
            title,
            body,
            target: { type: 'route', path: `/tickets/${ticketId}` },
          },
        },
      });
    } catch (error) {
      console.warn(
        `[helpdesk] failed to send "${event}" notification for ticket ${ticketId}`,
        error,
      );
    }
  }

  private async notifyServiceDesk(
    ticketNo: string,
    ticketId: number,
    reporterName: string,
  ): Promise<void> {
    const profiles = await this.connection()
      .query.selectFrom('helpdeskProfiles')
      .select('userId')
      .where('role', '=', 'serviceDesk')
      .execute<{ userId: string }>();
    await this.notify(
      profiles.map((row) => row.userId),
      `新报修工单 ${ticketNo}`,
      `${reporterName} 提交了工单：${ticketNo}，请及时分派。`,
      ticketId,
      'created',
    );
  }

  public async assignTicket(
    viewer: HelpdeskViewer,
    id: number,
    assigneeId: string,
  ): Promise<TicketView | undefined> {
    const ticket = await this.fetchTicket(id);
    if (!ticket) return undefined;
    if (!isHelpdeskOverseer(viewer.role)) {
      throw new HelpdeskForbidden('只有服务台可以分派工单。');
    }
    if (ticket.status === 'closed') {
      throw new HelpdeskConflict('已关闭的工单不能再分派。');
    }
    const name = await this.displayName(assigneeId, null);
    await this.updateTicket(id, {
      assigneeId,
      assigneeName: name,
      status: 'processing',
    });
    await this.addLog(this.connection(), id, 'assigned', `分派给 ${name}`, {
      id: viewer.userId,
      name: viewer.name,
    });
    await this.notify(
      [assigneeId],
      `工单 ${ticket.ticketNo} 已分派给你`,
      `${viewer.name} 将工单 ${ticket.ticketNo} 分派给你，请及时处理。`,
      id,
      'assigned',
    );
    return this.toView((await this.fetchTicket(id)) as RawTicket);
  }

  private ensureAssignee(viewer: HelpdeskViewer, ticket: RawTicket): void {
    if (isHelpdeskOverseer(viewer.role)) return;
    if (viewer.role === 'engineer' && ticket.assigneeId === viewer.userId)
      return;
    throw new HelpdeskForbidden('只有被分派的工程师可以处理该工单。');
  }

  public async processTicket(
    viewer: HelpdeskViewer,
    id: number,
    content: string,
  ): Promise<TicketView | undefined> {
    const ticket = await this.fetchTicket(id);
    if (!ticket) return undefined;
    this.ensureAssignee(viewer, ticket);
    await this.updateTicket(id, { status: 'processing' });
    await this.addLog(this.connection(), id, 'processed', content, {
      id: viewer.userId,
      name: viewer.name,
    });
    await this.notify(
      [ticket.reporterId],
      `工单 ${ticket.ticketNo} 处理进展`,
      `${viewer.name} 更新了处理进展：${content}`,
      id,
      'processed',
    );
    return this.toView((await this.fetchTicket(id)) as RawTicket);
  }

  public async resolveTicket(
    viewer: HelpdeskViewer,
    id: number,
    solution: string,
  ): Promise<TicketView | undefined> {
    const ticket = await this.fetchTicket(id);
    if (!ticket) return undefined;
    this.ensureAssignee(viewer, ticket);
    await this.updateTicket(id, {
      status: 'resolved',
      solution,
      resolvedAt: new Date(),
    });
    await this.addLog(this.connection(), id, 'resolved', solution, {
      id: viewer.userId,
      name: viewer.name,
    });
    await this.notify(
      [ticket.reporterId],
      `工单 ${ticket.ticketNo} 已处理完成，请确认`,
      `${viewer.name} 提交了处理结果：${solution}`,
      id,
      'resolved',
    );
    return this.toView((await this.fetchTicket(id)) as RawTicket);
  }

  private ensureReporter(viewer: HelpdeskViewer, ticket: RawTicket): void {
    if (isHelpdeskOverseer(viewer.role)) return;
    if (ticket.reporterId === viewer.userId) return;
    throw new HelpdeskForbidden('只有提交人可以确认或退回该工单。');
  }

  public async confirmTicket(
    viewer: HelpdeskViewer,
    id: number,
  ): Promise<TicketView | undefined> {
    const ticket = await this.fetchTicket(id);
    if (!ticket) return undefined;
    this.ensureReporter(viewer, ticket);
    if (ticket.status !== 'resolved') {
      throw new HelpdeskConflict('只有已处理完成的工单可以确认关闭。');
    }
    await this.updateTicket(id, { status: 'closed', closedAt: new Date() });
    await this.addLog(
      this.connection(),
      id,
      'confirmed',
      '确认解决，工单关闭',
      {
        id: viewer.userId,
        name: viewer.name,
      },
    );
    if (ticket.assigneeId) {
      await this.notify(
        [ticket.assigneeId],
        `工单 ${ticket.ticketNo} 已确认关闭`,
        `${viewer.name} 确认工单已解决并关闭。`,
        id,
        'confirmed',
      );
    }
    return this.toView((await this.fetchTicket(id)) as RawTicket);
  }

  public async rejectTicket(
    viewer: HelpdeskViewer,
    id: number,
    reason: string,
  ): Promise<TicketView | undefined> {
    const ticket = await this.fetchTicket(id);
    if (!ticket) return undefined;
    this.ensureReporter(viewer, ticket);
    if (ticket.status !== 'resolved') {
      throw new HelpdeskConflict('只有已处理完成的工单可以退回继续处理。');
    }
    await this.updateTicket(id, {
      status: 'processing',
      lastRejectedReason: reason,
    });
    await this.addLog(this.connection(), id, 'rejected', reason, {
      id: viewer.userId,
      name: viewer.name,
    });
    if (ticket.assigneeId) {
      await this.notify(
        [ticket.assigneeId],
        `工单 ${ticket.ticketNo} 被退回`,
        `${viewer.name} 认为问题未解决：${reason}`,
        id,
        'rejected',
      );
    }
    return this.toView((await this.fetchTicket(id)) as RawTicket);
  }

  public async stats(viewer: HelpdeskViewer): Promise<TicketStats> {
    const connection = this.connection();
    let rows: RawTicket[];
    if (isHelpdeskOverseer(viewer.role)) {
      rows = await connection.query
        .selectFrom('helpDeskTickets')
        .selectAll()
        .execute<RawTicket>();
    } else if (viewer.role === 'engineer') {
      rows = await connection.query
        .selectFrom('helpDeskTickets')
        .selectAll()
        .where((eb) =>
          eb.or([
            eb('assigneeId', '=', viewer.userId),
            eb('reporterId', '=', viewer.userId),
          ]),
        )
        .execute<RawTicket>();
    } else {
      rows = await connection.query
        .selectFrom('helpDeskTickets')
        .selectAll()
        .where('reporterId', '=', viewer.userId)
        .execute<RawTicket>();
    }

    const views = rows.map((row) => this.toView(row));
    const count = (status: string): number =>
      views.filter((row) => row.status === status).length;

    let engineerWorkload: TicketStats['engineerWorkload'] = [];
    if (isHelpdeskOverseer(viewer.role)) {
      const profiles = await connection.query
        .selectFrom('helpdeskProfiles')
        .select(['userId', 'displayName'])
        .where('role', '=', 'engineer')
        .execute<{ userId: string; displayName: string | null }>();
      engineerWorkload = await Promise.all(
        profiles.map(async (profile) => ({
          userId: profile.userId,
          name: await this.displayName(profile.userId, profile.displayName),
          open: views.filter(
            (row) => row.assigneeId === profile.userId && isOpen(row.status),
          ).length,
          resolved: views.filter(
            (row) =>
              row.assigneeId === profile.userId && row.status === 'closed',
          ).length,
        })),
      );
    } else if (viewer.role === 'engineer') {
      engineerWorkload = [
        {
          userId: viewer.userId,
          name: viewer.name,
          open: views.filter(
            (row) => row.assigneeId === viewer.userId && isOpen(row.status),
          ).length,
          resolved: views.filter(
            (row) =>
              row.assigneeId === viewer.userId && row.status === 'closed',
          ).length,
        },
      ];
    }

    return {
      total: views.length,
      pending: count('pending'),
      processing: count('processing'),
      resolved: count('resolved'),
      closed: count('closed'),
      overdue: views.filter((row) => row.overdue).length,
      engineerWorkload,
    };
  }

  /**
   * Remind service desk when an open ticket has waited more than 24 hours. Marked after
   * sending so the same ticket is not announced on every run; a later run re-reminds only
   * once another 24 hours have passed.
   */
  public async remindOverdueTickets(): Promise<number> {
    const connection = this.connection();
    const cutoff = Date.now() - OVERDUE_MS;
    const rows = await connection.query
      .selectFrom('helpDeskTickets')
      .selectAll()
      .where('status', 'in', ['pending', 'processing'])
      .execute<RawTicket>();
    const overdue = rows.filter((row) => {
      const createdAt = new Date(toIso(row.createdAt) ?? 0).getTime();
      if (createdAt > cutoff) return false;
      const reminded = row.remindedAt
        ? new Date(toIso(row.remindedAt) ?? 0).getTime()
        : 0;
      return requestedSince(reminded, cutoff);
    });
    if (!overdue.length) return 0;

    const profiles = await connection.query
      .selectFrom('helpdeskProfiles')
      .select('userId')
      .where('role', '=', 'serviceDesk')
      .execute<{ userId: string }>();
    const recipients = profiles.map((row) => row.userId);
    for (const ticket of overdue) {
      await this.notify(
        recipients,
        `工单超时提醒 ${ticket.ticketNo}`,
        `工单 ${ticket.ticketNo} 已超过 24 小时仍未解决，请关注。`,
        ticket.id,
        'overdue',
      );
      await this.updateTicket(ticket.id, { remindedAt: new Date() });
    }
    return overdue.length;
  }
}

/** A ticket transition refused because the caller's role may not perform it. */
export class HelpdeskForbidden extends Error {}
/** A ticket transition refused because the ticket is not in the required state. */
export class HelpdeskConflict extends Error {}

/** True when a previous reminder happened before the current overdue window began. */
function requestedSince(remindedAt: number, cutoff: number): boolean {
  return remindedAt === 0 || remindedAt < cutoff;
}
