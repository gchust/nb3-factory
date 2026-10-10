import type { FilterBuilder } from '@nocobase/repository-input';

import type { Page, ListQuery } from './catalog.js';
import {
  authorizeCompositeAction,
  scopedRepository,
  type RequestServiceContext,
  type ServiceRuntime,
} from './context.js';
import { conflict, notFound } from './errors.js';
import { sendInAppNotice } from './notify.js';
import type {
  DeviceRow,
  ServiceGroupRow,
  ServiceInspectionRow,
  ServiceOrderRow,
} from './types.js';

const OPEN_ORDER_STATUSES = [
  'pending_acceptance',
  'pending_processing',
  'processing',
  'pending_confirmation',
] as const;

function page<T>(rows: T[], total: number, query: ListQuery): Page<T> {
  return {
    rows,
    total,
    limit: query.limit ?? rows.length,
    offset: query.offset ?? 0,
  };
}

function dateOnly(value: string | Date): string {
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

/** 90 days after a completed inspection, the next one is planned. */
function nextInspectionDate(from: string | Date): string {
  const base = new Date(
    from instanceof Date
      ? from.toISOString()
      : `${dateOnly(from)}T00:00:00.000Z`,
  );
  base.setUTCDate(base.getUTCDate() + 90);
  return base.toISOString();
}

export async function listInspections(
  context: RequestServiceContext,
  query: ListQuery & {
    status?: string;
    deviceId?: number;
    assigneeId?: string;
  },
): Promise<Page<ServiceInspectionRow>> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.inspections',
    ['view'],
  );
  const inspections = scopedRepository<ServiceInspectionRow>(
    context.database,
    'service_inspections',
    policies,
  );
  const filter = (builder: FilterBuilder) =>
    builder.and([
      ...(query.status ? [builder.string('status').eq(query.status)] : []),
      ...(query.deviceId !== undefined
        ? [builder.number('deviceId').eq(query.deviceId)]
        : []),
      ...(query.assigneeId
        ? [builder.string('assigneeId').eq(query.assigneeId)]
        : []),
    ]);
  const rows = await inspections.findMany({
    filter,
    sort: (sort) => [sort.field('plannedDate').desc(), sort.field('id').desc()],
    limit: query.limit,
    offset: query.offset,
  });
  const total = await inspections.count({ filter });
  return page(rows, total, query);
}

export async function getInspection(
  context: RequestServiceContext,
  id: number,
): Promise<ServiceInspectionRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.inspections',
    ['view'],
  );
  const inspections = scopedRepository<ServiceInspectionRow>(
    context.database,
    'service_inspections',
    policies,
  );
  const inspection = await inspections.findOne({ filter: { id } });
  if (!inspection) {
    throw notFound('INSPECTION_NOT_FOUND', `Inspection ${id} was not found.`);
  }
  return inspection;
}

export async function createInspection(
  context: RequestServiceContext,
  input: { deviceId: number; plannedDate: string; assigneeId?: string | null },
): Promise<ServiceInspectionRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.inspections',
    ['complete'],
  );
  const inspections = scopedRepository<ServiceInspectionRow>(
    context.database,
    'service_inspections',
    policies,
  );
  const devices = scopedRepository<DeviceRow>(
    context.database,
    'devices',
    policies,
  );
  const device = await devices.findOne({ filter: { id: input.deviceId } });
  if (!device) {
    throw notFound(
      'DEVICE_NOT_FOUND',
      `Device ${input.deviceId} was not found.`,
    );
  }
  const plannedDate = dateOnly(input.plannedDate);
  const idempotencyKey = `inspection:${input.deviceId}:${plannedDate}`;
  const existing = await inspections.findOne({ filter: { idempotencyKey } });
  if (existing) {
    return existing;
  }
  const now = new Date().toISOString();
  const result = await inspections.createOne({
    values: {
      deviceId: input.deviceId,
      assigneeId: input.assigneeId ?? device.engineerId ?? null,
      plannedDate,
      status: 'pending',
      result: null,
      resultCode: null,
      completedAt: null,
      source: 'manual',
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    } as never,
  });
  return result.record;
}

export async function completeInspection(
  context: RequestServiceContext,
  id: number,
  input: { result: string; resultCode: string; nextDate?: string | null },
): Promise<ServiceInspectionRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.inspections',
    ['complete'],
  );
  const inspections = scopedRepository<ServiceInspectionRow>(
    context.database,
    'service_inspections',
    policies,
  );
  const inspection = await inspections.findOne({ filter: { id } });
  if (!inspection) {
    throw notFound('INSPECTION_NOT_FOUND', `Inspection ${id} was not found.`);
  }
  if (inspection.status === 'completed') {
    throw conflict(
      'INSPECTION_COMPLETED',
      `Inspection ${id} is already completed.`,
    );
  }
  const now = new Date().toISOString();
  const result = await inspections.updateOne({
    filter: { id },
    values: {
      status: 'completed',
      result: input.result,
      resultCode: input.resultCode,
      completedAt: now,
      updatedAt: now,
    } as never,
  });
  if (!result.record) {
    throw notFound('INSPECTION_NOT_FOUND', `Inspection ${id} was not found.`);
  }

  const devices = context.database.repository<DeviceRow>('devices');
  await devices.updateOne({
    filter: { id: inspection.deviceId },
    values: {
      nextInspectionDate: input.nextDate ?? nextInspectionDate(now),
      updatedAt: now,
    },
  });
  return result.record;
}

/**
 * Plans an inspection for every enabled device whose next inspection date has
 * arrived and that does not already have a pending one.
 *
 * The `inspection:<deviceId>:<date>` idempotency key and the device/date unique
 * index make a repeated run safe: the job reports how many it actually created.
 */
