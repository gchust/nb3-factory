/**
 * The work-order lifecycle, as a pure state machine.
 *
 * Nothing here touches the database, HTTP or the container, so every rule the
 * business depends on — which transition is legal, who may take it, what it
 * requires — is testable on its own and the same function is what the service and
 * the client read.
 */

export const WORK_ORDER_STATUSES = [
  'pending_acceptance',
  'pending_processing',
  'processing',
  'pending_confirmation',
  'closed',
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WORK_ORDER_PRIORITIES = ['normal', 'urgent'] as const;
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];

/** `reject` sends a submitted order back for more work; `reopen` restarts a closed one. */
export const WORK_ORDER_ACTIONS = [
  'accept',
  'start',
  'submit',
  'confirm',
  'reject',
  'close',
  'reopen',
] as const;
export type WorkOrderAction = (typeof WORK_ORDER_ACTIONS)[number];

export const WORK_ORDER_SOURCES = ['manual', 'external'] as const;
export type WorkOrderSource = (typeof WORK_ORDER_SOURCES)[number];

export const FAULT_CATEGORIES = [
  'mechanical',
  'electrical',
  'software',
  'wear',
  'calibration',
  'other',
] as const;
export type FaultCategory = (typeof FAULT_CATEGORIES)[number];

const TRANSITIONS: Readonly<
  Record<WorkOrderStatus, Partial<Record<WorkOrderAction, WorkOrderStatus>>>
> = {
  pending_acceptance: { accept: 'pending_processing' },
  pending_processing: {
    start: 'processing',
    // A supervisor may close an order that never needed bench time.
    close: 'closed',
  },
  processing: {
    submit: 'pending_confirmation',
    close: 'closed',
  },
  pending_confirmation: {
    confirm: 'closed',
    reject: 'processing',
    close: 'closed',
  },
  closed: {
    reopen: 'pending_processing',
  },
};

/** Which permission action a lifecycle action is checked against. */
const ACTION_PERMISSION: Readonly<Record<WorkOrderAction, string>> = {
  accept: 'accept',
  start: 'process',
  submit: 'submit',
  confirm: 'confirm',
  reject: 'confirm',
  close: 'close',
  reopen: 'reopen',
};

export function permissionActionFor(action: WorkOrderAction): string {
  return ACTION_PERMISSION[action];
}

export function isWorkOrderStatus(value: string): value is WorkOrderStatus {
  return (WORK_ORDER_STATUSES as readonly string[]).includes(value);
}

export function isWorkOrderAction(value: string): value is WorkOrderAction {
  return (WORK_ORDER_ACTIONS as readonly string[]).includes(value);
}

export function isTerminal(status: WorkOrderStatus): boolean {
  return status === 'closed';
}

/** The status `action` produces from `status`, or `undefined` when it is illegal. */
export function nextStatus(
  status: WorkOrderStatus,
  action: WorkOrderAction,
): WorkOrderStatus | undefined {
  return TRANSITIONS[status]?.[action];
}

/** Every action the state machine itself allows from `status`, in workflow order. */
export function allowedActions(
  status: WorkOrderStatus,
): readonly WorkOrderAction[] {
  const transitions = TRANSITIONS[status] ?? {};
  return WORK_ORDER_ACTIONS.filter(
    (action) => transitions[action] !== undefined,
  );
}

/**
 * What a transition needs beyond the state machine. The service also checks the
 * action against the permission set; this decides whether the business rule is
 * satisfied at all.
 */
export interface TransitionInput {
  readonly closeSummary?: string | null;
  readonly failureReason?: string | null;
  readonly remark?: string | null;
}

export function validateTransition(
  status: WorkOrderStatus,
  action: WorkOrderAction,
  input: TransitionInput = {},
):
  | { readonly ok: true; readonly to: WorkOrderStatus }
  | { readonly ok: false; readonly reason: TransitionFailure } {
  const to = nextStatus(status, action);
  if (!to) {
    return {
      ok: false,
      reason: { code: 'TRANSITION_NOT_ALLOWED', status, action },
    };
  }
  if (action === 'close' && !input.closeSummary?.trim()) {
    return {
      ok: false,
      reason: { code: 'CLOSE_SUMMARY_REQUIRED', status, action },
    };
  }
  if (action === 'reject' && !input.failureReason?.trim()) {
    return {
      ok: false,
      reason: { code: 'FAILURE_REASON_REQUIRED', status, action },
    };
  }
  if (
    action === 'submit' &&
    to === 'pending_confirmation' &&
    !input.remark?.trim()
  ) {
    return {
      ok: false,
      reason: { code: 'SUBMIT_REMARK_REQUIRED', status, action },
    };
  }
  return { ok: true, to };
}

export interface TransitionFailure {
  readonly code:
    | 'TRANSITION_NOT_ALLOWED'
    | 'CLOSE_SUMMARY_REQUIRED'
    | 'FAILURE_REASON_REQUIRED'
    | 'SUBMIT_REMARK_REQUIRED';
  readonly status: WorkOrderStatus;
  readonly action: WorkOrderAction;
}

/**
 * An urgent order is accepted immediately when someone can take it. Whether the
 * automatic acceptance succeeds is a business fact the caller records, not an
 * error: an order that stays `pending_acceptance` because nobody was free is the
 * case an engineer recovers from by hand.
 */
export function shouldAutoAccept(
  priority: WorkOrderPriority,
  status: WorkOrderStatus,
): boolean {
  return priority === 'urgent' && status === 'pending_acceptance';
}

export const WORK_ORDER_STATUS_LABELS: Readonly<
  Record<WorkOrderStatus, string>
> = {
  pending_acceptance: '待受理',
  pending_processing: '待处理',
  processing: '处理中',
  pending_confirmation: '待确认',
  closed: '已关闭',
};

/**
 * An order is overdue when it is not closed and its deadline has passed. The
 * deadline is the moment of the last recorded activity plus the priority budget,
 * so it stays computable from the row alone.
 */
export const OVERDUE_BUDGET_HOURS: Readonly<Record<WorkOrderPriority, number>> =
  {
    urgent: 8,
    normal: 72,
  };

export function overdueSince(
  priority: string,
  status: string,
  lastActivityAt: string | Date,
): string | undefined {
  if (!isWorkOrderStatus(status) || isTerminal(status)) return undefined;
  const budget =
    OVERDUE_BUDGET_HOURS[priority === 'urgent' ? 'urgent' : 'normal'];
  const at = new Date(lastActivityAt).getTime();
  if (Number.isNaN(at)) return undefined;
  const due = at + budget * 3600_000;
  return due < Date.now() ? new Date(due).toISOString() : undefined;
}
