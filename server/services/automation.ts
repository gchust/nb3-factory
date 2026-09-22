import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type Row } from '@nocobase/db';
import { notifyUser } from './service-notifications.js';
import { ServiceRuleError, type TicketRow } from './tickets.js';
import {
  requireCapability,
  sharedTicketIds,
  ticketAccessible,
  ticketWritable,
  type ServiceCaller,
  type TicketScopeRow,
} from './service-auth.js';

export const AUTOMATION_KIND = 'auto-acceptance';

export interface AutomationStep {
  name: string;
  status: 'succeeded' | 'failed' | 'skipped';
  detail?: unknown;
  error?: string | null;
}

export interface AutomationRunRow extends Row {
  id: number;
  ticketId: number;
  kind: string;
  status: string;
  steps: AutomationStep[] | null;
  error: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * The automatic acceptance process for a submitted ticket. Each run records the
 * individual steps — register, choose a processing path, notify the responsible
 * person — plus the overall result and any failure reason in
 * `serviceAutomationRuns`. A retry appends a new run instead of erasing the
 * failed history.
 */
export class AutomationService {
  constructor(private readonly app: Application) {}

  private get database() {
    return this.app.container.resolve(databaseManagerToken);
  }

  private get query() {
    return this.database.query();
  }

  async runAcceptance(
    ticket: TicketRow,
    triggeredBy = 'system',
  ): Promise<AutomationRunRow> {
    const steps: AutomationStep[] = [];
    let status: 'succeeded' | 'failed' = 'succeeded';
    let error: string | null = null;

    steps.push({
      name: 'register',
      status: 'succeeded',
      detail: {
        ticketNo: ticket.ticketNo,
        customerId: ticket.customerId,
        deviceId: ticket.deviceId,
        submittedAt: ticket.submittedAt,
        triggeredBy,
      },
    });

    let assigneeId: string | null = null;
    try {
      const route = await this.resolveRoute(ticket);
      assigneeId = route.assigneeId;
      steps.push({
        name: 'route',
        status: assigneeId ? 'succeeded' : 'skipped',
        detail: route,
      });
    } catch (cause) {
      status = 'failed';
      error = cause instanceof Error ? cause.message : String(cause);
      steps.push({ name: 'route', status: 'failed', error });
    }

    if (status === 'succeeded') {
      if (assigneeId) {
        const delivered = await notifyUser(this.app, {
          userId: assigneeId,
          title: `新报修待处理：${ticket.ticketNo}`,
          body: ticket.title,
          actionUrl: `/service/tickets/${ticket.id}`,
          idempotencyKey: `service:auto-acceptance:${ticket.id}:notify`,
          source: { type: 'service-ticket', referenceId: String(ticket.id) },
        });
        steps.push({
          name: 'notify',
          status: delivered ? 'succeeded' : 'failed',
          detail: { userId: assigneeId },
          error: delivered ? null : 'Notification could not be delivered',
        });
        if (!delivered) {
          status = 'failed';
          error = 'Notification could not be delivered';
        }
      } else {
        steps.push({
          name: 'notify',
          status: 'skipped',
          detail: { reason: 'No responsible engineer in the region' },
        });
      }
    }

    const now = new Date();
    await this.query
      .insertInto('serviceAutomationRuns')
      .values({
        ticketId: ticket.id,
        kind: AUTOMATION_KIND,
        status,
        steps,
        error,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const row = await this.query
      .selectFrom('serviceAutomationRuns')
      .selectAll()
      .where('ticketId', '=', ticket.id)
      .orderBy('id', 'desc')
      .executeTakeFirst();
    if (!row)
      throw new ServiceRuleError('Automation run could not be recorded');
    return row as unknown as AutomationRunRow;
  }

  private async resolveRoute(ticket: TicketRow): Promise<{
    region: string;
    priority: string;
    path: string;
    assigneeId: string | null;
  }> {
    const region = String(ticket.region);
    if (ticket.assigneeId) {
      return {
        region,
        priority: ticket.priority,
        path: 'existing-owner',
        assigneeId: ticket.assigneeId,
      };
    }
    const engineer = await this.query
      .selectFrom('serviceMembers')
      .select('userId')
      .where('region', '=', region)
      .orderBy('id', 'asc')
      .executeTakeFirst();
    return {
      region,
      priority: ticket.priority,
      path:
        ticket.priority === 'urgent' || ticket.priority === 'high'
          ? 'priority-escalation'
          : 'standard-queue',
      assigneeId: engineer ? String(engineer.userId) : null,
    };
  }

  /** Runs the caller may read, scoped to tickets they can reach. */
  async listRuns(
    caller: ServiceCaller,
    filters: { ticketId?: number; page?: number; pageSize?: number } = {},
  ) {
    await requireCapability(caller, 'tickets.view');
    let query = this.query.selectFrom('serviceAutomationRuns').selectAll();
    if (filters.ticketId)
      query = query.where('ticketId', '=', filters.ticketId);
    const rows = (await query
      .orderBy('id', 'desc')
      .limit(500)
      .execute()) as unknown as AutomationRunRow[];
    const ticketIds = [...new Set(rows.map((row) => Number(row.ticketId)))];
    const tickets = ticketIds.length
      ? ((await this.query
          .selectFrom('serviceTickets')
          .selectAll()
          .where('id', 'in', ticketIds)
          .execute()) as unknown as TicketScopeRow[])
      : [];
    const ticketById = new Map(
      tickets.map((ticket) => [Number(ticket.id), ticket]),
    );
    const shared = await sharedTicketIds(this.database, caller.id);
    const visible: (AutomationRunRow & {
      ticketNo?: string | null;
      title?: string | null;
    })[] = [];
    for (const run of rows) {
      const ticket = ticketById.get(Number(run.ticketId));
      if (!ticket) continue;
      if (!(await ticketAccessible(caller, ticket, shared))) continue;
      visible.push({
        ...run,
        ticketNo: (ticket as unknown as { ticketNo?: string }).ticketNo ?? null,
        title: (ticket as unknown as { title?: string }).title ?? null,
      });
    }
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const start = (page - 1) * pageSize;
    return {
      items: visible.slice(start, start + pageSize),
      total: visible.length,
      page,
      pageSize,
    };
  }

  /** Recovery entry point: rerun acceptance for a ticket the caller can write. */
  async retry(caller: ServiceCaller, ticketId: number) {
    await requireCapability(caller, 'tickets.process');
    const ticket = (await this.query
      .selectFrom('serviceTickets')
      .selectAll()
      .where('id', '=', ticketId)
      .executeTakeFirst()) as unknown as TicketRow | undefined;
    if (!ticket) throw new ServiceRuleError('Ticket not found', 404);
    const shared = await sharedTicketIds(this.database, caller.id);
    if (!(await ticketAccessible(caller, ticket, shared)))
      throw new ServiceRuleError('Ticket is not accessible', 404);
    if (!ticketWritable(caller, ticket))
      throw new ServiceRuleError('Ticket is not writable by this caller', 403);
    return await this.runAcceptance(ticket, `manual:${caller.name}`);
  }
}
