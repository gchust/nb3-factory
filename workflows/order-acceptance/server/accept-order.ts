import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';
import type { ServiceToken } from '@nocobase/service-provider';

export interface AcceptOrderNodeInput {
  orderId: number;
  manual: boolean;
  actorId: string | null;
  acceptanceNote?: string | null;
  eventKey: string | null;
}

export interface AcceptOrderResult {
  readonly orderId: number;
  readonly orderNo: string;
  readonly title: string;
  readonly accepted: boolean;
  readonly status: string;
  readonly assigneeId: string | null;
  readonly groupId: number | null;
  readonly confidential: boolean;
  readonly acceptanceNote: string | null;
  readonly reason: string;
}

interface AcceptOrderInput {
  readonly orderId: number;
  readonly manual: boolean;
  readonly actorId?: string | null;
  readonly acceptanceNote?: string | null;
  readonly eventKey?: string | null;
}

/** The transition the application registers for this handler to call. */
interface OrderAcceptanceService {
  acceptOrderRecord(input: AcceptOrderInput): Promise<AcceptOrderResult>;
}

/**
 * The token shared with `server/services/order-lifecycle.ts`.
 *
 * A run handler is materialized into its own artifact and may not import
 * application source, so the two copies cannot share an imported
 * `createServiceToken` result. `Symbol.for` names one registry slot across both
 * copies and `globalThis` holds the single token object they then agree on.
 * Keep the key in sync with the server-side definition.
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
const orderAcceptanceServiceToken: ServiceToken<OrderAcceptanceService> =
  tokens.orderAcceptance ??
  (tokens.orderAcceptance = {
    name: 'app/service-order-acceptance',
  } as ServiceToken<OrderAcceptanceService>);

/**
 * Accepts one service order.
 *
 * The handler is deliberately thin: it resolves the application's shared,
 * status-guarded transition and delegates to it. The transition is the single
 * implementation the HTTP route also calls, so a replayed run cannot accept an
 * order twice.
 */
export async function run(
  { input }: { input: AcceptOrderNodeInput },
  options: WorkflowRunOptions,
): Promise<AcceptOrderResult> {
  const acceptance = options.services.resolve(orderAcceptanceServiceToken);
  return acceptance.acceptOrderRecord({
    orderId: input.orderId,
    manual: input.manual,
    actorId: input.actorId,
    acceptanceNote: input.acceptanceNote ?? null,
    eventKey: input.eventKey,
  });
}
