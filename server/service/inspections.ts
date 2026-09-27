import {
  databaseManagerToken,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import {
  createServiceToken,
  type ServiceResolver,
} from '@nocobase/service-provider';
import type { ServiceModuleConfig } from '../config/service.js';
import {
  asBoolean,
  serviceAccessToken,
  type ServiceAccessService,
  type ServiceIdentity,
} from './access.js';
import { serviceNotificationToken } from './notifications.js';
import { textValue } from './text.js';

/**
 * Inspection scheduling and overdue detection.
 *
 * A plan is one device with a daily cron. A run writes one task per plan per
 * day; the `(planId, runDate)` unique pair is what makes a duplicate run a
 * no-op instead of a second task. Overdue detection is idempotent for the same
 * reason: it flips a flag and reports, it never appends state twice.
 */

export const serviceInspectionToken =
  createServiceToken<ServiceInspectionService>('service.inspections');

export const SERVICE_INSPECTION_TARGET = 'service.inspection-run';
export const SERVICE_OVERDUE_TARGET = 'service.overdue-check';

const OPEN_TICKET_STATUSES = [
  'pending_assignment',
  'in_progress',
  'pending_confirmation',
] as const;

export interface InspectionRunResult {
  readonly runDate: string;
  readonly plansProcessed: number;
  readonly tasksCreated: number;
  readonly tasksSkipped: number;
}

export interface OverdueCheckResult {
  readonly checkedAt: string;
  readonly marked: number;
  readonly cleared: number;
  readonly notified: number;
}

export interface DashboardCounts {
  readonly tickets: {
    readonly total: number;
    readonly byStatus: Readonly<Record<string, number>>;
    readonly overdue: number;
    readonly confidential: number;
  };
  readonly devices: { readonly total: number; readonly enabled: number };
  readonly customers: { readonly total: number };
  readonly inspections: {
    readonly today: number;
    readonly pending: number;
    readonly completed: number;
    readonly plans: number;
  };
  readonly knowledge: { readonly published: number; readonly draft: number };
  readonly deliveries: {
    readonly notConfigured: number;
    readonly failed: number;
  };
}

export interface DashboardResult {
  readonly scope: {
    readonly regions: readonly string[];
    readonly unrestricted: boolean;
  };
  readonly counts: DashboardCounts;
  readonly recentTickets: readonly Row[];
  readonly overdueTickets: readonly Row[];
}

export class ServiceInspectionService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly container: ServiceResolver,
    private readonly config: ServiceModuleConfig,
  ) {}

  /** Today's date in the configured business timezone, as `YYYY-MM-DD`. */
  today(now = new Date(), timeZone = this.config.inspection.timezone): string {
    return dateInTimeZone(now, timeZone);
  }

  /**
   * Creates one task per enabled plan for `runDate`, skipping any plan that
   * already has that day. Safe to run repeatedly and from two callers at once:
   * the unique constraint absorbs the race.
   */
  async runInspectionTasks(
    input: {
      readonly runDate?: string;
      readonly planId?: number;
      readonly triggeredBy?: string;
    } = {},
  ): Promise<InspectionRunResult> {
    let plansQuery = this.database
      .query()
      .selectFrom('service_inspection_plans')
      .selectAll()
      .where('enabled', '=', true);
    if (input.planId !== undefined) {
      plansQuery = plansQuery.where('id', '=', input.planId);
    }
    const plans = await plansQuery.execute<Row>();

    let tasksCreated = 0;
    let tasksSkipped = 0;
    for (const plan of plans) {
      const timeZone =
        (plan.timezone as string | null) ?? this.config.inspection.timezone;
      const runDate = input.runDate ?? this.today(new Date(), timeZone);
      const existing = await this.database
        .query()
        .selectFrom('service_inspection_tasks')
        .select(['id'])
        .where('planId', '=', Number(plan.id))
        .where('runDate', '=', runDate)
        .executeTakeFirst();
      if (existing) {
        tasksSkipped += 1;
        continue;
      }
      const now = new Date().toISOString();
      try {
        await this.database
          .query()
          .insertInto('service_inspection_tasks')
          .values({
            planId: Number(plan.id),
            deviceId: Number(plan.deviceId),
            deviceSerial: plan.deviceSerial ?? null,
            runDate,
            status: 'pending',
            ticketId: null,
            triggeredBy: input.triggeredBy ?? 'schedule',
            result: null,
            startedAt: now,
            finishedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        tasksCreated += 1;
      } catch {
        // Another runner won the unique race for this plan and day.
        tasksSkipped += 1;
        continue;
      }
      await this.database
        .query()
        .updateTable('service_inspection_plans')
        .set({
          lastRunAt: now,
          nextRunAt: nextDailyRun(
            (plan.cron as string | null) ?? this.config.inspection.cron,
            timeZone,
            new Date(),
          ),
          updatedAt: now,
        })
        .where('id', '=', Number(plan.id))
        .execute();
    }

    return {
      runDate: input.runDate ?? this.today(),
      plansProcessed: plans.length,
      tasksCreated,
      tasksSkipped,
    };
  }

  /**
   * Flags open tickets whose SLA is past and clears the flag when the SLA is
   * moved into the future. Notifies the assignee once per ticket per day.
   */
  async checkOverdue(now = new Date()): Promise<OverdueCheckResult> {
    const graceMs = this.config.inspection.overdueGraceHours * 3_600_000;
    const cutoff = now.getTime() - graceMs;
    const rows = await this.database
      .query()
      .selectFrom('service_tickets')
      .select([
        'id',
        'serial',
        'title',
        'status',
        'region',
        'assigneeId',
        'assigneeName',
        'slaDueAt',
        'overdue',
      ])
      .where('status', 'in', [...OPEN_TICKET_STATUSES])
      .execute<Row>();

    let marked = 0;
    let cleared = 0;
    let notified = 0;
    const notifications = this.container.has(serviceNotificationToken)
      ? this.container.resolve(serviceNotificationToken)
      : undefined;
    for (const row of rows) {
      const due = parseTime(row.slaDueAt);
      const shouldBeOverdue = due !== null && due.getTime() < cutoff;
      const isOverdue = asBoolean(row.overdue);
      if (shouldBeOverdue === isOverdue) continue;
      const nowIso = new Date().toISOString();
      await this.database
        .query()
        .updateTable('service_tickets')
        .set({ overdue: shouldBeOverdue, updatedAt: nowIso })
        .where('id', '=', Number(row.id))
        .execute();
      if (shouldBeOverdue) {
        marked += 1;
        const assigneeId = row.assigneeId as string | null;
        if (notifications && assigneeId) {
          const day = dateInTimeZone(now, this.config.inspection.timezone);
          await notifications.notify({
            notificationKey: `service-ticket:${textValue(row.id)}:overdue:${day}`,
            title: 'Service ticket overdue',
            body: `Ticket ${textValue(row.serial, textValue(row.id))} has passed its service level deadline.`,
            ticketId: Number(row.id),
            recipient: {
              id: assigneeId,
              name: (row.assigneeName as string | null) ?? null,
            },
            target: {
              type: 'route',
              path: `/service/tickets/${textValue(row.id)}`,
            },
          });
          notified += 1;
        }
      } else {
        cleared += 1;
      }
    }

    return { checkedAt: now.toISOString(), marked, cleared, notified };
  }

  /**
   * Scope-aware counts for the supervisor dashboard. Everything is filtered
   * through `ServiceAccessService`, so an engineer sees their region and a
   * collaborator sees only the tickets shared with them.
   */
  async dashboard(identity: ServiceIdentity): Promise<DashboardResult> {
    const access = this.container.resolve(serviceAccessToken);
    const deviceIds = await this.visibleDeviceIds(identity, access);

    const ticketRows = await (
      await access.scopeTicketQuery(
        this.database.query().selectFrom('service_tickets').selectAll(),
        identity,
      )
    ).execute<Row>();

    const byStatus: Record<string, number> = {};
    let overdue = 0;
    let confidential = 0;
    for (const row of ticketRows) {
      const status = textValue(row.status, 'unknown');
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      if (asBoolean(row.overdue)) overdue += 1;
      if (asBoolean(row.confidential)) confidential += 1;
    }

    const recentTickets = [...ticketRows]
      .sort((left, right) => Number(right.id) - Number(left.id))
      .slice(0, 8);
    const overdueTickets = ticketRows
      .filter((row) => asBoolean(row.overdue))
      .slice(0, 8);

    const today = this.today();
    const inspections = await this.inspectionCounts(deviceIds, today);
    const devices = await this.deviceCounts(identity, access, deviceIds);
    const customers = await this.customerCounts(identity, access);
    const knowledge = await this.knowledgeCounts();

    return {
      scope: {
        regions: identity.regions,
        unrestricted: identity.allTickets,
      },
      counts: {
        tickets: { total: ticketRows.length, byStatus, overdue, confidential },
        devices,
        customers,
        inspections,
        knowledge,
        deliveries: await this.deliveryCounts(),
      },
      recentTickets,
      overdueTickets,
    };
  }

  private async visibleDeviceIds(
    identity: ServiceIdentity,
    access: ServiceAccessService,
  ): Promise<number[] | null> {
    if (identity.devices === 'all') return null;
    if (identity.devices === 'linked') return access.linkedDeviceIds(identity);
    if (identity.devices === 'region' && identity.regions.length > 0) {
      const rows = await this.database
        .query()
        .selectFrom('service_devices')
        .select(['id'])
        .where('region', 'in', [...identity.regions])
        .execute<{ id: number | string }>();
      return rows.map((row) => Number(row.id));
    }
    return [];
  }

  private async inspectionCounts(
    deviceIds: number[] | null,
    today: string,
  ): Promise<DashboardCounts['inspections']> {
    const base = () => {
      let query = this.database
        .query()
        .selectFrom('service_inspection_tasks')
        .selectAll();
      if (deviceIds !== null) {
        query = query.where(
          'deviceId',
          'in',
          deviceIds.length > 0 ? deviceIds : [-1],
        );
      }
      return query;
    };
    const all = await base().execute<Row>();
    let plansQuery = this.database
      .query()
      .selectFrom('service_inspection_plans')
      .select(['id'])
      .where('enabled', '=', true);
    if (deviceIds !== null) {
      plansQuery = plansQuery.where(
        'deviceId',
        'in',
        deviceIds.length > 0 ? deviceIds : [-1],
      );
    }
    const plans = await plansQuery.execute<Row>();
    return {
      today: all.filter((row) => String(row.runDate) === today).length,
      pending: all.filter((row) => String(row.status) === 'pending').length,
      completed: all.filter((row) => String(row.status) === 'completed').length,
      plans: plans.length,
    };
  }

  private async deviceCounts(
    identity: ServiceIdentity,
    access: ServiceAccessService,
    deviceIds: number[] | null,
  ): Promise<DashboardCounts['devices']> {
    if (deviceIds === null) {
      const all = await this.database
        .query()
        .selectFrom('service_devices')
        .select(['id', 'enabled'])
        .execute<Row>();
      return {
        total: all.length,
        enabled: all.filter((row) => asBoolean(row.enabled)).length,
      };
    }
    if (identity.devices === 'linked') {
      const ids = deviceIds.length > 0 ? deviceIds : [-1];
      let query = this.database
        .query()
        .selectFrom('service_devices')
        .select(['id', 'enabled'])
        .where('id', 'in', ids);
      query = await access.scopeRegionQuery(
        query,
        identity,
        identity.devices,
        deviceIds,
      );
      const rows = await query.execute<Row>();
      return {
        total: rows.length,
        enabled: rows.filter((row) => asBoolean(row.enabled)).length,
      };
    }
    const ids = deviceIds.length > 0 ? deviceIds : [-1];
    const rows = await this.database
      .query()
      .selectFrom('service_devices')
      .select(['id', 'enabled'])
      .where('id', 'in', ids)
      .execute<Row>();
    return {
      total: rows.length,
      enabled: rows.filter((row) => asBoolean(row.enabled)).length,
    };
  }

  private async customerCounts(
    identity: ServiceIdentity,
    access: ServiceAccessService,
  ): Promise<DashboardCounts['customers']> {
    const linkedIds =
      identity.customers === 'linked'
        ? await access.linkedCustomerIds(identity)
        : identity.customers === 'none'
          ? []
          : null;
    let query = this.database
      .query()
      .selectFrom('service_customers')
      .select(['id'])
      .where('id', '>', 0);
    query = await access.scopeRegionQuery(
      query,
      identity,
      identity.customers,
      linkedIds ?? [],
    );
    const rows = await query.execute<Row>();
    return { total: rows.length };
  }

  private async knowledgeCounts(): Promise<DashboardCounts['knowledge']> {
    const rows = await this.database
      .query()
      .selectFrom('service_knowledge_articles')
      .select(['status'])
      .execute<Row>();
    return {
      published: rows.filter((row) => String(row.status) === 'published')
        .length,
      draft: rows.filter((row) => String(row.status) === 'draft').length,
    };
  }

  private async deliveryCounts(): Promise<DashboardCounts['deliveries']> {
    const rows = await this.database
      .query()
      .selectFrom('service_notification_deliveries')
      .select(['status'])
      .execute<Row>();
    return {
      notConfigured: rows.filter(
        (row) => String(row.status) === 'not_configured',
      ).length,
      failed: rows.filter((row) => String(row.status) === 'failed').length,
    };
  }
}

/** The unique-pair dedupe is what `service_inspection_tasks` relies on. */
export function inspectionDedupeKey(planId: number, runDate: string): string {
  return `${planId}:${runDate}`;
}

export function dateInTimeZone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function parseTime(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  const text = textValue(value);
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const withZone = /Z$|[+-]\d{2}:?\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Next `HH:mm` occurrence for a plain daily cron, or null for any other cron. */
export function nextDailyRun(
  cron: string,
  timeZone: string,
  now: Date,
): string | null {
  const match = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(cron.trim());
  if (!match) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (minute > 59 || hour > 23) return null;
  const target = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const cursor = new Date(now.getTime() + 60_000);
  cursor.setSeconds(0, 0);
  for (let step = 0; step < 60 * 49; step += 1) {
    if (formatter.format(cursor) === target) return cursor.toISOString();
    cursor.setTime(cursor.getTime() + 60_000);
  }
  return null;
}

export function createServiceInspectionService(
  container: ServiceResolver,
  config: ServiceModuleConfig,
): ServiceInspectionService {
  return new ServiceInspectionService(
    container.resolve(databaseManagerToken),
    container,
    config,
  );
}
