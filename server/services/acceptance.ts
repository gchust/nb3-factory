import { acceptOrderRecord } from './order-lifecycle.js';
import type { RequestServiceContext, ServiceRuntime } from './context.js';
import { requireProcessableOrder } from './orders.js';
import { notifyAcceptanceOutcome } from './notify.js';
import type { ServiceOrderRow } from './types.js';

/**
 * Order acceptance, routed through the `order-acceptance` workflow.
 *
 * The workflow and the HTTP route share one transition, so acceptance is
 * idempotent either way. The route triggers the workflow and only falls back to
 * the direct transition when the workflow is not registered or is disabled,
 * which is what lets the application run with automation switched off. The
 * trigger uses a stable event key per order, so a retried request replays the
 * existing run instead of creating a second one.
 */

export const ORDER_ACCEPTANCE_WORKFLOW = 'order-acceptance';

/** The stable idempotency key of one order's acceptance. */
export function acceptanceEventKey(orderId: number): string {
  return `order-accept:${orderId}`;
}

export interface AcceptanceTriggerInput {
  readonly orderId: number;
  readonly manual: boolean;
  readonly actorId: string | null;
  readonly acceptanceNote?: string | null;
}

async function currentOrder(
  runtime: ServiceRuntime,
  orderId: number,
): Promise<ServiceOrderRow | undefined> {
  return runtime.database
    .repository<ServiceOrderRow>('service_orders')
    .findOne({ filter: { id: orderId } });
}

/** How often the acceptance wait re-reads the run, and how long it waits. */
const RUN_WAIT_INTERVAL_MS = 25;
const RUN_WAIT_TIMEOUT_MS = 20_000;

/** The terminal status the workflow engine records for a completed run. */
const EXECUTION_RESOLVED = 1;

interface WorkflowRunRow {
  id: string;
  eventKey: string | null;
  status: number | null;
  finishedAt: string | null;
}

/**
 * Waits until the run for `eventKey` reaches a terminal status.
 *
 * A `run` node executes after the processor yields, so `trigger` resolves
 * before the acceptance transition has run. The HTTP route promises its caller
 * an accepted order, so it waits for the run it started. The wait is bounded:
 * on timeout the caller falls back to the guarded, idempotent transition rather
 * than hanging the request. A late run then finds the order already accepted
 * and does nothing.
 */
async function waitForRun(
  runtime: ServiceRuntime,
  eventKey: string,
): Promise<number | null> {
  const runs = runtime.database.repository<WorkflowRunRow>('workflowRuns');
  const deadline = Date.now() + RUN_WAIT_TIMEOUT_MS;
  for (;;) {
    const row = await runs.findOne({ filter: { eventKey } });
    if (row?.finishedAt) {
      return row.status ?? null;
    }
    if (Date.now() >= deadline) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, RUN_WAIT_INTERVAL_MS));
  }
}

/**
 * Triggers the acceptance workflow and waits for the run to finish.
 *
 * `manually` is set only for an explicit supervisor acceptance: it is what lets
 * a confidential order be accepted and what makes the run happen even when the
 * workflow is disabled, which is the behaviour the manual endpoint promises.
 * The automatic path leaves the workflow's enabled state in charge.
 *
 * Returns `true` only when the run completed successfully. A workflow that is
 * not registered, was skipped as disabled, or whose run failed returns `false`
 * so the caller performs the direct transition instead.
 */
async function trigger(
  runtime: ServiceRuntime,
  input: AcceptanceTriggerInput,
): Promise<boolean> {
  const workflow = runtime.workflow;
  if (!workflow) {
    return false;
  }
  const eventKey = acceptanceEventKey(input.orderId);
  const receipt = await workflow.trigger(
    ORDER_ACCEPTANCE_WORKFLOW,
    {
      orderId: input.orderId,
      manual: input.manual,
      actorId: input.actorId,
      acceptanceNote: input.acceptanceNote ?? null,
      eventKey,
    },
    {
      deferred: true,
      manually: input.manual,
      eventKey,
      sourceType: 'service_order',
      sourceId: String(input.orderId),
    },
  );
  if (receipt.status !== 'accepted') {
    return false;
  }
  const status = await waitForRun(runtime, eventKey);
  if (status === EXECUTION_RESOLVED) {
    return true;
  }
  runtime.logger?.warn?.(
    { orderId: input.orderId, status },
    'The service order acceptance workflow did not resolve; using the direct transition.',
  );
  return false;
}

/**
 * Accepts an order on behalf of a signed-in user.
 *
 * The caller's `service.orders.process` permission and data scope are checked
 * before the workflow runs, because the run itself has no request identity. The
 * order returned afterwards is read back through the same authorized lookup.
 */
export async function acceptOrderAsUser(
  context: RequestServiceContext,
  orderId: number,
  acceptanceNote?: string | null,
): Promise<{ order: ServiceOrderRow; viaWorkflow: boolean }> {
  const before = await requireProcessableOrder(context, orderId);
  const viaWorkflow = await trigger(context, {
    orderId,
    manual: true,
    actorId: context.actorId,
    acceptanceNote: acceptanceNote ?? null,
  });
  // The shared transition is the single acceptance path after the trigger:
  // when the workflow accepted the order this reports the order as already
  // processed, and when it did not the transition performs the acceptance.
  const result = await acceptOrderRecord(context.database, {
    orderId,
    manual: true,
    actorId: context.actorId,
    acceptanceNote: acceptanceNote ?? null,
    eventKey: acceptanceEventKey(orderId),
  });
  await notifyAcceptanceOutcome(context, result);
  const order = (await currentOrder(context, orderId)) ?? before;
  return { order, viaWorkflow };
}

/**
 * Accepts a freshly created order without a request identity.
 *
 * Used right after an order is created, on both the internal and the platform
 * path. A confidential order is intentionally left pending: the shared
 * transition refuses it on the automatic path, so a supervisor has to accept it
 * explicitly.
 */
export async function autoAcceptOrder(
  runtime: ServiceRuntime,
  orderId: number,
): Promise<{ order: ServiceOrderRow | undefined; viaWorkflow: boolean }> {
  const viaWorkflow = await trigger(runtime, {
    orderId,
    manual: false,
    actorId: null,
  });
  const result = await acceptOrderRecord(runtime.database, {
    orderId,
    manual: false,
    actorId: null,
    eventKey: acceptanceEventKey(orderId),
  });
  await notifyAcceptanceOutcome(runtime, result);
  return { order: await currentOrder(runtime, orderId), viaWorkflow };
}
