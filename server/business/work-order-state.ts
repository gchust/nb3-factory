// The after-sales work-order lifecycle, expressed as data so the same table drives the service, the client and the
// tests. A migration stores these string values; changing a name here is a data migration, not a display change.
export const WORK_ORDER_STATUS = {
  pendingAccept: 'pending_accept',
  pendingHandle: 'pending_handle',
  processing: 'processing',
  pendingConfirm: 'pending_confirm',
  closed: 'closed',
} as const;

export type WorkOrderStatus =
  (typeof WORK_ORDER_STATUS)[keyof typeof WORK_ORDER_STATUS];

export const WORK_ORDER_PRIORITIES = ['normal', 'urgent'] as const;
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];

export interface WorkOrderTransition {
  /** The statuses this action may start from. */
  readonly from: readonly WorkOrderStatus[];
  /** The status after the action. */
  readonly to: WorkOrderStatus;
  /** The timestamp column the action stamps, when it has one. */
  readonly timestampField:
    'acceptedAt' | 'startedAt' | 'submittedAt' | 'closedAt' | null;
  /** The timeline event type recorded for the action. */
  readonly event: string;
}

export const WORK_ORDER_TRANSITIONS = {
  accept: {
    from: [WORK_ORDER_STATUS.pendingAccept],
    to: WORK_ORDER_STATUS.pendingHandle,
    timestampField: 'acceptedAt',
    event: 'accepted',
  },
  start: {
    from: [WORK_ORDER_STATUS.pendingHandle],
    to: WORK_ORDER_STATUS.processing,
    timestampField: 'startedAt',
    event: 'started',
  },
  submit: {
    from: [WORK_ORDER_STATUS.processing],
    to: WORK_ORDER_STATUS.pendingConfirm,
    timestampField: 'submittedAt',
    event: 'submitted',
  },
  // A rejected submission returns the order to the engineer that handled it; no timestamp is stamped.
  reject: {
    from: [WORK_ORDER_STATUS.pendingConfirm],
    to: WORK_ORDER_STATUS.processing,
    timestampField: null,
    event: 'rejected',
  },
  close: {
    from: [WORK_ORDER_STATUS.pendingConfirm],
    to: WORK_ORDER_STATUS.closed,
    timestampField: 'closedAt',
    event: 'closed',
  },
} as const satisfies Record<string, WorkOrderTransition>;

export type WorkOrderTransitionAction = keyof typeof WORK_ORDER_TRANSITIONS;

export const WORK_ORDER_ACTION_LABELS: Record<
  WorkOrderTransitionAction,
  string
> = {
  accept: '受理',
  start: '开始处理',
  submit: '提交验收',
  reject: '退回处理',
  close: '确认完成',
};

export function canTransition(
  status: string,
  action: WorkOrderTransitionAction,
): boolean {
  const transition: WorkOrderTransition = WORK_ORDER_TRANSITIONS[action];
  return (transition.from as readonly string[]).includes(status);
}

/** The actions currently available from a status, in display order. */
export function availableActions(
  status: string,
): readonly WorkOrderTransitionAction[] {
  return (
    Object.keys(WORK_ORDER_TRANSITIONS) as WorkOrderTransitionAction[]
  ).filter((action) => canTransition(status, action));
}

// Which statuses count as "still working" for overdue-reminder and dashboard purposes.
export const OPEN_STATUSES: readonly WorkOrderStatus[] = [
  WORK_ORDER_STATUS.pendingAccept,
  WORK_ORDER_STATUS.pendingHandle,
  WORK_ORDER_STATUS.processing,
  WORK_ORDER_STATUS.pendingConfirm,
];

export function isOpenStatus(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}
