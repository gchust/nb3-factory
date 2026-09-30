import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';
import type { ServiceDirectoryService } from './directory-service.js';
import type { ServiceNotifier } from './notifier.js';
import type {
  ServiceInspectionRecord,
  ServiceTicketRecord,
} from './records.js';
import { asText } from './text.js';

/**
 * Inspection plans and the two scheduled jobs: creating the day's inspections
 * and reminding about anything overdue. Both jobs are idempotent — the code is
 * derived from the device and month for generation, and the notification
 * idempotency key includes the calendar day for reminders — so a repeated or
 * overlapping firing never duplicates work.
 */

export const INSPECTION_STATUS = {
  scheduled: 'scheduled',
  inProgress: 'in_progress',
  completed: 'completed',
  overdue: 'overdue',
} as const;

export interface InspectionCompleteInput {
  result: 'normal' | 'abnormal';
  findings?: string | null;
  message?: string | null;
}

export interface InspectionListFilters {
  status?: string;
  assigneeId?: string;
  customerId?: number;
  deviceId?: number;
  from?: string;
  to?: string;
  overdue?: boolean;
  limit?: number;
  offset?: number;
}

export interface JobSummary {
  created: number;
  skipped: number;
  notified: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Directory names attached to an inspection row for display. */
interface InspectionDecoration {
  customerName: string | null;
  deviceName: string | null;
  deviceSerialNumber: string | null;
  assigneeName: string | null;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class ServiceInspectionService {
  public constructor(
    private readonly database: DatabaseManager,
    private readonly directories: ServiceDirectoryService,
    private readonly notifier: ServiceNotifier,
  ) {}

  public async list(
    policy: RepositoryPolicy,
    filters: InspectionListFilters = {},
  ): Promise<Record<string, unknown>[]> {
    const rows = await this.database
      .repository<ServiceInspectionRecord>('serviceInspections')
      .withPolicy(policy)
      .findMany({
        filter: (filter) =>
          filter.and([
            ...(filters.status
              ? [filter.string('status').eq(filters.status)]
              : []),
            ...(filters.assigneeId
              ? [filter.string('assigneeId').eq(filters.assigneeId)]
              : []),
            ...(filters.customerId !== undefined
              ? [filter.number('customerId').eq(filters.customerId)]
              : []),
            ...(filters.deviceId !== undefined
              ? [filter.number('deviceId').eq(filters.deviceId)]
              : []),
            ...(filters.from
              ? [filter.date('scheduledDate').notBefore(filters.from)]
              : []),
            ...(filters.to
              ? [filter.date('scheduledDate').notAfter(filters.to)]
              : []),
            ...(filters.overdue
              ? [
                  filter.string('status').eq(INSPECTION_STATUS.scheduled),
                  filter.date('scheduledDate').before(nowIso()),
                ]
              : []),
          ]),
        sort: (sort) => sort.field('scheduledDate').asc(),
        limit: filters.limit ?? 50,
        offset: filters.offset ?? 0,
      });
    return this.decorate(rows);
  }

  public async get(
    policy: RepositoryPolicy,
    id: number,
  ): Promise<Record<string, unknown> | undefined> {
    const record = await this.database
      .repository<ServiceInspectionRecord>('serviceInspections')
      .withPolicy(policy)
      .findOne({ filter: { id } });
    if (!record) return undefined;
    const [decorated] = await this.decorate([record]);
    return decorated;
  }

  public async create(
    policy: RepositoryPolicy,
    values: {
      title: string;
      scheduledDate: string;
      customerId: number;
      deviceId: number;
      assigneeId?: string | null;
      findings?: string | null;
    },
    actor: { id: string },
  ): Promise<Record<string, unknown>> {
    const code = await this.nextInspectionCode();
    const timestamp = nowIso();
    const { record } = await this.database
      .repository<ServiceInspectionRecord>('serviceInspections')
      .withPolicy(policy)
      .createOne({
        values: {
          code,
          title: values.title,
          scheduledDate: values.scheduledDate,
          status: INSPECTION_STATUS.scheduled,
          result: null,
          findings: values.findings ?? null,
          completedAt: null,
          remindedAt: null,
          createdById: actor.id,
          assigneeId: values.assigneeId ?? null,
          customerId: values.customerId,
          deviceId: values.deviceId,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
    return record;
  }

  public async complete(
    policy: RepositoryPolicy,
    id: number,
    input: InspectionCompleteInput,
    actor: { id: string },
  ): Promise<Record<string, unknown>> {
    const timestamp = nowIso();
    const { record } = await this.database
      .repository<ServiceInspectionRecord>('serviceInspections')
      .withPolicy(policy)
      .updateOne({
        filter: { id },
        values: {
          status: INSPECTION_STATUS.completed,
          result: input.result,
          findings: input.findings ?? null,
          completedAt: timestamp,
          updatedAt: timestamp,
        },
      });
    const inspection = record;
    const supervisors =
      await this.directories.userIdsWithPermissionSet('service-supervisor');
    const recipients = [
      ...new Set([...supervisors, String(inspection.assigneeId ?? '')]),
    ].filter((value) => value && value !== actor.id);
    if (input.result === 'abnormal' && recipients.length > 0) {
      await this.notifier.notify(
        `inspection-abnormal:${id}`,
        'service.inspection',
        String(id),
        {
          to: recipients,
          title: 'Inspection found an abnormal result',
          body: `Inspection ${String(inspection.code ?? id)} reported an abnormal result.`,
          target: { type: 'route', path: `/service/inspections/${id}` },
        },
      );
    }
    return inspection;
  }

  /**
   * Daily job: create this month's inspection for every active device that has
   * none yet. The code is stable per device and month, so today's run finds
   * yesterday's rows and creates nothing.
   */
  public async runDailyGeneration(reference?: Date): Promise<JobSummary> {
    const at = reference ?? new Date();
    const month = at.toISOString().slice(0, 7);
    const summary: JobSummary = { created: 0, skipped: 0, notified: 0 };
    const devices = await this.database
      .query()
      .selectFrom('service_devices')
      .select(['id', 'name', 'serialNumber', 'customerId', 'category'])
      .where('status', '=', 'active')
      .execute();
    const engineers = await this.directories.engineerUserIds();
    const timestamp = nowIso();
    const scheduledDate = at.toISOString();
    for (const device of devices) {
      const code = `INS-${String(device.serialNumber)}-${month}`;
      const existing = await this.database
        .repository<ServiceInspectionRecord>('serviceInspections')
        .findOne({ filter: { code } });
      if (existing) {
        summary.skipped += 1;
        continue;
      }
      const assigneeId = engineers.length
        ? engineers[summary.created % engineers.length]
        : null;
      await this.database
        .repository<ServiceInspectionRecord>('serviceInspections')
        .createOne({
          values: {
            code,
            title: `Monthly inspection — ${String(device.name ?? device.serialNumber)}`,
            scheduledDate,
            status: INSPECTION_STATUS.scheduled,
            result: null,
            findings: null,
            completedAt: null,
            remindedAt: null,
            createdById: null,
            assigneeId,
            customerId: Number(device.customerId),
            deviceId: Number(device.id),
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        });
      summary.created += 1;
      if (assigneeId) {
        const notice = await this.notifier.notify(
          `inspection-created:${code}`,
          'service.inspection',
          code,
          {
            to: assigneeId,
            title: 'New inspection scheduled',
            body: `Inspection ${code} is scheduled for today.`,
            target: { type: 'route', path: '/service/inspections' },
          },
        );
        if (notice.delivered) summary.notified += 1;
      }
    }
    return summary;
  }

  /**
   * Daily job: remind assignees about inspections whose date has passed and
   * about tickets past their due time. The reminder key carries the day, so an
   * engineer receives at most one reminder a day for the same record.
   */
  public async sendOverdueReminders(reference?: Date): Promise<JobSummary> {
    const at = reference ?? new Date();
    const today = dayKey(at);
    const summary: JobSummary = { created: 0, skipped: 0, notified: 0 };
    const timestamp = at.toISOString();

    const overdueInspections = await this.database
      .query()
      .selectFrom<Partial<ServiceInspectionRecord>>('service_inspections')
      .select(['id', 'code', 'assigneeId', 'title'])
      .where('status', '=', INSPECTION_STATUS.scheduled)
      .where('scheduledDate', '<', timestamp)
      .execute();
    const supervisors =
      await this.directories.userIdsWithPermissionSet('service-supervisor');

    for (const row of overdueInspections) {
      const id = Number(row.id);
      await this.database
        .query()
        .updateTable('service_inspections')
        .set({
          status: INSPECTION_STATUS.overdue,
          remindedAt: timestamp,
          updatedAt: timestamp,
        })
        .where('id', '=', id)
        .execute();
      const recipients = [
        ...new Set([asText(row.assigneeId), ...supervisors]),
      ].filter(Boolean);
      if (recipients.length === 0) continue;
      const notice = await this.notifier.notify(
        `inspection-overdue:${id}:${today}`,
        'service.inspection',
        String(id),
        {
          to: recipients,
          title: 'Inspection overdue',
          body: `Inspection ${asText(row.code) || String(id)} is overdue.`,
          target: { type: 'route', path: `/service/inspections/${id}` },
        },
      );
      if (notice.delivered) summary.notified += 1;
    }

    const overdueTickets = await this.database
      .query()
      .selectFrom<Partial<ServiceTicketRecord>>('service_tickets')
      .select(['id', 'code', 'assigneeId', 'dueAt'])
      .where('status', 'in', [
        'pending_processing',
        'processing',
        'pending_confirmation',
      ])
      .where('dueAt', 'is not', null)
      .where('dueAt', '<', timestamp)
      .execute();
    for (const row of overdueTickets) {
      const id = Number(row.id);
      const recipients = [
        ...new Set([asText(row.assigneeId), ...supervisors]),
      ].filter(Boolean);
      if (recipients.length === 0) continue;
      const notice = await this.notifier.notify(
        `ticket-overdue:${id}:${today}`,
        'service.ticket',
        String(id),
        {
          to: recipients,
          title: 'Ticket overdue',
          body: `Ticket ${asText(row.code) || String(id)} has passed its due time.`,
          target: { type: 'route', path: `/service/tickets/${id}` },
        },
      );
      if (notice.delivered) summary.notified += 1;
    }
    return summary;
  }

  private async decorate(
    rows: readonly Partial<ServiceInspectionRecord>[],
  ): Promise<(Partial<ServiceInspectionRecord> & InspectionDecoration)[]> {
    const customerIds = [
      ...new Set(rows.map((row) => Number(row.customerId)).filter(Boolean)),
    ];
    const deviceIds = [
      ...new Set(rows.map((row) => Number(row.deviceId)).filter(Boolean)),
    ];
    const assigneeIds = [
      ...new Set(rows.map((row) => asText(row.assigneeId)).filter(Boolean)),
    ];
    const [customers, devices, people] = await Promise.all([
      customerIds.length
        ? this.database
            .query()
            .selectFrom('service_customers')
            .select(['id', 'name'])
            .where('id', 'in', customerIds)
            .execute()
        : Promise.resolve([]),
      deviceIds.length
        ? this.database
            .query()
            .selectFrom('service_devices')
            .select(['id', 'name', 'serialNumber'])
            .where('id', 'in', deviceIds)
            .execute()
        : Promise.resolve([]),
      this.directories.resolveUserNames(assigneeIds),
    ]);
    const customerById = new Map(customers.map((row) => [Number(row.id), row]));
    const deviceById = new Map(devices.map((row) => [Number(row.id), row]));
    return rows.map((row) => {
      const customer = customerById.get(Number(row.customerId));
      const device = deviceById.get(Number(row.deviceId));
      const assigneeId = row.assigneeId ? String(row.assigneeId) : null;
      return {
        ...row,
        customerName: customer ? String(customer.name) : null,
        deviceName: device ? String(device.name) : null,
        deviceSerialNumber: device ? String(device.serialNumber) : null,
        assigneeName: assigneeId ? (people.get(assigneeId) ?? null) : null,
      };
    });
  }

  private async nextInspectionCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INS-${year}-`;
    const rows = await this.database
      .query()
      .selectFrom('service_inspections')
      .select('code')
      .where('code', 'like', `${prefix}%`)
      .execute();
    let max = 0;
    for (const row of rows) {
      const suffix = Number(String(row.code).slice(prefix.length));
      if (Number.isFinite(suffix) && suffix > max) max = suffix;
    }
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }
}
