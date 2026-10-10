/**
 * The order-acceptance transition, shared by the workflow run handlers and the
 * application's order service.
 *
 * It lives in server-owned source because a materialized workflow run handler
 * may import only external packages and modules of its own artifact: a relative
 * import reaching out to `server/` breaks the built artifact, and a server
 * import into `workflows/` breaks the server because the workflow build replaces
 * the compiled package with digest-addressed artifacts. The workflow handler
 * therefore reaches this implementation through the application container, by
 * the shared `orderAcceptanceServiceToken` defined at the bottom of this file.
 *
 * `server/services/orders.ts` and `server/services/acceptance.ts` import it as an
 * ordinary module, so the transition is implemented exactly once.
 */
import type { DatabaseManager, RepositoryOperations } from '@nocobase/db';
import type { ServiceToken } from '@nocobase/service-provider';

interface OrderRecord {
  id: number;
  orderNo: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  confidential: boolean;
  assigneeId: string | null;
  groupId: number | null;
  deviceId: number;
  acceptedAt: string | null;
  acceptanceNote: string | null;
}

/**
 * The acceptance note the automatic branch produces when the caller supplied
 * none: an urgent order is acknowledged as prioritized, every other order as
 * normally scheduled. The note is stored on the order, so the branch the
 * acceptance took is visible long after the run finished.
 */
export function acceptanceBranchNote(
  priority: string,
  dueAt?: string | null,
): string {
  if (priority === 'urgent') {
    return dueAt
      ? `Urgent order accepted and prioritized; complete before ${dueAt}.`
      : 'Urgent order accepted and prioritized for immediate handling.';
  }
  return 'Standard order accepted and scheduled for normal handling.';
}

interface DeviceRecord {
  id: number;
  engineerId: string | null;
  groupId: number | null;
}

interface OrderLogRecord {
  id: number;
  orderId: number;
  action: string;
  status: string;
  message: string | null;
  detail: unknown;
  actorId: string | null;
  idempotencyKey: string;
  createdAt: string;
}

export interface AcceptOrderInput {
  readonly orderId: number;
  /**
   * `true` when a supervisor accepted the order explicitly. A confidential
   * order is only ever accepted this way; the automatic path refuses it.
   */
  readonly manual: boolean;
  readonly actorId?: string | null;
  readonly acceptanceNote?: string | null;
  /** Stable key for the audit log; the workflow passes its trigger event key. */
  readonly eventKey?: string | null;
  /** Overrides the device's default engineer, for an explicit assignment. */
  readonly assigneeId?: string | null;
  readonly groupId?: number | null;
}

export interface AcceptOrderResult {
  readonly orderId: number;
  readonly orderNo: string;
  readonly title: string;
  readonly accepted: boolean;
  /** The order's status after the call. */
  readonly status: string;
  readonly assigneeId: string | null;
  readonly groupId: number | null;
  readonly confidential: boolean;
  /** The acceptance note stored on the order, branch-specific when automatic. */
  readonly acceptanceNote: string | null;
  /** Why the order was not accepted, or `accepted` / `already_accepted`. */
  readonly reason: string;
}

/** Inserts an audit row once; a repeated key is reported instead of thrown. */
export async function writeOrderLog(
  database: DatabaseManager,
  entry: {
    orderId: number;
    action: string;
    status: string;
    message?: string | null;
    detail?: unknown;
    actorId?: string | null;
    idempotencyKey: string;
  },
): Promise<boolean> {
  const logs = database.repository<OrderLogRecord>('service_order_logs');
  const existing = await logs.findOne({
    filter: { idempotencyKey: entry.idempotencyKey },
  });
  if (existing) {
    return false;
  }
  const now = new Date().toISOString();
  try {
    // The values are asserted once: a hand-written row interface (JSON column as
    // `unknown`, datetime as ISO string) and the repository's generated mutation
    // input type (JSON value union, `string | Date`) describe the same columns
    // with different precision. Every field is supplied explicitly.
    await logs.createOne({
      values: {
        orderId: entry.orderId,
        action: entry.action,
        status: entry.status,
        message: entry.message ?? null,
        detail: (entry.detail ?? null) as never,
        actorId: entry.actorId ?? null,
        idempotencyKey: entry.idempotencyKey,
        createdAt: now,
      } as never,
    });
    return true;
  } catch (error) {
    // A concurrent writer won the unique-key race: the log exists, which is
    // exactly the idempotent outcome, so this is not an error.
    const raced = await logs.findOne({
      filter: { idempotencyKey: entry.idempotencyKey },
    });
    if (raced) {
      return false;
    }
    throw error;
  }
}

/**
 * Moves an order from `pending_acceptance` to `pending_processing`.
 *
 * The call is status-guarded and idempotent: an order that is already past
 * acceptance is reported as such instead of being moved again. The automatic
 * path refuses a confidential order, which must be accepted by a supervisor.
 */
