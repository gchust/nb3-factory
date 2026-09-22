import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseConnection,
  type Row,
} from '@nocobase/db';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { notifyUser } from './service-notifications.js';
import { insertReturning, updateReturning } from './db.js';
import {
  canProcessTickets,
  isAssignableRegion,
  requireCapability,
  sharedTicketIds,
  ticketAccessible,
  ticketWritable,
  type ServiceCaller,
  type TicketScopeRow,
} from './service-auth.js';
import { asText } from './values.js';

export const TICKET_STATUSES = [
  'draft',
  'pending_dispatch',
  'in_progress',
  'pending_confirmation',
  'closed',
  'cancelled',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface TicketRow extends TicketScopeRow, Row {
  ticketNo: string;
  customerId: number;
  deviceId: number;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  source: string;
  externalEventId: string | null;
  processNotes: string | null;
  resolution: string | null;
  laborHours: number | null;
  dueAt: Date | string | null;
  submittedAt: Date | string | null;
  assignedAt: Date | string | null;
  startedAt: Date | string | null;
  closedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export class ServiceRuleError extends Error {
  public readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ServiceRuleError';
    this.status = status;
  }
}

function forbidden(message: string): never {
  throw new ServiceRuleError(message, 403);
}

export class TicketService {
  constructor(private readonly app: Application) {}

  private get database() {
    return this.app.container.resolve(databaseManagerToken);
  }

  private get query() {
    return this.database.query();
  }

  async findRaw(id: number): Promise<TicketRow | undefined> {
    return await this.query
      .selectFrom('serviceTickets')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async assertAccessible(
    caller: ServiceCaller,
    ticket: TicketRow,
  ): Promise<void> {
    const shared = await sharedTicketIds(this.database, caller.id);
    if (!(await ticketAccessible(caller, ticket, shared)))
      throw new ServiceRuleError('Ticket is not accessible', 404);
  }

  /** Applies the record-scope rule to a list and returns one page. */
  async list(
    caller: ServiceCaller,
    filters: {
      status?: string;
      region?: string;
      search?: string;
      assigneeId?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<{
    items: TicketRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    await requireCapability(caller, 'tickets.view');
    let query = this.query.selectFrom('serviceTickets').selectAll();
    if (filters.status) query = query.where('status', '=', filters.status);
    if (filters.region) query = query.where('region', '=', filters.region);
    if (filters.assigneeId)
      query = query.where('assigneeId', '=', filters.assigneeId);
    if (filters.search?.trim()) {
      const search = `%${filters.search.trim()}%`;
      query = query.where((builder) =>
        builder.or([
          builder('ticketNo', 'like', search),
          builder('title', 'like', search),
        ]),
      );
    }
    const all = (await query
      .orderBy('updatedAt', 'desc')
      .limit(500)
      .execute()) as unknown as TicketRow[];
    const shared = await sharedTicketIds(this.database, caller.id);
    const visible: TicketRow[] = [];
    for (const ticket of all) {
      if (await ticketAccessible(caller, ticket, shared)) visible.push(ticket);
    }
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const start = (page - 1) * pageSize;
    const items = visible.slice(start, start + pageSize);
    // A list row names its customer and device rather than showing bare ids.
    const customerIds = [...new Set(items.map((item) => item.customerId))];
    const deviceIds = [...new Set(items.map((item) => item.deviceId))];
    const customers = customerIds.length
      ? await this.query
          .selectFrom('serviceCustomers')
          .select(['id', 'name'])
          .where('id', 'in', customerIds)
          .execute()
      : [];
    const devices = deviceIds.length
      ? await this.query
          .selectFrom('serviceDevices')
          .select(['id', 'code', 'name'])
          .where('id', 'in', deviceIds)
          .execute()
      : [];
    const customerById = new Map(customers.map((item) => [item.id, item.name]));
    const deviceById = new Map(devices.map((item) => [item.id, item]));
    return {
      items: items.map((ticket) => ({
        ...ticket,
        customerName: customerById.get(ticket.customerId) ?? null,
        deviceName: deviceById.get(ticket.deviceId)?.name ?? null,
        deviceCode: deviceById.get(ticket.deviceId)?.code ?? null,
      })),
      total: visible.length,
      page,
      pageSize,
    };
  }

  /** Full detail with logs, files and shares; callers receive only allowed fields. */
  async detail(caller: ServiceCaller, id: number) {
    const ticket = await this.findRaw(id);
    if (!ticket) throw new ServiceRuleError('Ticket not found', 404);
    await this.assertAccessible(caller, ticket);
    const logs = await this.query
      .selectFrom('serviceTicketLogs')
      .selectAll()
      .where('ticketId', '=', id)
      .orderBy('createdAt', 'asc')
      .execute();
    const ticketFiles = await this.query
      .selectFrom('serviceTicketFiles')
      .selectAll()
      .where('ticketId', '=', id)
      .execute();
    const fileIds = ticketFiles.map((row) => String(row.fileId));
    const files = fileIds.length
      ? await this.query
          .selectFrom('serviceFiles')
          .selectAll()
          .where('id', 'in', fileIds)
          .execute()
      : [];
    const shares = await this.query
      .selectFrom('serviceTicketShares')
      .selectAll()
      .where('ticketId', '=', id)
      .execute();
    const device = await this.query
      .selectFrom('serviceDevices')
      .selectAll()
      .where('id', '=', ticket.deviceId)
      .executeTakeFirst();
    const customer = await this.query
      .selectFrom('serviceCustomers')
      .selectAll()
      .where('id', '=', ticket.customerId)
      .executeTakeFirst();
    return {
      ticket: this.serialize(caller, ticket),
      logs,
      files,
      shares,
      device,
      customer,
    };
  }

  /** Hides labor cost from callers who cannot process tickets. */
  serialize(caller: ServiceCaller, ticket: TicketRow) {
    if (caller.capabilities['tickets.process']) return ticket;
    const { laborHours: _laborHours, ...rest } = ticket;
    return rest;
  }

  async create(
    caller: ServiceCaller,
    input: {
      customerId: number;
      deviceId: number;
      title: string;
      description?: string;
      priority?: string;
      confidential?: boolean;
      submit?: boolean;
      source?: string;
      externalEventId?: string;
      reporterName?: string;
    },
  ): Promise<TicketRow> {
    await requireCapability(caller, 'tickets.create');
    if (!input.title?.trim()) throw new ServiceRuleError('Title is required');
    const device = await this.query
      .selectFrom('serviceDevices')
      .select('id')
      .select('region')
      .select('customerId')
      .where('id', '=', input.deviceId)
      .executeTakeFirst();
    if (!device) throw new ServiceRuleError('Device not found', 404);
    if (Number(device.customerId) !== Number(input.customerId))
      throw new ServiceRuleError('Device does not belong to the customer');

    if (input.externalEventId) {
      const existing = await this.query
        .selectFrom('serviceTickets')
        .selectAll()
        .where('externalEventId', '=', input.externalEventId)
        .executeTakeFirst();
      if (existing) return existing as unknown as TicketRow;
    }

    const status: TicketStatus = input.submit ? 'pending_dispatch' : 'draft';
    const now = new Date();
    const source = input.source ?? 'manual';
    return await this.database.transaction(async (connection) => {
      const ticketNo = await this.nextTicketNo(connection, now);
      const inserted = await insertReturning<TicketRow>(
        connection.query,
        'serviceTickets',
        {
          ticketNo,
          customerId: input.customerId,
          deviceId: input.deviceId,
          title: input.title.trim(),
          description: input.description ?? null,
          priority: input.priority ?? 'normal',
          status,
          region: String(device.region),
          assigneeId: null,
          confidential: input.confidential ?? false,
          reporterId: caller.id,
          reporterName: input.reporterName ?? caller.name,
          source,
          externalEventId: input.externalEventId ?? null,
          processNotes: null,
          resolution: null,
          dueAt: null,
          submittedAt: status === 'pending_dispatch' ? now : null,
          assignedAt: null,
          startedAt: null,
          closedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        { ticketNo },
      );
      await this.appendLog(connection, {
        ticketId: Number(inserted.id),
        operator: caller,
        action: 'create',
        toStatus: status,
      });
      if (status === 'pending_dispatch') {
        await this.appendLog(connection, {
          ticketId: Number(inserted.id),
          operator: caller,
          action: 'submit',
          fromStatus: 'draft',
          toStatus: 'pending_dispatch',
        });
      }
      return inserted;
    });
  }

  private async nextTicketNo(
    connection: DatabaseConnection,
    now: Date,
  ): Promise<string> {
    const prefix = `SR${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
    const row = await connection.query
      .selectFrom('serviceTickets')
      .select(({ fn }) => [fn.max('id').as('maxId')])
      .executeTakeFirst();
    const next = Number(row?.maxId ?? 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  private async appendLog(
    connection: DatabaseConnection,
    input: {
      ticketId: number;
      operator: ServiceCaller;
      action: string;
      fromStatus?: string | null;
      toStatus?: string | null;
      note?: string;
      reason?: string;
      laborHours?: number;
    },
  ): Promise<void> {
    await connection.query
      .insertInto('serviceTicketLogs')
      .values({
        ticketId: input.ticketId,
        operatorId: input.operator.id,
        operatorName: input.operator.name,
        action: input.action,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        note: input.note ?? null,
        reason: input.reason ?? null,
        laborHours: input.laborHours ?? null,
        createdAt: new Date(),
      })
      .execute();
  }

  /**
   * One guarded state transition. Every transition is idempotent: asking for the
   * state the ticket already has returns it unchanged instead of failing, and an
   * illegal transition fails with 409 rather than corrupting the record.
   */
  async transition(
    caller: ServiceCaller,
    id: number,
    action:
      | 'submit'
      | 'assign'
      | 'process'
      | 'submit-confirmation'
      | 'confirm'
      | 'reject'
      | 'cancel'
      | 'transfer',
    payload: {
      assigneeId?: string;
      note?: string;
      reason?: string;
      laborHours?: number;
      resolution?: string;
      region?: string;
      priority?: string;
      confidential?: boolean;
    } = {},
  ) {
    const ticket = await this.findRaw(id);
    if (!ticket) throw new ServiceRuleError('Ticket not found', 404);
    await this.assertAccessible(caller, ticket);
    if (!ticketWritable(caller, ticket))
      throw new ServiceRuleError('Ticket is not writable by this caller', 403);

    const expected: Record<string, string> = {
      'submit-confirmation': 'in_progress',
      confirm: 'pending_confirmation',
      reject: 'pending_confirmation',
      process: 'in_progress',
    };
    const target: Record<string, TicketStatus | undefined> = {
      submit: 'pending_dispatch',
      assign: 'in_progress',
      process: 'in_progress',
      'submit-confirmation': 'pending_confirmation',
      confirm: 'closed',
      reject: 'in_progress',
      cancel: 'cancelled',
      transfer: undefined,
    };

    const capabilityByAction: Record<string, string> = {
      submit: 'tickets.create',
      assign: 'tickets.assign',
      process: 'tickets.process',
      'submit-confirmation': 'tickets.process',
      confirm: 'tickets.confirm',
      reject: 'tickets.confirm',
      cancel: 'tickets.edit',
      transfer: 'tickets.transfer',
    };
    try {
      await requireCapability(caller, capabilityByAction[action]);
    } catch {
      forbidden(`Missing capability for ${action}`);
    }

    const desired = target[action];
    const reassignment =
      action === 'assign' &&
      ticket.status === 'in_progress' &&
      payload.assigneeId !== ticket.assigneeId;
    // Asking for the state the ticket already has is a no-op, not an error.
    // `process` and `transfer` are excluded: recording progress is a new event
    // even when the status does not change, and a transfer carries a reason.
    if (
      desired &&
      ticket.status === desired &&
      action !== 'process' &&
      action !== 'transfer' &&
      !reassignment
    ) {
      return { ticket, idempotent: true };
    }
    // A closed or cancelled ticket is terminal for every workflow action.
    if (['closed', 'cancelled'].includes(ticket.status)) {
      throw new ServiceRuleError(
        `Cannot ${action} a ticket in status ${ticket.status}`,
        409,
      );
    }
    if (expected[action] && ticket.status !== expected[action]) {
      throw new ServiceRuleError(
        `Cannot ${action} a ticket in status ${ticket.status}`,
        409,
      );
    }
    if (action === 'submit' && ticket.status !== 'draft') {
      throw new ServiceRuleError('Only a draft ticket can be submitted', 409);
    }
    if (action === 'assign') {
      if (!['pending_dispatch', 'in_progress'].includes(ticket.status)) {
        throw new ServiceRuleError('Ticket is not awaiting dispatch', 409);
      }
      if (!payload.assigneeId)
        throw new ServiceRuleError('assigneeId is required');
    }
    if (
      action === 'cancel' &&
      !['draft', 'pending_dispatch', 'in_progress'].includes(ticket.status)
    ) {
      throw new ServiceRuleError('Ticket cannot be cancelled now', 409);
    }
    if (
      action === 'process' &&
      !payload.note &&
      payload.laborHours === undefined
    ) {
      throw new ServiceRuleError('Nothing to process');
    }
    // Cancel, reject and transfer all have to record why they happened.
    if (
      ['cancel', 'reject', 'transfer'].includes(action) &&
      !payload.reason?.trim()
    ) {
      throw new ServiceRuleError('A reason is required');
    }
    // Dispatch and transfer hand the ticket to a field engineer. The target has
    // to belong to a dispatchable region and hold the processing action, or the
    // ticket lands with someone who cannot advance it and stays stuck. This is
    // the server-side guard behind the assignee selector's own filtering.
    const targetAssigneeId =
      (action === 'assign' || action === 'transfer') && payload.assigneeId
        ? payload.assigneeId
        : undefined;
    if (targetAssigneeId) {
      const member = await this.query
        .selectFrom('serviceMembers')
        .select('region')
        .where('userId', '=', targetAssigneeId)
        .executeTakeFirst();
      const region = member ? asText(member.region) || null : null;
      if (
        !isAssignableRegion(region) ||
        !(await canProcessTickets(this.app, targetAssigneeId))
      ) {
        throw new ServiceRuleError(
          'The selected user cannot process tickets',
          400,
        );
      }
    }

    const now = new Date();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (desired) updates.status = desired;
    if (action === 'submit') updates.submittedAt = now;
    if (action === 'assign') {
      updates.assigneeId = payload.assigneeId;
      updates.assignedAt = now;
      if (!ticket.startedAt) updates.startedAt = now;
    }
    if (action === 'process') {
      if (payload.note) updates.processNotes = payload.note;
      if (payload.laborHours !== undefined)
        updates.laborHours = payload.laborHours;
    }
    if (action === 'confirm') {
      updates.closedAt = now;
      if (payload.resolution) updates.resolution = payload.resolution;
    }
    if (action === 'transfer') {
      if (payload.region) updates.region = payload.region;
      if (payload.assigneeId) {
        updates.assigneeId = payload.assigneeId;
        updates.assignedAt = now;
        if (ticket.status === 'pending_dispatch')
          updates.status = 'in_progress';
      }
      if (payload.priority) updates.priority = payload.priority;
    }
    if (payload.confidential !== undefined)
      updates.confidential = payload.confidential;
    if (payload.priority && action !== 'transfer')
      updates.priority = payload.priority;

    const updated = await this.database.transaction(async (connection) => {
      const row = await updateReturning<TicketRow>(
        connection.query,
        'serviceTickets',
        updates,
        { id },
      );
      await this.appendLog(connection, {
        ticketId: id,
        operator: caller,
        action,
        fromStatus: ticket.status,
        toStatus: String(row.status),
        note: payload.note,
        reason: payload.reason,
        laborHours: payload.laborHours,
      });
      return row;
    });

    await this.notifyForTransition(action, updated, payload);
    return { ticket: updated, idempotent: false };
  }

  private async notifyForTransition(
    action: string,
    ticket: TicketRow,
    payload: { assigneeId?: string; reason?: string },
  ): Promise<void> {
    const url = `/service/tickets/${ticket.id}`;
    if (action === 'assign' && payload.assigneeId) {
      await notifyUser(this.app, {
        userId: payload.assigneeId,
        title: `新工单派发：${ticket.ticketNo}`,
        body: ticket.title,
        actionUrl: url,
        idempotencyKey: `service:ticket:${ticket.id}:assign:${payload.assigneeId}:${Date.now()}`,
        source: { type: 'service-ticket', referenceId: String(ticket.id) },
      });
    }
    if (action === 'transfer' && payload.assigneeId) {
      await notifyUser(this.app, {
        userId: payload.assigneeId,
        title: `工单已转派：${ticket.ticketNo}`,
        body: ticket.title,
        actionUrl: url,
        idempotencyKey: `service:ticket:${ticket.id}:transfer:${payload.assigneeId}:${Date.now()}`,
        source: { type: 'service-ticket', referenceId: String(ticket.id) },
      });
    }
    if (ticket.reporterId) {
      if (action === 'confirm' || action === 'reject') {
        await notifyUser(this.app, {
          userId: ticket.reporterId,
          title:
            action === 'confirm'
              ? `工单已关闭：${ticket.ticketNo}`
              : `工单需要返工：${ticket.ticketNo}`,
          body:
            action === 'reject'
              ? (payload.reason ?? ticket.title)
              : ticket.title,
          actionUrl: url,
          idempotencyKey: `service:ticket:${ticket.id}:${action}:reporter`,
          source: { type: 'service-ticket', referenceId: String(ticket.id) },
        });
      }
    }
  }

  async share(
    caller: ServiceCaller,
    ticketId: number,
    userId: string,
    active: boolean,
  ) {
    await requireCapability(caller, 'tickets.share');
    const ticket = await this.findRaw(ticketId);
    if (!ticket) throw new ServiceRuleError('Ticket not found', 404);
    await this.assertAccessible(caller, ticket);
    if (active && ticket.confidential)
      throw new ServiceRuleError('A confidential ticket cannot be shared', 409);
    const now = new Date();
    if (active) {
      const existing = await this.query
        .selectFrom('serviceTicketShares')
        .select('id')
        .where('ticketId', '=', ticketId)
        .where('userId', '=', userId)
        .executeTakeFirst();
      if (existing) {
        return updateReturning(
          this.query,
          'serviceTicketShares',
          { active: true, revokedAt: null, updatedAt: now },
          { id: existing.id },
        );
      }
      return insertReturning(
        this.query,
        'serviceTicketShares',
        {
          ticketId,
          userId,
          grantedById: caller.id,
          active: true,
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        { ticketId, userId },
      );
    }
    return updateReturning(
      this.query,
      'serviceTicketShares',
      { active: false, revokedAt: now, updatedAt: now },
      { ticketId, userId },
    );
  }

  async attachFiles(
    caller: ServiceCaller,
    ticketId: number,
    fileIds: readonly string[],
    category = 'attachment',
  ) {
    await requireCapability(caller, 'tickets.edit');
    const ticket = await this.findRaw(ticketId);
    if (!ticket) throw new ServiceRuleError('Ticket not found', 404);
    await this.assertAccessible(caller, ticket);
    if (!ticketWritable(caller, ticket))
      throw new ServiceRuleError('Ticket is not writable by this caller', 403);
    const now = new Date();
    const created = [];
    for (const fileId of fileIds) {
      const existing = await this.query
        .selectFrom('serviceTicketFiles')
        .select('id')
        .where('ticketId', '=', ticketId)
        .where('fileId', '=', fileId)
        .executeTakeFirst();
      if (existing) continue;
      created.push(
        await insertReturning(
          this.query,
          'serviceTicketFiles',
          { ticketId, fileId, category, createdAt: now },
          { ticketId, fileId },
        ),
      );
    }
    return created;
  }
}

export function isAuthorizationDenied(error: unknown): boolean {
  return error instanceof AuthorizationDeniedError;
}
