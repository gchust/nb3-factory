import type { DatabaseManager, FilterNode } from '@nocobase/db';
import type { AccessService } from './access-service.js';
import type { ServiceNotificationService } from './notification-service.js';
import type { TicketService } from './ticket-service.js';
import {
  TICKET_STATUS,
  invalid,
  notFound,
  type DeviceRow,
  type InspectionRow,
  type ServiceActor,
  type TicketRow,
} from './contracts.js';

const INSPECTION_INTERVAL_DAYS = 90;

export interface InspectionView {
  id: number;
  deviceId: number;
  deviceCode?: string | null;
  deviceName?: string | null;
  customerId?: number | null;
  customerName?: string | null;
  inspectionDate: string;
  engineerId?: string | null;
  status: string;
  resultNote?: string | null;
  ticketId?: number | null;
  reminderSent: boolean;
  createdAt?: string | null;
}

export interface DailyRunResult {
  date: string;
  created: number;
  skipped: number;
  deviceIds: number[];
}

export interface ReminderRunResult {
  date: string;
  reminded: number;
  ticketIds: number[];
}

/**
 * Reads whether an administrator left a schedule enabled. The manual trigger
 * must honor the same switch the scheduler does, or a disabled plan keeps
 * producing records.
 */
export interface DailyScheduleGate {
  isEnabled(key: string): Promise<boolean>;
}

/**
 * The two daily schedules the application declares with the Scheduler.
 * Exported so the manual "run now" trigger and the schedule definitions in the
 * provider resolve the same keys instead of each spelling them out.
 */
export const DAILY_SCHEDULE_KEYS = {
  inspection: 'service-inspection-daily',
  reminder: 'service-overdue-daily',
} as const;

const INSPECTION_SCHEDULE_KEY = DAILY_SCHEDULE_KEYS.inspection;
const REMINDER_SCHEDULE_KEY = DAILY_SCHEDULE_KEYS.reminder;