export async function generateDueInspections(
  runtime: ServiceRuntime,
): Promise<{ created: number; notified: number }> {
  const today = dateOnly(new Date());
  const devices = runtime.database.repository<DeviceRow>('devices');
  const inspections = runtime.database.repository<ServiceInspectionRow>(
    'service_inspections',
  );

  const due = await devices.findMany({
    filter: (builder) =>
      builder.and([
        builder.boolean('enabled').isTrue(),
        builder.date('nextInspectionDate').notAfter(`${today}T23:59:59.999Z`),
      ]),
    limit: 500,
  });

  let created = 0;
  let notified = 0;
  for (const device of due) {
    const existing = await inspections.findOne({
      filter: (builder) =>
        builder.and([
          builder.number('deviceId').eq(device.id),
          builder.string('status').eq('pending'),
        ]),
    });
    if (existing) {
      continue;
    }
    const idempotencyKey = `inspection:${device.id}:${today}`;
    const alreadyPlanned = await inspections.findOne({
      filter: { idempotencyKey },
    });
    if (alreadyPlanned) {
      continue;
    }
    const now = new Date().toISOString();
    await inspections.createOne({
      values: {
        deviceId: device.id,
        assigneeId: device.engineerId ?? null,
        plannedDate: today,
        status: 'pending',
        result: null,
        resultCode: null,
        completedAt: null,
        source: 'scheduler',
        idempotencyKey,
        createdAt: now,
        updatedAt: now,
      } as never,
    });
    created += 1;
    if (device.engineerId) {
      const outcome = await sendInAppNotice(runtime, {
        idempotencyKey: `inspection-due:${device.id}:${today}`,
        referenceId: String(device.id),
        to: [device.engineerId],
        title: 'Inspection due',
        body: `Device ${device.code} ${device.name} is due for an inspection.`,
        path: '/inspections',
      });
      if (outcome.sent && !outcome.deduplicated) {
        notified += 1;
      }
    }
  }
  return { created, notified };
}

export interface DashboardGroupCount {
  readonly groupId: number;
  readonly code: string;
  readonly name: string;
  readonly orders: number;
}

export interface DashboardSummary {
  readonly openOrders: number;
  readonly overdueOrders: number;
  readonly myOrders: number;
  readonly pendingInspections: number;
  readonly devicesDue: number;
  readonly byStatus: Readonly<Record<string, number>>;
  readonly recentOrders: ServiceOrderRow[];
  /**
   * Per-group open-order counts, present only for a principal whose dashboard
   * grant is unrestricted. An engineer's dashboard is row-scoped, so counting
   * groups would report only their own orders and imply a team view they do
   * not have.
   */
  readonly groupCounts: readonly DashboardGroupCount[];
}

export async function dashboardSummary(
  context: RequestServiceContext,
): Promise<DashboardSummary> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.dashboard',
    ['view'],
  );
  const orders = scopedRepository<ServiceOrderRow>(
    context.database,
    'service_orders',
    policies,
  );
  const devices = scopedRepository<DeviceRow>(
    context.database,
    'devices',
    policies,
  );
  const inspections = scopedRepository<ServiceInspectionRow>(
    context.database,
    'service_inspections',
    policies,
  );

  const now = new Date().toISOString();
  const today = dateOnly(now);
  const byStatus: Record<string, number> = {};
  for (const status of OPEN_ORDER_STATUSES) {
    byStatus[status] = await orders.count({ filter: { status } });
  }
  const openOrders = Object.values(byStatus).reduce(
    (sum, value) => sum + value,
    0,
  );
  const overdueOrders = await orders.count({
    filter: (builder) =>
      builder.and([
        builder.or(
          OPEN_ORDER_STATUSES.map((status) =>
            builder.string('status').eq(status),
          ),
        ),
        builder.date('dueAt').before(now),
      ]),
  });
  const myOrders = await orders.count({
    filter: { assigneeId: context.actorId },
  });
  const pendingInspections = await inspections.count({
    filter: { status: 'pending' },
  });
  const devicesDue = await devices.count({
    filter: (builder) =>
      builder.and([
        builder.boolean('enabled').isTrue(),
        builder.date('nextInspectionDate').notAfter(`${today}T23:59:59.999Z`),
      ]),
  });
  const recentOrders = await orders.findMany({
    sort: (sort) => [sort.field('createdAt').desc()],
    limit: 8,
  });
  // The dashboard grant carries the unrestricted `allRecords` scope for a
  // supervisor and a row filter for an engineer. The scoped order repository
  // already hides what the caller may not see, and only an unrestricted read
  // policy means the summary covers the whole team, so a row-scoped engineer
  // gets no team-wide figures. `allRecords` resolves to a read node whose own
  // scope is `true` rather than to a naked `true`.
  const orderRead = policies['service_orders']?.read;
  const seesEveryOrder =
    orderRead === undefined ||
    orderRead === true ||
    (typeof orderRead === 'object' && orderRead.scope === true);
  const groupCounts: DashboardGroupCount[] = [];
  if (seesEveryOrder) {
    const groups =
      context.database.repository<ServiceGroupRow>('service_groups');
    const groupRows = await groups.findMany({
      sort: (sort) => sort.field('code').asc(),
    });
    for (const group of groupRows) {
      groupCounts.push({
        groupId: group.id,
        code: group.code,
        name: group.name,
        orders: await orders.count({ filter: { groupId: group.id } }),
      });
    }
  }
  return {
    openOrders,
    overdueOrders,
    myOrders,
    pendingInspections,
    devicesDue,
    byStatus,
    recentOrders,
    groupCounts,
  };
}
