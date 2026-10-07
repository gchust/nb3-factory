/**
 * Names shared by the service, the routes, the scheduler tasks and the seeds.
 *
 * They live in one file so a rename cannot drift between the schema in
 * `database/main/migrations/`, the record access in `resources.ts` and the code
 * that reads the rows.
 */

export const COLLECTIONS = {
  customers: 'customers',
  serviceGroups: 'serviceGroups',
  serviceGroupMembers: 'serviceGroupMembers',
  devices: 'devices',
  workOrders: 'workOrders',
  workOrderExecutions: 'workOrderExecutions',
  workOrderShares: 'workOrderShares',
  repairNotes: 'repairNotes',
  deviceManuals: 'deviceManuals',
  inspectionTasks: 'inspectionTasks',
  overdueReminders: 'overdueReminders',
  scheduledRuns: 'scheduledRuns',
  workOrderFiles: 'workOrderFiles',
  serviceFiles: 'serviceFiles',
} as const;

export type ServiceCollection = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/** Scheduler target types. Namespaced so they cannot collide with a plugin's. */
export const TASK_TYPES = {
  dailyInspections: 'app.service-daily-inspections',
  overdueReminders: 'app.service-overdue-reminders',
} as const;

/** Scheduler schedule keys — persistent identity together with the application name. */
export const SCHEDULE_KEYS = {
  dailyInspections: 'service.daily-inspections',
  overdueReminders: 'service.overdue-reminders',
} as const;

/** Rows in `scheduledRuns` are keyed by these, one per calendar day. */
export const RUN_KEYS = {
  dailyInspections: 'service.dailyInspections',
  overdueReminders: 'service.overdueReminders',
} as const;

/**
 * Permission sets the seed creates. Keys are stable: an administrator's later
 * assignment edits the same set rather than a second one.
 */
export const PERMISSION_SET_KEYS = {
  supervisor: 'service.supervisor',
  engineer: 'service.engineer',
  observer: 'service.observer',
  integration: 'service.integration',
} as const;

/**
 * The support teams the seed creates. Ids are deterministic so a rule subject
 * written in code can name the same team the seed inserted.
 */
export const TEAM_IDS = {
  groupA: 'service-team-a',
  groupB: 'service-team-b',
} as const;

/**
 * Deterministic ids for the business rows the seed installs. Keeping them stable
 * makes a re-run an update of the same row, never a second copy.
 */
export const FACTORY_PREFIX = 'svc-factory-';

/** Share/restriction rule keys. */
export const RULE_KEYS = {
  sharedWorkOrders: 'service.sharedWorkOrders',
  confidentialOrders: 'service.confidentialOrders',
} as const;

/**
 * The File plugin's exposure path, which the upload Repository requires as an
 * `accessPath` option. No route is registered at it: the application serves an
 * attachment's bytes through its own authorized route, not the plugin's public
 * content route.
 */
export const ATTACHMENT_ACCESS_PATH = '/uploads/service';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 200;

/** Attachment categories and their accepted file extensions. */
export const ATTACHMENT_CATEGORIES = ['photo', 'report'] as const;
export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number];

export const ATTACHMENT_EXTENSIONS: Readonly<
  Record<AttachmentCategory, readonly string[]>
> = {
  photo: ['png'],
  report: ['docx'],
};

/** In-app notification channel key, as `notification.channels` names it. */
export const NOTIFICATION_CHANNEL = 'inbox';

/** In-app notification channel key, as the in-app provider registers it. */
export const IN_APP_CHANNEL = 'in-app';

/** Assistant availability reasons reported to the client. */
export const ASSISTANT_REASONS = {
  notConfigured: 'KNOWLEDGE_BASE_NOT_CONFIGURED',
  noModel: 'LLM_SERVICE_NOT_CONFIGURED',
} as const;
