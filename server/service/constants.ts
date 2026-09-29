/**
 * Which service capabilities the signed-in identity holds. Detected from the
 * permission sets it is assigned, not from a page grant.
 */
export interface ServiceRole {
  readonly supervisor: boolean;
  readonly engineer: boolean;
  readonly observer: boolean;
  readonly integration: boolean;
  /** Root or a set carrying every service capability. */
  readonly unrestricted: boolean;
}

/** Work-order lifecycle states, in flow order. */
export const WORK_ORDER_STATUS = {
  pendingAccept: 'pending_accept',
  pendingProcess: 'pending_process',
  processing: 'processing',
  pendingConfirm: 'pending_confirm',
  closed: 'closed',
} as const;

export type WorkOrderStatus =
  (typeof WORK_ORDER_STATUS)[keyof typeof WORK_ORDER_STATUS];

export const WORK_ORDER_STATUS_ORDER: readonly WorkOrderStatus[] = [
  WORK_ORDER_STATUS.pendingAccept,
  WORK_ORDER_STATUS.pendingProcess,
  WORK_ORDER_STATUS.processing,
  WORK_ORDER_STATUS.pendingConfirm,
  WORK_ORDER_STATUS.closed,
];

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  [WORK_ORDER_STATUS.pendingAccept]: '待受理',
  [WORK_ORDER_STATUS.pendingProcess]: '待处理',
  [WORK_ORDER_STATUS.processing]: '处理中',
  [WORK_ORDER_STATUS.pendingConfirm]: '待确认',
  [WORK_ORDER_STATUS.closed]: '已关闭',
};

/** State each transition may start from, and the state it produces. */
export const TRANSITIONS = {
  accept: {
    from: [WORK_ORDER_STATUS.pendingAccept],
    to: WORK_ORDER_STATUS.pendingProcess,
  },
  start: {
    from: [WORK_ORDER_STATUS.pendingProcess],
    to: WORK_ORDER_STATUS.processing,
  },
  submit: {
    from: [WORK_ORDER_STATUS.processing],
    to: WORK_ORDER_STATUS.pendingConfirm,
  },
  confirm: {
    from: [WORK_ORDER_STATUS.pendingConfirm],
    to: WORK_ORDER_STATUS.closed,
  },
  return: {
    from: [WORK_ORDER_STATUS.pendingConfirm],
    to: WORK_ORDER_STATUS.pendingProcess,
  },
} as const;

export type TransitionName = keyof typeof TRANSITIONS;

export const WORK_ORDER_PRIORITY = {
  normal: 'normal',
  urgent: 'urgent',
} as const;

export type WorkOrderPriority =
  (typeof WORK_ORDER_PRIORITY)[keyof typeof WORK_ORDER_PRIORITY];

export const WORK_ORDER_SOURCE = {
  manual: 'manual',
  devicePlatform: 'device_platform',
  assistant: 'assistant',
} as const;

export const ACTIVITY_ACTIONS = {
  created: 'created',
  accepted: 'accepted',
  started: 'started',
  submitted: 'submitted',
  confirmed: 'confirmed',
  returned: 'returned',
  commented: 'commented',
  shared: 'shared',
  unshared: 'unshared',
  attached: 'attached',
  detached: 'detached',
  externalReported: 'external_reported',
} as const;

export type ActivityAction =
  (typeof ACTIVITY_ACTIONS)[keyof typeof ACTIVITY_ACTIONS];

/** Service engineer groups, keyed by the value stored on the team member row. */
export const ENGINEER_GROUPS = ['group_a', 'group_b'] as const;
export type EngineerGroup = (typeof ENGINEER_GROUPS)[number];

export const KNOWLEDGE_STATUS = {
  draft: 'draft',
  published: 'published',
} as const;

export const INSPECTION_STATUS = {
  pending: 'pending',
  completed: 'completed',
  skipped: 'skipped',
} as const;

export const ATTACHMENT_CATEGORY = {
  photo: 'photo',
  report: 'report',
} as const;

export const SERVICE_PAGE_IDS = {
  dashboard: 'service.dashboard',
  customers: 'service.customers',
  devices: 'service.devices',
  workOrders: 'service.workOrders',
  inspections: 'service.inspections',
  knowledge: 'service.knowledge',
  manuals: 'service.manuals',
  integration: 'service.integration',
  assistant: 'service.assistant',
} as const;

/**
 * The two Scheduler targets this application owns. A controlled immediate run
 * resolves the schedule that points at one of these targets and lets the
 * Scheduler dispatch it, so the firing lands in the same target and the same
 * execution records as the cron tick.
 */
export const SERVICE_SCHEDULE_TARGETS = {
  dailyInspections: 'service-generate-inspections',
  overdueReminders: 'service-overdue-reminders',
} as const;

export type ServiceScheduleTarget =
  (typeof SERVICE_SCHEDULE_TARGETS)[keyof typeof SERVICE_SCHEDULE_TARGETS];

/** The schedule key each owned target is declared under in `registerSchedules`. */
export const SERVICE_SCHEDULE_KEYS: Record<ServiceScheduleTarget, string> = {
  [SERVICE_SCHEDULE_TARGETS.dailyInspections]: 'service.daily-inspections',
  [SERVICE_SCHEDULE_TARGETS.overdueReminders]: 'service.overdue-reminders',
};

/**
 * Stable lookup key for the application service-domain service.
 *
 * The acceptance workflow's Run module is copied into its Artifact and loaded
 * from there, so it cannot import application source. It carries the same
 * literal in `server/workflows/work-order-acceptance/contract.ts` and resolves
 * the service through the workflow engine's `options.services` resolver. The
 * provider publishes the service under this key beside its typed token; the
 * value here and in that contract must stay identical.
 */
export const SERVICE_DOMAIN_SERVICE_KEY = 'app/service-domain';

/** Permission set keys the installation seeds; capability follows these. */
export const SERVICE_PERMISSION_SETS = {
  supervisor: 'service-supervisor',
  engineer: 'service-engineer',
  observer: 'service-observer',
  integration: 'service-integration',
} as const;