export async function acceptOrderRecord(
  database: DatabaseManager,
  input: AcceptOrderInput,
): Promise<AcceptOrderResult> {
  const orders: RepositoryOperations<OrderRecord> =
    database.repository<OrderRecord>('service_orders');
  const order = await orders.findOne({ filter: { id: input.orderId } });
  if (!order) {
    return {
      orderId: input.orderId,
      orderNo: '',
      title: '',
      accepted: false,
      status: 'missing',
      assigneeId: null,
      groupId: null,
      confidential: false,
      acceptanceNote: null,
      reason: 'order_not_found',
    };
  }
  if (order.status !== 'pending_acceptance') {
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      title: order.title,
      accepted: true,
      status: order.status,
      assigneeId: order.assigneeId,
      groupId: order.groupId,
      confidential: order.confidential,
      acceptanceNote: order.acceptanceNote,
      reason: 'already_processed',
    };
  }
  if (order.confidential && !input.manual) {
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      title: order.title,
      accepted: false,
      status: order.status,
      assigneeId: order.assigneeId,
      groupId: order.groupId,
      confidential: true,
      acceptanceNote: order.acceptanceNote,
      reason: 'confidential_requires_manual_acceptance',
    };
  }

  let assigneeId = input.assigneeId ?? order.assigneeId;
  let groupId = input.groupId ?? order.groupId;
  if (!assigneeId || !groupId) {
    const devices: RepositoryOperations<DeviceRecord> =
      database.repository<DeviceRecord>('devices');
    const device = await devices.findOne({ filter: { id: order.deviceId } });
    assigneeId = assigneeId ?? device?.engineerId ?? null;
    groupId = groupId ?? device?.groupId ?? null;
  }

  // The normal/urgent branch decides the note when the caller sent none, and
  // the branch is recorded in the audit detail so the acceptance path stays
  // inspectable even when an administrator later edits the note.
  const branch = order.priority === 'urgent' ? 'urgent' : 'normal';
  const acceptanceNote =
    input.acceptanceNote ??
    order.acceptanceNote ??
    acceptanceBranchNote(order.priority, order.dueAt);

  const now = new Date().toISOString();
  await orders.updateOne({
    filter: { id: order.id, status: 'pending_acceptance' },
    values: {
      status: 'pending_processing',
      acceptedAt: now,
      updatedAt: now,
      assigneeId,
      groupId,
      acceptanceNote,
    } as never,
  });

  await writeOrderLog(database, {
    orderId: order.id,
    action: input.manual ? 'accept_manual' : 'accept_auto',
    status: 'pending_processing',
    message: input.manual
      ? 'Order accepted by a supervisor'
      : 'Order accepted automatically and assigned to the device engineer',
    detail: {
      assigneeId,
      groupId,
      manual: input.manual,
      branch,
      acceptanceNote,
    },
    actorId: input.actorId ?? null,
    idempotencyKey: input.eventKey ?? `accept:${order.id}`,
  });

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    title: order.title,
    accepted: true,
    status: 'pending_processing',
    assigneeId,
    groupId,
    confidential: order.confidential,
    acceptanceNote,
    reason: 'accepted',
  };
}

/**
 * The half of this module a workflow run handler may call.
 *
 * The handler has already resolved its database connection, so this service
 * binds the application's database and exposes only the guarded transition.
 */
export interface OrderAcceptanceService {
  acceptOrderRecord(input: AcceptOrderInput): Promise<AcceptOrderResult>;
}

/**
 * Gives the application container and a workflow run handler the same token.
 *
 * The handler is materialized into its own artifact and may not import this
 * module, so the two copies cannot share an imported `createServiceToken`
 * result. `Symbol.for` names one registry slot across both copies and
 * `globalThis` holds the single token object they then agree on. Keep the key
 * and the mirror in `workflows/order-acceptance/server/accept-order.ts` in sync.
 */
const ORDER_ACCEPTANCE_TOKEN_KEY = Symbol.for(
  'nb3-factory.service-order-acceptance',
);

interface OrderAcceptanceTokenRegistry {
  orderAcceptance?: ServiceToken<OrderAcceptanceService>;
}

const tokenRegistry = globalThis as unknown as Record<
  symbol,
  OrderAcceptanceTokenRegistry | undefined
>;
const tokens = (tokenRegistry[ORDER_ACCEPTANCE_TOKEN_KEY] ??= {});

export const orderAcceptanceServiceToken: ServiceToken<OrderAcceptanceService> =
  tokens.orderAcceptance ??
  (tokens.orderAcceptance = {
    name: 'app/service-order-acceptance',
  } as ServiceToken<OrderAcceptanceService>);
