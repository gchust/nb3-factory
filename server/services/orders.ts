import { randomUUID } from 'node:crypto';

import type { FilterBuilder } from '@nocobase/repository-input';

import {
  authorizeCompositeAction,
  scopedRepository,
  type CompositePolicies,
  type RequestServiceContext,
  type ServiceRuntime,
} from './context.js';
import { conflict, invalid, notFound } from './errors.js';
import {
  notifyOrderReturned,
  notifyOrderSubmitted,
  sendInAppNotice,
} from './notify.js';
import {
  acceptOrderRecord,
  writeOrderLog,
  type AcceptOrderResult,
} from './order-lifecycle.js';
import type { Page, ListQuery } from './catalog.js';
import type {
  CustomerRow,
  DeviceRow,
  OrderStatus,
  ServiceOrderFileRow,
  ServiceOrderLogRow,
  ServiceOrderRow,
  ServiceOrderShareRow,
} from './types.js';

const OPEN_STATUSES: OrderStatus[] = [
  'pending_acceptance',
  'pending_processing',
  'processing',
  'pending_confirmation',
];

const READ_ACTIONS = ['view', 'viewSummary'] as const;

function page<T>(rows: T[], total: number, query: ListQuery): Page<T> {
  return {
    rows,
    total,
    limit: query.limit ?? rows.length,
    offset: query.offset ?? 0,
  };
}

export interface CreateOrderInput {
  orderNo?: string | null;
  title: string;
  customerId?: number | null;
  deviceId: number;
  description?: string | null;
  priority?: string;
  dueAt?: string | null;
  assigneeId?: string | null;
  groupId?: number | null;
  confidential?: boolean;
  observerVisible?: boolean;
  source?: string;
  externalEventId?: string | null;
}

