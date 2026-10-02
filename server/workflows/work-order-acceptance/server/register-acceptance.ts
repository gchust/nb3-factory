import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import { databaseManagerToken } from '@nocobase/db';

/**
 * The values below are duplicated from the application's `server/service/constants.ts` on purpose: a compiled
 * run module is copied into a content-addressed Artifact directory, so a relative import back into the
 * application's server tree no longer resolves. The workflow package stays self-contained.
 */
const ESCALATED_PRIORITIES: readonly string[] = ['high', 'urgent'];
const STATUS_PENDING_ACCEPTANCE = 'pending_acceptance';
const STATUS_PENDING_PROCESSING = 'pending_processing';
const EVENT_AUTO_ACCEPTED = 'auto_accepted';
const EVENT_ESCALATED = 'escalated';
const EVENT_ACCEPTED = 'accepted';

interface WorkOrderRow {
  id: number;
  code: string | null;
  title: string;
  priority: string;
  status: string;
  equipmentId: number;
  assigneeId: string | null;
  supervisorId: string | null;
}

interface EquipmentRow {
  id: number;
  engineerId: string | null;
}

interface RepositoryHost {
  repository<T>(name: string): {
    findOne(options: unknown): Promise<T | undefined>;
    updateOne(options: unknown): Promise<{ record: T }>;
    updateMany(options: unknown): Promise<unknown>;
    createOne(options: unknown): Promise<{ record: T }>;
  };
}

interface RegisterAcceptanceArgs {
  workOrderId?: unknown;
  mode?: unknown;
  actorId?: unknown;
  assigneeId?: unknown;
}

function optionalId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Accept a pending work order or escalate it, using the system connection because the decision is the
 * application's, not the caller's. This is the auto-acceptance branch of the workflow; the manual branch accepts
 * whatever the priority.
 */
async function applyAutoAcceptance(
  host: RepositoryHost,
  workOrder: WorkOrderRow,
  actorId: string | null,
): Promise<WorkOrderRow> {
  if (ESCALATED_PRIORITIES.includes(workOrder.priority)) {
    await host
      .repository<Record<string, unknown>>('serviceWorkOrderEvents')
      .createOne({
        values: {
          workOrderId: workOrder.id,
          type: EVENT_ESCALATED,
          status: 'succeeded',
          message:
            'High-priority work order escalated to the service supervisor.',
          detail: { priority: workOrder.priority },
          actorId,
          createdAt: new Date(),
        },
      });
    return workOrder;
  }
  const equipment = await host
    .repository<EquipmentRow>('serviceEquipment')
    .findOne({ filter: { id: workOrder.equipmentId } });
  const assigneeId = workOrder.assigneeId ?? equipment?.engineerId ?? null;
  const now = new Date();
  let accepted: WorkOrderRow;
  try {
    const updated = await host
      .repository<WorkOrderRow>('serviceWorkOrders')
      .updateOne({
        filter: { id: workOrder.id, status: STATUS_PENDING_ACCEPTANCE },
        values: {
          status: STATUS_PENDING_PROCESSING,
          acceptedAt: now,
          assigneeId,
          updatedAt: now,
        },
      });
    accepted = updated.record;
  } catch {
    accepted =
      (await host
        .repository<WorkOrderRow>('serviceWorkOrders')
        .findOne({ filter: { id: workOrder.id } })) ?? workOrder;
  }
  await host
    .repository<Record<string, unknown>>('serviceWorkOrderEvents')
    .createOne({
      values: {
        workOrderId: workOrder.id,
        type: EVENT_AUTO_ACCEPTED,
        status: 'succeeded',
        message:
          'Work order accepted automatically and dispatched to the responsible engineer.',
        detail: { assigneeId },
        actorId,
        createdAt: now,
      },
    });
  return accepted;
}

/**
 * Register the acceptance decision for one work order.
 *
 * The node is idempotent at the business level: an order that is no longer pending acceptance is reported as
 * already processed and left untouched, so a retried or duplicated trigger cannot advance the status twice.
 */
export const run: WorkflowRunFunction = async (
  rawArgs: unknown,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const args = rawArgs as RegisterAcceptanceArgs;
  const workOrderId = Number(args.workOrderId);
  if (!Number.isInteger(workOrderId) || workOrderId <= 0) {
    throw new Error('workOrderId must be a positive integer.');
  }
  const mode = args.mode === 'manual' ? 'manual' : 'auto';
  const actorId = optionalId(args.actorId);
  const requestedAssignee = optionalId(args.assigneeId);

  const database = options.services.resolve(databaseManagerToken);
  const host = database.connection() as unknown as RepositoryHost;
  const repository = host.repository<WorkOrderRow>('serviceWorkOrders');
  const workOrder = await repository.findOne({ filter: { id: workOrderId } });
  if (!workOrder) {
    throw new Error(`Work order ${workOrderId} was not found.`);
  }
  const escalated = ESCALATED_PRIORITIES.includes(workOrder.priority);

  if (workOrder.status !== STATUS_PENDING_ACCEPTANCE) {
    return {
      accepted: workOrder.status === STATUS_PENDING_PROCESSING,
      escalated,
      alreadyProcessed: true,
      assigneeId: workOrder.assigneeId,
      supervisorId: workOrder.supervisorId,
      code: workOrder.code,
      title: workOrder.title,
      priority: workOrder.priority,
    };
  }

  if (mode === 'auto') {
    const result = await applyAutoAcceptance(host, workOrder, actorId);
    return {
      accepted: result.status === STATUS_PENDING_PROCESSING,
      escalated,
      alreadyProcessed: false,
      assigneeId: result.assigneeId,
      supervisorId: result.supervisorId,
      code: result.code,
      title: result.title,
      priority: result.priority,
    };
  }

  const equipment = await host
    .repository<EquipmentRow>('serviceEquipment')
    .findOne({ filter: { id: workOrder.equipmentId } });
  const assigneeId =
    requestedAssignee ?? workOrder.assigneeId ?? equipment?.engineerId ?? null;
  const now = new Date();
  let accepted: WorkOrderRow;
  try {
    const updated = await repository.updateOne({
      filter: { id: workOrderId, status: STATUS_PENDING_ACCEPTANCE },
      values: {
        status: STATUS_PENDING_PROCESSING,
        acceptedAt: now,
        assigneeId,
        updatedAt: now,
      },
    });
    accepted = updated.record;
  } catch {
    accepted =
      (await repository.findOne({ filter: { id: workOrderId } })) ?? workOrder;
  }
  await host
    .repository<Record<string, unknown>>('serviceWorkOrderEvents')
    .createOne({
      values: {
        workOrderId,
        type: EVENT_ACCEPTED,
        status: 'succeeded',
        message: 'Work order accepted by the supervisor.',
        detail: { assigneeId },
        actorId,
        createdAt: now,
      },
    });

  return {
    accepted: true,
    escalated,
    alreadyProcessed: false,
    assigneeId: accepted.assigneeId,
    supervisorId: accepted.supervisorId,
    code: accepted.code,
    title: accepted.title,
    priority: accepted.priority,
  };
};