function todayInShanghai(now = new Date()): string {
  // The business day is the Asia/Shanghai calendar day regardless of server TZ.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

/**
 * Inspection planning and the daily maintenance window.
 *
 * Generation is deduplicated on `(deviceId, inspectionDate)`, and reminders on
 * an idempotency key that carries the day — so a re-run, an overlap, or a
 * manual catch-up never produces a second record or a second message.
 */
export class InspectionService {
  private readonly db: DatabaseManager;
  private readonly access: AccessService;
  private readonly notifications: ServiceNotificationService;
  private readonly tickets: TicketService;
  private readonly schedules?: DailyScheduleGate;

  constructor(
    db: DatabaseManager,
    access: AccessService,
    notifications: ServiceNotificationService,
    tickets: TicketService,
    schedules?: DailyScheduleGate,
  ) {
    this.db = db;
    this.access = access;
    this.notifications = notifications;
    this.tickets = tickets;
    this.schedules = schedules;
  }

  async listInspections(
    actor: ServiceActor,
    query: {
      deviceId?: number;
      status?: string;
      from?: string;
      to?: string;
    } = {},
  ): Promise<InspectionView[]> {
    this.access.assertCanReadLedger(actor);
    const rows = await this.db
      .repository<InspectionRow>('serviceInspections')
      .findMany({
        filter: (filter) => {
          const items: FilterNode[] = [];
          if (query.deviceId !== undefined) {
            items.push(filter.number('deviceId').eq(query.deviceId));
          }
          if (query.status) {
            items.push(filter.string('status').eq(query.status));
          }
          if (query.from) {
            items.push(filter.date('inspectionDate').notBefore(query.from));
          }
          if (query.to) {
            items.push(filter.date('inspectionDate').notAfter(query.to));
          }
          if (actor.isEngineer && !actor.isRoot && !actor.isSupervisor) {
            items.push(filter.string('engineerId').eq(actor.id));
          }
          return filter.and(items);
        },
        sort: (sort) => sort.field('inspectionDate').desc(),
        limit: 200,
      });
    return this.decorate(rows);
  }

  /**
   * Daily generation step. Idempotent per device and calendar day; advances the
   * device schedule only when a record was actually created.
   */
  async generateDueInspections(
    reference = new Date(),
  ): Promise<DailyRunResult> {
    const date = todayInShanghai(reference);
    if (!(await this.isScheduleEnabled(INSPECTION_SCHEDULE_KEY))) {
      return { date, created: 0, skipped: 0, deviceIds: [] };
    }
    const devices = await this.db
      .repository<DeviceRow>('serviceDevices')
      .findMany({});
    const createdIds: number[] = [];
    let skipped = 0;
    for (const device of devices) {
      if (!device.enabled) {
        continue;
      }
      if (!device.nextInspectionDate) {
        continue;
      }
      if (device.nextInspectionDate > date) {
        continue;
      }
      const existing = await this.db
        .repository<InspectionRow>('serviceInspections')
        .findOne({ filter: { deviceId: device.id, inspectionDate: date } });
      if (existing) {
        skipped += 1;
        continue;
      }
      const now = new Date();
      const { record } = await this.db
        .repository<InspectionRow>('serviceInspections')
        .createOne({
          values: {
            deviceId: device.id,
            inspectionDate: date,
            engineerId: device.engineerId ?? null,
            status: 'pending',
            resultNote: null,
            ticketId: null,
            reminderSent: false,
            createdAt: now,
            updatedAt: now,
          },
        });
      await this.db.repository<DeviceRow>('serviceDevices').updateOne({
        filter: { id: device.id },
        values: {
          lastInspectionDate: date,
          nextInspectionDate: addDays(date, INSPECTION_INTERVAL_DAYS),
          updatedAt: now,
        },
      });
      // Assignee gets one scheduling message per generated inspection.
      if (device.engineerId) {
        await this.notifications.sendInApp({
          userId: device.engineerId,
          title: `Inspection scheduled for ${device.name}`,
          body: `Device ${device.code} (${device.name}) is due for inspection on ${date}.`,
          path: `/service/inspections`,
          idempotencyKey: `inspection-due:${device.id}:${date}`,
          sourceType: 'serviceInspection',
          referenceId: String(record.id),
        });
      }
      createdIds.push(device.id);
    }
    return { date, created: createdIds.length, skipped, deviceIds: createdIds };
  }

  /** Overdue reminder step. At most one message per ticket per calendar day. */
  async remindOverdueTickets(
    reference = new Date(),
  ): Promise<ReminderRunResult> {
    const date = todayInShanghai(reference);
    if (!(await this.isScheduleEnabled(REMINDER_SCHEDULE_KEY))) {
      return { date, reminded: 0, ticketIds: [] };
    }
    const now = reference;
    const tickets = await this.db
      .repository<TicketRow>('serviceTickets')
      .findMany({
        filter: (filter) =>
          filter.and([
            filter.string('status').ne(TICKET_STATUS.closed),
            filter.string('status').ne(TICKET_STATUS.pendingAcceptance),
            filter.date('dueAt').before(now),
          ]),
      });
    const reminded: number[] = [];
    for (const ticket of tickets) {
      const recipients = new Set<string>();
      if (ticket.assigneeId) {
        recipients.add(ticket.assigneeId);
      }
      for (const supervisorId of await this.access.listUserIdsByRole(
        'supervisor',
      )) {
        recipients.add(supervisorId);
      }
      let sent = false;
      for (const userId of recipients) {
        const result = await this.notifications.sendInApp({
          userId,
          title: `Overdue ticket ${ticket.code}`,
          body: `Ticket ${ticket.code} is past its due time and is still ${ticket.status}.`,
          path: `/service/tickets/${ticket.id}`,
          idempotencyKey: `ticket-overdue:${ticket.id}:${date}`,
          sourceType: 'serviceTicket',
          referenceId: String(ticket.id),
        });
        sent = sent || (result.delivered && !result.deduplicated);
      }
      if (sent) {
        reminded.push(ticket.id);
      }
    }
    return { date, reminded: reminded.length, ticketIds: reminded };
  }

  async completeInspection(
    actor: ServiceActor,
    inspectionId: number,
    input: {
      resultNote: string;
      status?: 'completed' | 'skipped';
      createTicket?: boolean;
    },
  ): Promise<InspectionView> {
    this.access.assertStaff(actor);
    const inspection = await this.db
      .repository<InspectionRow>('serviceInspections')
      .findOne({ filter: { id: inspectionId } });
    if (!inspection) {
      throw notFound('The inspection record does not exist.');
    }
    if (!input.resultNote || !input.resultNote.trim()) {
      throw invalid('An inspection result note is required.');
    }
    const now = new Date();
    await this.db.repository<InspectionRow>('serviceInspections').updateOne({
      filter: { id: inspectionId },
      values: {
        status: input.status ?? 'completed',
        resultNote: input.resultNote,
        engineerId: inspection.engineerId ?? actor.id,
        updatedAt: now,
      },
    });
    if (input.createTicket) {
      const device = await this.db
        .repository<DeviceRow>('serviceDevices')
        .findOne({ filter: { id: inspection.deviceId } });
      if (device) {
        const created = await this.tickets.createTicket(actor, {
          title: `Inspection follow-up for ${device.name}`,
          description: input.resultNote,
          customerId: device.customerId,
          deviceId: device.id,
          priority: 'normal',
          assigneeId: device.engineerId ?? actor.id,
        });
        await this.db
          .repository<InspectionRow>('serviceInspections')
          .updateOne({
            filter: { id: inspectionId },
            values: { ticketId: created.id, updatedAt: new Date() },
          });
      }
    }
    const [view] = await this.decorate([
      (await this.db
        .repository<InspectionRow>('serviceInspections')
        .findOne({ filter: { id: inspectionId } }))!,
    ]);
    return view;
  }

  private async isScheduleEnabled(key: string): Promise<boolean> {
    if (!this.schedules) {
      return true;
    }
    try {
      return await this.schedules.isEnabled(key);
    } catch {
      // A scheduler that cannot answer must not block the business job; the
      // caller asked to run it now.
      return true;
    }
  }

  private async decorate(rows: InspectionRow[]): Promise<InspectionView[]> {
    if (!rows.length) {
      return [];
    }
    const devices = await this.db
      .repository<DeviceRow>('serviceDevices')
      .findMany({});
    const deviceById = new Map(devices.map((device) => [device.id, device]));
    const customers = await this.db
      .repository<{ id: number; name: string }>('serviceCustomers')
      .findMany({});
    const customerById = new Map(
      customers.map((customer) => [customer.id, customer]),
    );
    return rows.map((row) => {
      const device = deviceById.get(row.deviceId);
      const customer = device ? customerById.get(device.customerId) : undefined;
      return {
        id: row.id,
        deviceId: row.deviceId,
        deviceCode: device?.code ?? null,
        deviceName: device?.name ?? null,
        customerId: device?.customerId ?? null,
        customerName: customer?.name ?? null,
        inspectionDate: row.inspectionDate,
        engineerId: row.engineerId ?? null,
        status: row.status,
        resultNote: row.resultNote ?? null,
        ticketId: row.ticketId ?? null,
        reminderSent: row.reminderSent,
        createdAt: toIso(row.createdAt),
      };
    });
  }
}

export { todayInShanghai };
