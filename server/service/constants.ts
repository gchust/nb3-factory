/**
 * Domain vocabulary for the equipment after-sales and inspection collaboration system.
 *
 * These values are persisted, so they are stable identifiers rather than display text. Every user-visible
 * label is derived from them through `client/locales/*` translation keys.
 */

/**
 * The application's i18n namespace. Persisted authorization titles carry this namespace, so the server stores
 * `{ key, ns: SERVICE_NS }` and the client resolves the key from `client/locales`. The value is the application
 * package name, which is what `registerApplicationNamespace` binds the flat locale keys to.
 */
export const SERVICE_NS = 'nb3-factory';

/** Permission sets this application owns, alongside the built-in `root` and `member` sets. */
export const SERVICE_PERMISSION_SET = {
  /** 服务主管 — every work order, every customer, manual and knowledge entry. */
  SUPERVISOR: 'service-supervisor',
  /** 服务工程师 — own, same-group and shared work orders, plus the equipment they serve. */
  ENGINEER: 'service-engineer',
  /** 只读观察员 — non-confidential work orders and published material. */
  OBSERVER: 'service-observer',
  /** 外部设备平台 — read-only platform integration account. */
  INTEGRATOR: 'service-integrator',
} as const;

export type ServicePermissionSet =
  (typeof SERVICE_PERMISSION_SET)[keyof typeof SERVICE_PERMISSION_SET];

/** Scheduler schedule keys, seeded so administrators can see and retarget them. */
export const INSPECTION_SCHEDULE = {
  /** Daily plan generation for equipment whose next inspection date has arrived. */
  GENERATE: 'service-inspection-generation',
  /** Daily overdue sweep that flags inspections past their due date. */
  OVERDUE: 'service-inspection-overdue',
} as const;

/** Scheduler target types registered by the service provider. */
export const INSPECTION_TARGET = {
  GENERATE: 'service-inspection-generation',
  OVERDUE: 'service-inspection-overdue',
} as const;

export const WORK_ORDER_STATUS = {
  /** 待受理 — a new work order that nobody has taken responsibility for yet. */
  PENDING_ACCEPTANCE: 'pending_acceptance',
  /** 待处理 — accepted, dispatched to an engineer, not started. */
  PENDING_PROCESSING: 'pending_processing',
  /** 处理中 — an engineer is actively repairing the equipment. */
  PROCESSING: 'processing',
  /** 待确认 — the engineer submitted a repair, the reporter has to confirm. */
  PENDING_CONFIRMATION: 'pending_confirmation',
  /** 已关闭 — confirmed and archived. */
  CLOSED: 'closed',
  /** 已退回 — returned by the reporter for another attempt (kept for the state history). */
  RETURNED: 'returned',
} as const;

export type WorkOrderStatus =
  (typeof WORK_ORDER_STATUS)[keyof typeof WORK_ORDER_STATUS];

/** The closed loop in order. `returned` is not part of it — it re-enters at `pending_processing`. */
export const WORK_ORDER_STATUS_FLOW: readonly WorkOrderStatus[] = [
  WORK_ORDER_STATUS.PENDING_ACCEPTANCE,
  WORK_ORDER_STATUS.PENDING_PROCESSING,
  WORK_ORDER_STATUS.PROCESSING,
  WORK_ORDER_STATUS.PENDING_CONFIRMATION,
  WORK_ORDER_STATUS.CLOSED,
];

export const WORK_ORDER_PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type WorkOrderPriority =
  (typeof WORK_ORDER_PRIORITY)[keyof typeof WORK_ORDER_PRIORITY];

/** Priorities that the auto-acceptance workflow escalates to the supervisor instead of accepting. */
export const ESCALATED_PRIORITIES: readonly WorkOrderPriority[] = [
  WORK_ORDER_PRIORITY.URGENT,
  WORK_ORDER_PRIORITY.HIGH,
];

export const WORK_ORDER_EVENT = {
  CREATED: 'created',
  AUTO_ACCEPTED: 'auto_accepted',
  ESCALATED: 'escalated',
  ACCEPTED: 'accepted',
  STARTED: 'started',
  SUBMITTED: 'submitted',
  CONFIRMED: 'confirmed',
  RETURNED: 'returned',
  SHARED: 'shared',
  SHARE_REVOKED: 'share_revoked',
  NOTIFIED: 'notified',
  OVERDUE_REMINDER: 'overdue_reminder',
  INTEGRATION_INGESTED: 'integration_ingested',
} as const;

export type WorkOrderEventType =
  (typeof WORK_ORDER_EVENT)[keyof typeof WORK_ORDER_EVENT];

export const INSPECTION_STATUS = {
  PENDING: 'pending',
  DONE: 'done',
  OVERDUE: 'overdue',
  SKIPPED: 'skipped',
} as const;

export type InspectionStatus =
  (typeof INSPECTION_STATUS)[keyof typeof INSPECTION_STATUS];

/** Notification channel declared in `server/config/notification.ts`. */
export const IN_APP_CHANNEL = 'inbox';

/** Source-managed workflow that accepts or escalates a freshly created work order. */
export const WORK_ORDER_ACCEPTANCE_WORKFLOW = 'work-order-acceptance';

/** Event-key namespace that makes the workflow trigger idempotent per work order. */
export const WORK_ORDER_ACCEPTANCE_EVENT_PREFIX =
  'service-work-order-accepted:';
