import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';
import type { ServiceToken } from '@nocobase/service-provider';

export interface NotifyAcceptanceOutcome {
  readonly notified: boolean;
  readonly recipients: readonly string[];
  readonly reason: string;
}

/**
 * The facts the `acceptOrder` node handed over.
 *
 * The node artifact is a separate module copy, so this mirrors the shape
 * declared by `accept-order.ts` instead of importing it.
 */
interface AcceptOrderNodeResult {
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

export interface NotifyAcceptanceContext {
  readonly nodeResults: {
    readonly acceptOrder?: AcceptOrderNodeResult;
  };
}

/** The facts an acceptance notice is built from; mirrors the server interface. */
interface AcceptanceNoticeFacts {
  readonly orderId: number;
  readonly orderNo: string;
  readonly title: string;
  readonly accepted: boolean;
  readonly assigneeId: string | null;
  readonly acceptanceNote: string | null;
  readonly reason: string;
}

/** The capability the application registers for this node to call. */
interface AcceptanceNotifier {
  notifyAcceptance(
    input: AcceptanceNoticeFacts,
  ): Promise<NotifyAcceptanceOutcome>;
}

/**
 * The token shared with `server/services/notify.ts`.
 *
 * This handler is materialized into its own artifact and may not import
 * application source or third-party packages — the previous version imported
 * `@nocobase/db` and `@nocobase/app-plugin-notification/server` here, which the
 * artifact directory cannot resolve. `Symbol.for` names one registry slot
 * across both copies and `globalThis` holds the single token object they then
 * agree on, the same pattern `accept-order.ts` uses. Keep the key in sync with
 * the server-side definition.
 */
const ACCEPTANCE_NOTIFIER_TOKEN_KEY = Symbol.for(
  'nb3-factory.service-acceptance-notifier',
);

interface AcceptanceNotifierTokenRegistry {
  acceptanceNotifier?: ServiceToken<AcceptanceNotifier>;
}

const acceptanceNotifierTokenRegistry = globalThis as unknown as Record<
  symbol,
  AcceptanceNotifierTokenRegistry | undefined
>;
const acceptanceNotifierTokens = (acceptanceNotifierTokenRegistry[
  ACCEPTANCE_NOTIFIER_TOKEN_KEY
] ??= {});
const acceptanceNotifierServiceToken: ServiceToken<AcceptanceNotifier> =
  acceptanceNotifierTokens.acceptanceNotifier ??
  (acceptanceNotifierTokens.acceptanceNotifier = {
    name: 'app/service-acceptance-notifier',
  } as ServiceToken<AcceptanceNotifier>);

/**
 * Reports the acceptance outcome to the people who need it.
 *
 * The handler is deliberately thin: it resolves the application's notifier,
 * which owns the recipient decision, the wording and the idempotency key, so
 * the workflow and the direct HTTP fallback send exactly the same message and
 * the notification service deduplicates the two. A missing notification service
 * is reported as an outcome rather than failing the run: the order was already
 * accepted or refused, and that business fact must stand.
 */
export async function run(
  { nodeResults }: NotifyAcceptanceContext,
  options: WorkflowRunOptions,
): Promise<NotifyAcceptanceOutcome> {
  const result = nodeResults.acceptOrder;
  if (!result) {
    return {
      notified: false,
      recipients: [],
      reason: 'acceptance_result_missing',
    };
  }
  const notifier = options.services.resolve(acceptanceNotifierServiceToken);
  return notifier.notifyAcceptance({
    orderId: result.orderId,
    orderNo: result.orderNo,
    title: result.title,
    accepted: result.accepted,
    assigneeId: result.assigneeId,
    acceptanceNote: result.acceptanceNote,
    reason: result.reason,
  });
}