function generateOrderNo(): string {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `SO-${stamp}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function listOrders(
  context: RequestServiceContext,
  query: ListQuery & {
    status?: string;
    assigneeId?: string;
    customerId?: number;
    deviceId?: number;
    priority?: string;
    dueBefore?: string;
  },
): Promise<Page<ServiceOrderRow>> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.orders',
    READ_ACTIONS,
  );
  const orders = scopedRepository<ServiceOrderRow>(
    context.database,
    'service_orders',
    policies,
  );
  const keyword = query.keyword?.trim();
  const filter = (builder: FilterBuilder) =>
    builder.and([
      ...(query.status ? [builder.string('status').eq(query.status)] : []),
      ...(query.assigneeId
        ? [builder.string('assigneeId').eq(query.assigneeId)]
        : []),
      ...(query.customerId !== undefined
        ? [builder.number('customerId').eq(query.customerId)]
        : []),
      ...(query.deviceId !== undefined
        ? [builder.number('deviceId').eq(query.deviceId)]
        : []),
      ...(query.priority
        ? [builder.string('priority').eq(query.priority)]
        : []),
      ...(query.dueBefore
        ? [builder.date('dueAt').notAfter(query.dueBefore)]
        : []),
      ...(keyword
        ? [
            builder.or([
              builder
                .string('orderNo')
                .includes(keyword, { mode: 'insensitive' }),
              builder
                .string('title')
                .includes(keyword, { mode: 'insensitive' }),
            ]),
          ]
        : []),
    ]);
  const rows = await orders.findMany({
    filter,
    sort: (sort) => [sort.field('createdAt').desc()],
    limit: query.limit,
    offset: query.offset,
  });
  const total = await orders.count({ filter });
  return page(rows, total, query);
}

export async function getOrder(
  context: RequestServiceContext,
  id: number,
): Promise<ServiceOrderRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.orders',
    READ_ACTIONS,
  );
  const orders = scopedRepository<ServiceOrderRow>(
    context.database,
    'service_orders',
    policies,
  );
  const order = await orders.findOne({ filter: { id } });
  if (!order) {
    throw notFound('ORDER_NOT_FOUND', `Service order ${id} was not found.`);
  }
  return order;
}

/**
 * Creates an order, deduplicating by `externalEventId` and by `orderNo`.
 *
 * The two natural keys are what make the operation idempotent: a retried
 * platform event or a retried form submission returns the order that already
 * exists instead of creating a second one. `created` reports which happened.
 */
export async function createOrder(
  context: RequestServiceContext,
  input: CreateOrderInput,
): Promise<{ order: ServiceOrderRow; created: boolean }> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.orders',
    ['create'],
  );
  return insertOrder(context, policies, input);
}

/**
 * The order insert itself, with the data scopes already resolved.
 *
 * Shared so the platform-event path can create an order under its own
 * `service.integration.submit` scopes instead of being denied by the narrower
 * `service.orders.create` check it does not hold.
 */
export async function insertOrder(
  context: RequestServiceContext,
  policies: CompositePolicies,
  input: CreateOrderInput,
): Promise<{ order: ServiceOrderRow; created: boolean }> {
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

  const device = await devices.findOne({ filter: { id: input.deviceId } });
  if (!device) {
    throw notFound(
      'DEVICE_NOT_FOUND',
      `Device ${input.deviceId} was not found.`,
    );
  }
  const customerId = input.customerId ?? device.customerId;
  // A device belongs to exactly one customer, so an explicitly supplied
  // customer that disagrees with the device is a data-entry mistake rather
  // than an override; reject it instead of silently rewriting the customer.
  if (input.customerId != null && input.customerId !== device.customerId) {
    throw invalid(
      'ORDER_DEVICE_CUSTOMER_MISMATCH',
      `Device ${input.deviceId} belongs to customer ${device.customerId}, not customer ${input.customerId}.`,
    );
  }

  if (input.externalEventId) {
    const existing = await orders.findOne({
      filter: { externalEventId: input.externalEventId },
    });
    if (existing) {
      return { order: existing, created: false };
    }
  }
  if (input.orderNo) {
    const existing = await orders.findOne({
      filter: { orderNo: input.orderNo },
    });
    if (existing) {
      return { order: existing, created: false };
    }
  }

  const now = new Date().toISOString();
  const result = await orders.createOne({
    values: {
      orderNo: input.orderNo ?? generateOrderNo(),
      title: input.title,
      customerId,
      deviceId: input.deviceId,
      description: input.description ?? null,
      priority: input.priority ?? 'normal',
      dueAt: input.dueAt ?? null,
      assigneeId: input.assigneeId ?? device.engineerId ?? null,
      groupId: input.groupId ?? device.groupId ?? null,
      confidential: input.confidential ?? false,
      observerVisible: input.observerVisible ?? false,
      status: 'pending_acceptance',
      source: input.source ?? 'internal',
      externalEventId: input.externalEventId ?? null,
      createdById: context.actorId,
      createdAt: now,
      updatedAt: now,
    } as never,
  });
  const order = result.record;
  await writeOrderLog(context.database, {
    orderId: order.id,
    action: 'create',
    status: order.status,
    message: `Order ${order.orderNo} created`,
    detail: { source: order.source },
    actorId: context.actorId,
    idempotencyKey: `create:${order.id}`,
  });
  return { order, created: true };
}

/**
 * Resolves an order the caller may process, or throws.
 *
 * The acceptance workflow runs outside a request and therefore cannot check
 * permissions itself; the route calls this first so the automation only ever
 * touches an order the caller is allowed to move.
 */
export async function requireProcessableOrder(
  context: RequestServiceContext,
  id: number,
): Promise<ServiceOrderRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.orders',
    ['process'],
  );
  const orders = scopedRepository<ServiceOrderRow>(
    context.database,
    'service_orders',
    policies,
  );
  const order = await orders.findOne({ filter: { id } });
  if (!order) {
    throw notFound('ORDER_NOT_FOUND', `Service order ${id} was not found.`);
  }
  return order;
}

/** Accepts an order manually, which is the only path for a confidential one. */
export async function acceptOrder(
  context: RequestServiceContext,
  id: number,
  acceptanceNote?: string | null,
): Promise<AcceptOrderResult> {
  await requireProcessableOrder(context, id);
  return acceptOrderRecord(context.database, {
    orderId: id,
    manual: true,
    actorId: context.actorId,
    acceptanceNote: acceptanceNote ?? null,
    eventKey: `order-accept:${id}:${randomUUID()}`,
  });
}

interface TransitionOptions {
  readonly action: string;
  readonly readActions?: readonly string[];
  readonly from: readonly OrderStatus[];
  readonly to: OrderStatus;
  readonly logAction: string;
  readonly logMessage: string;
  readonly fields?: Record<string, unknown>;
  readonly detail?: Record<string, unknown>;
  /**
   * Best-effort side effect raised once the transition is committed. It runs
   * after the audit entry, so a notification describes a state that is already
   * durable; the callbacks themselves never throw.
   */
  readonly notify?: (
    runtime: RequestServiceContext,
    order: ServiceOrderRow,
  ) => Promise<unknown>;
}

async function transition(
  context: RequestServiceContext,
  id: number,
  options: TransitionOptions,
): Promise<ServiceOrderRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.orders',
    [options.action],
  );
  const orders = scopedRepository<ServiceOrderRow>(
    context.database,
    'service_orders',
    policies,
  );
  const order = await orders.findOne({ filter: { id } });
  if (!order) {
    throw notFound('ORDER_NOT_FOUND', `Service order ${id} was not found.`);
  }
  if (!options.from.includes(order.status as OrderStatus)) {
    throw conflict(
      'ORDER_STATUS_CONFLICT',
      `Order ${order.orderNo} is ${order.status} and cannot move to ${options.to}.`,
    );
  }
  const now = new Date().toISOString();
  const result = await orders.updateOne({
    filter: { id, status: order.status },
    values: { status: options.to, updatedAt: now, ...options.fields } as never,
  });
  if (!result.record) {
    throw conflict(
      'ORDER_STATUS_CONFLICT',
      `Order ${order.orderNo} changed while this request was in flight.`,
    );
  }
  await writeOrderLog(context.database, {
    orderId: id,
    action: options.logAction,
    status: options.to,
    message: options.logMessage,
    detail: options.detail ?? null,
    actorId: context.actorId,
    idempotencyKey: `${options.logAction}:${id}:${randomUUID()}`,
  });
  if (options.notify) {
    await options.notify(context, result.record);
  }
  return result.record;
}

export function startOrder(
  context: RequestServiceContext,
  id: number,
): Promise<ServiceOrderRow> {
  return transition(context, id, {
    action: 'process',
    from: ['pending_processing'],
    to: 'processing',
    logAction: 'start',
    logMessage: 'Processing started',
    fields: { processingAt: new Date().toISOString() },
  });
}

export function submitOrder(
  context: RequestServiceContext,
  id: number,
  resolution: string,
): Promise<ServiceOrderRow> {
  return transition(context, id, {
    action: 'process',
    from: ['processing'],
    to: 'pending_confirmation',
    logAction: 'submit',
    logMessage: 'Submitted for customer confirmation',
    fields: { resolution, submittedAt: new Date().toISOString() },
    detail: { resolution },
    notify: (runtime, order) => notifyOrderSubmitted(runtime, order),
  });
}

export function confirmOrder(
  context: RequestServiceContext,
  id: number,
): Promise<ServiceOrderRow> {
  return transition(context, id, {
    action: 'confirm',
    from: ['pending_confirmation'],
    to: 'closed',
    logAction: 'confirm',
    logMessage: 'Confirmed and closed',
    fields: { closedAt: new Date().toISOString() },
  });
}

export function returnOrder(
  context: RequestServiceContext,
  id: number,
  returnReason: string,
): Promise<ServiceOrderRow> {
  return transition(context, id, {
    action: 'confirm',
    from: ['pending_confirmation'],
    to: 'pending_processing',
    logAction: 'return',
    logMessage: 'Returned for further work',
    fields: { returnReason },
    detail: { returnReason },
    notify: (runtime, order) => notifyOrderReturned(runtime, order),
  });
}

export async function assignOrder(
  context: RequestServiceContext,
  id: number,
  patch: {
    assigneeId?: string | null;
    groupId?: number | null;
    dueAt?: string | null;
    priority?: string;
    observerVisible?: boolean;
  },
): Promise<ServiceOrderRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.orders',
    ['assign'],
  );
  const orders = scopedRepository<ServiceOrderRow>(
    context.database,
    'service_orders',
    policies,
  );
  const order = await orders.findOne({ filter: { id } });
  if (!order) {
    throw notFound('ORDER_NOT_FOUND', `Service order ${id} was not found.`);
  }
  const values: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  for (const key of [
    'assigneeId',
    'groupId',
    'dueAt',
    'priority',
    'observerVisible',
  ] as const) {
    if (patch[key] !== undefined) {
      values[key] = patch[key];
    }
  }
  const result = await orders.updateOne({
    filter: { id },
    values: values as never,
  });
  if (!result.record) {
    throw notFound('ORDER_NOT_FOUND', `Service order ${id} was not found.`);
  }
  await writeOrderLog(context.database, {
    orderId: id,
    action: 'assign',
    status: order.status,
    message: 'Assignment updated',
    detail: { ...patch },
    actorId: context.actorId,
    idempotencyKey: `assign:${id}:${randomUUID()}`,
  });

  if (patch.assigneeId && patch.assigneeId !== order.assigneeId) {
    await sendInAppNotice(context, {
      idempotencyKey: `order-assigned:${id}:${patch.assigneeId}`,
      referenceId: String(id),
      to: [patch.assigneeId],
      title: 'New service order assigned',
      body: `${order.orderNo} ${order.title} was assigned to you.`,
      path: `/orders/${id}`,
    });
  }
  return result.record;
}

export async function grantOrderShare(
  context: RequestServiceContext,
  id: number,
  input: {
    engineerId: string;
    note?: string | null;
    expiresAt?: string | null;
  },
): Promise<ServiceOrderShareRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.orders',
    ['share'],
  );
  const orders = scopedRepository<ServiceOrderRow>(
    context.database,
    'service_orders',
    policies,
  );
  const order = await orders.findOne({ filter: { id } });
  if (!order) {
    throw notFound('ORDER_NOT_FOUND', `Service order ${id} was not found.`);
  }
  // A confidential order is manual-acceptance-only and its visibility must not
  // widen through the temporary-collaboration share, so refuse to create one.
  if (order.confidential) {
    throw conflict(
      'CONFIDENTIAL_ORDER_SHARE_FORBIDDEN',
      `Service order ${id} is confidential and cannot be shared.`,
    );
  }
  const now = new Date().toISOString();
  const shares = scopedRepository<ServiceOrderShareRow>(
    context.database,
    'service_order_shares',
    policies,
  );
  const existingShares = await shares.findMany({
    filter: { orderId: id, engineerId: input.engineerId },
  });
  const existing =
    existingShares.find((share) => share.revokedAt === null) ??
    existingShares[0];
  if (existing) {
    const updated = await shares.updateOne({
      filter: { id: existing.id },
      values: {
        note: input.note ?? existing.note ?? null,
        expiresAt: input.expiresAt ?? existing.expiresAt ?? null,
        revokedAt: null,
        updatedAt: now,
      } as never,
    });
    return updated.record;
  }
  const created = await shares.createOne({
    values: {
      orderId: id,
      engineerId: input.engineerId,
      grantedById: context.actorId,
      note: input.note ?? null,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    } as never,
  });
  await writeOrderLog(context.database, {
    orderId: id,
    action: 'share_grant',
    status: order.status,
    message: 'Temporary collaboration access granted',
    detail: {
      engineerId: input.engineerId,
      note: input.note ?? null,
      expiresAt: input.expiresAt ?? null,
    },
    actorId: context.actorId,
    idempotencyKey: `share:${created.record.id}:grant`,
  });
  await sendInAppNotice(context, {
    idempotencyKey: `order-shared:${created.record.id}`,
    referenceId: String(id),
    to: [input.engineerId],
    title: 'You were invited to a service order',
    body: `${order.orderNo} ${order.title} was shared with you temporarily.`,
    path: `/orders/${id}`,
  });
  return created.record;
}

export async function revokeOrderShare(
  context: RequestServiceContext,
  id: number,
  shareId: number,
): Promise<ServiceOrderShareRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.orders',
    ['share'],
  );
  const shares = scopedRepository<ServiceOrderShareRow>(
    context.database,
    'service_order_shares',
    policies,
  );
  const share = await shares.findOne({ filter: { id: shareId, orderId: id } });
  if (!share) {
    throw notFound(
      'SHARE_NOT_FOUND',
      `Share ${shareId} was not found for order ${id}.`,
    );
  }
  const now = new Date().toISOString();
  const result = await shares.updateOne({
    filter: { id: shareId },
    values: { revokedAt: now, updatedAt: now } as never,
  });
  await writeOrderLog(context.database, {
    orderId: id,
    action: 'share_revoke',
    status: 'shared',
    message: 'Temporary collaboration access revoked',
    detail: { shareId, engineerId: share.engineerId },
    actorId: context.actorId,
    idempotencyKey: `share:${shareId}:revoke`,
  });
  return result.record;
}

export async function listOrderTimeline(
  context: RequestServiceContext,
  id: number,
): Promise<{ logs: ServiceOrderLogRow[]; shares: ServiceOrderShareRow[] }> {
  await getOrder(context, id);
  const logs =
    context.database.repository<ServiceOrderLogRow>('service_order_logs');
  const shares = context.database.repository<ServiceOrderShareRow>(
    'service_order_shares',
  );
  return {
    logs: await logs.findMany({
      filter: { orderId: id },
      sort: (sort) => [sort.field('createdAt').desc()],
      limit: 200,
    }),
    shares: await shares.findMany({
      filter: { orderId: id },
      sort: (sort) => [sort.field('createdAt').desc()],
      limit: 200,
    }),
  };
}

export async function listOrderAttachments(
  context: RequestServiceContext,
  id: number,
): Promise<ServiceOrderFileRow[]> {
  await getOrder(context, id);
  const files = context.database.repository<ServiceOrderFileRow>(
    'service_order_files',
  );
  return files.findMany({
    filter: { orderId: id },
    sort: (sort) => [sort.field('createdAt').desc()],
  });
}

export async function attachOrderFile(
  context: RequestServiceContext,
  id: number,
  input: { fileId: string; category?: string | null },
): Promise<ServiceOrderFileRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.orders',
    ['process'],
  );
  const orders = scopedRepository<ServiceOrderRow>(
    context.database,
    'service_orders',
    policies,
  );
  const order = await orders.findOne({ filter: { id } });
  if (!order) {
    throw notFound('ORDER_NOT_FOUND', `Service order ${id} was not found.`);
  }
  const files = context.database.repository<ServiceOrderFileRow>(
    'service_order_files',
  );
  const file = await files.findOne({ filter: { id: input.fileId } });
  if (!file) {
    throw notFound(
      'FILE_NOT_FOUND',
      `Attachment ${input.fileId} was not found.`,
    );
  }
  const now = new Date().toISOString();
  const result = await files.updateOne({
    filter: { id: input.fileId },
    values: {
      orderId: id,
      category: input.category ?? 'other',
      updatedAt: now,
    } as never,
  });
  await writeOrderLog(context.database, {
    orderId: id,
    action: 'attachment_add',
    status: order.status,
    message: `Attachment ${file.filename} added`,
    detail: { fileId: file.id, category: input.category ?? 'other' },
    actorId: context.actorId,
    idempotencyKey: `attachment:${file.id}:attach`,
  });
  return result.record;
}

export async function detachOrderFile(
  context: RequestServiceContext,
  id: number,
  fileId: string,
): Promise<ServiceOrderFileRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.orders',
    ['process'],
  );
  const orders = scopedRepository<ServiceOrderRow>(
    context.database,
    'service_orders',
    policies,
  );
  const order = await orders.findOne({ filter: { id } });
  if (!order) {
    throw notFound('ORDER_NOT_FOUND', `Service order ${id} was not found.`);
  }
  const files = context.database.repository<ServiceOrderFileRow>(
    'service_order_files',
  );
  const file = await files.findOne({ filter: { id: fileId, orderId: id } });
  if (!file) {
    throw notFound(
      'FILE_NOT_FOUND',
      `Attachment ${fileId} was not found on order ${id}.`,
    );
  }
  const now = new Date().toISOString();
  const result = await files.updateOne({
    filter: { id: fileId },
    values: { orderId: null, category: null, updatedAt: now } as never,
  });
  await writeOrderLog(context.database, {
    orderId: id,
    action: 'attachment_remove',
    status: order.status,
    message: `Attachment ${file.filename} removed`,
    detail: { fileId },
    actorId: context.actorId,
    idempotencyKey: `attachment:${fileId}:detach`,
  });
  return result.record;
}

/**
 * Reminds the assignee of every open order past its due date, once per day.
 *
 * The scan runs from a scheduled job, so it has no request identity: it reads
 * orders without a policy and deliberately touches only orders that are due.
 * Each reminder carries a date-stamped idempotency key, which is what keeps a
 * repeated run from notifying the same person twice.
 */
export async function sendOverdueReminders(
  runtime: ServiceRuntime,
): Promise<number> {
  const now = new Date().toISOString();
  const orders = runtime.database.repository<ServiceOrderRow>('service_orders');
  const due = await orders.findMany({
    filter: (builder) =>
      builder.and([
        builder.or(
          OPEN_STATUSES.map((status) => builder.string('status').eq(status)),
        ),
        builder.date('dueAt').before(now),
      ]),
    limit: 500,
  });
  const today = now.slice(0, 10);
  let sent = 0;
  for (const order of due) {
    if (!order.assigneeId) {
      continue;
    }
    const outcome = await sendInAppNotice(runtime, {
      idempotencyKey: `overdue:${order.id}:${today}`,
      referenceId: String(order.id),
      to: [order.assigneeId],
      title: 'Service order overdue',
      body: `${order.orderNo} ${order.title} is past its due date.`,
      path: `/orders/${order.id}`,
    });
    if (outcome.sent && !outcome.deduplicated) {
      sent += 1;
    }
  }
  return sent;
}

export async function findCustomerById(
  context: RequestServiceContext,
  id: number,
): Promise<CustomerRow | undefined> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.orders',
    READ_ACTIONS,
  );
  const customers = scopedRepository<CustomerRow>(
    context.database,
    'customers',
    policies,
  );
  return customers.findOne({ filter: { id } });
}
