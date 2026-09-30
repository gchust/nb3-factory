/**
 * Shared types and enum vocabularies for the after-sales service pages.
 *
 * The values mirror the server routes and the database migrations: the status
 * strings are the ones the ticket lifecycle and the inspection plan store, and
 * the label helpers only ever return an i18n key, so a value the application
 * does not know still renders through `defaultValue`.
 */

export const TICKET_STATUSES = [
  'pending_acceptance',
  'pending_processing',
  'processing',
  'pending_confirmation',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_ACTIONS = [
  'accept',
  'process',
  'submit',
  'return',
  'close',
] as const;
export type TicketAction = (typeof TICKET_ACTIONS)[number];

export const INSPECTION_STATUSES = [
  'scheduled',
  'overdue',
  'completed',
] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_RESULTS = ['normal', 'abnormal'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export const DEVICE_STATUSES = ['active', 'maintenance', 'retired'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const SERVICE_LEVELS = ['standard', 'premium', 'vip'] as const;

export const CONTENT_STATUSES = ['draft', 'published', 'archived'] as const;

/** The state a ticket must be in before an action is offered, straight from the lifecycle. */
export const ACTION_FROM_STATUS: Record<TicketAction, TicketStatus> = {
  accept: 'pending_acceptance',
  process: 'pending_processing',
  submit: 'processing',
  return: 'pending_confirmation',
  close: 'pending_confirmation',
};

export interface ServiceTicketEvent {
  readonly id: number;
  readonly ticketId: number;
  readonly type: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly message: string | null;
  readonly actorId: string | null;
  readonly createdAt: string;
}

export interface ServiceAttachment {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly ext: string;
  readonly size: number;
  readonly category: string | null;
  readonly ticketId: number | null;
  readonly manualId: number | null;
  readonly createdAt: string;
}

export interface ServiceError {
  readonly code: string | null;
  readonly message: string;
  readonly status: number;
}

export interface ServiceTicket {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly source: string;
  readonly confidential: boolean;
  readonly reporterName: string | null;
  readonly resolution: string | null;
  readonly dueAt: string | null;
  readonly acceptedAt: string | null;
  readonly startedAt: string | null;
  readonly submittedAt: string | null;
  readonly closedAt: string | null;
  readonly acceptanceStatus: string | null;
  readonly acceptanceError: string | null;
  readonly externalEventId: string | null;
  readonly externalPlatform: string | null;
  readonly customerId: number;
  readonly deviceId: number;
  readonly assigneeId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly customerName?: string | null;
  readonly customerCode?: string | null;
  readonly deviceName?: string | null;
  readonly deviceSerialNumber?: string | null;
  readonly assigneeName?: string | null;
  /** Which lifecycle actions this session may actually perform on this ticket. */
  readonly capabilities?: Record<TicketAction, boolean>;
  readonly events?: readonly ServiceTicketEvent[];
  readonly attachments?: readonly ServiceAttachment[];
}

export interface ServiceCustomer {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly address: string | null;
  readonly serviceLevel: string;
  readonly notes: string | null;
  readonly ownerId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServiceDevice {
  readonly id: number;
  readonly serialNumber: string;
  readonly name: string;
  readonly model: string | null;
  readonly category: string | null;
  readonly location: string | null;
  readonly status: string;
  readonly warrantyUntil: string | null;
  readonly notes: string | null;
  readonly customerId: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServiceInspection {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly scheduledDate: string;
  readonly status: InspectionStatus;
  readonly result: InspectionResult | null;
  readonly findings: string | null;
  readonly completedAt: string | null;
  readonly customerId: number;
  readonly deviceId: number;
  readonly assigneeId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly customerName?: string | null;
  readonly deviceName?: string | null;
  readonly deviceSerialNumber?: string | null;
  readonly assigneeName?: string | null;
}

export interface ServiceArticle {
  readonly id: number;
  readonly title: string;
  readonly slug: string;
  readonly category: string | null;
  readonly deviceCategory: string | null;
  readonly summary: string | null;
  readonly content: string;
  readonly status: string;
  readonly viewCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServiceManual {
  readonly id: number;
  readonly title: string;
  readonly code: string;
  readonly deviceCategory: string | null;
  readonly model: string | null;
  readonly version: string | null;
  readonly summary: string | null;
  readonly content: string | null;
  readonly status: string;
  readonly indexStatus: string;
  readonly indexError: string | null;
  readonly viewCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DirectoryUser {
  readonly id: string;
  readonly name: string;
}

export interface DirectoryTeam {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly members: readonly DirectoryUser[];
}

export interface KnowledgeHit {
  readonly kind: 'article' | 'manual';
  readonly id: number;
  readonly title: string;
  readonly summary: string | null;
  readonly category: string | null;
  readonly status: string;
  readonly snippet: string;
}

export interface AssistantAnswer {
  readonly query: string;
  readonly mode: 'knowledge_search' | 'generated';
  readonly results: readonly KnowledgeHit[];
  readonly ai: {
    readonly status: 'blocked' | 'ready';
    readonly reason?: string;
    readonly answer?: string;
  };
}

export interface DashboardSummary {
  readonly tickets: {
    readonly total: number;
    readonly pendingAcceptance: number;
    readonly pendingProcessing: number;
    readonly processing: number;
    readonly pendingConfirmation: number;
    readonly closed: number;
    readonly overdue: number;
  };
  readonly inspections: {
    readonly total: number;
    readonly scheduled: number;
    readonly overdue: number;
    readonly completed: number;
  };
  readonly customers: number;
  readonly devices: number;
  readonly teams: readonly TeamWorkload[];
  readonly recentTickets: readonly ServiceTicket[];
}

export interface TeamWorkload {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly open: number;
  readonly total: number;
  readonly members: readonly {
    readonly id: string;
    readonly name: string;
    readonly open: number;
    readonly total: number;
  }[];
}

/** One of the domain schedules, merged with its live queue projection. */
export interface ServiceSchedule {
  readonly key: string;
  readonly title: string;
  readonly targetType: string;
  readonly cron: string;
  readonly timezone: string;
  readonly scheduleId: string | null;
  readonly enabled: boolean;
  readonly nextRunAt: string | null;
  readonly lastRunAt: string | null;
  readonly runCount: number;
}

/** What the acceptance dispatcher reports back after a ticket is created. */
export interface AcceptanceDispatchResult {
  readonly via: 'workflow' | 'service';
  readonly status: string;
  readonly error?: string;
}

export interface CreateTicketResult {
  readonly ticket: ServiceTicket;
  readonly acceptance: AcceptanceDispatchResult | null;
}

/** The i18n key for a ticket status; callers pass the raw value as `defaultValue`. */
export function ticketStatusKey(value: string): string {
  return `service.ticketStatus.${value}`;
}

export function ticketPriorityKey(value: string): string {
  return `service.ticketPriority.${value}`;
}

export function inspectionStatusKey(value: string): string {
  return `service.inspectionStatus.${value}`;
}

export function deviceStatusKey(value: string): string {
  return `service.deviceStatus.${value}`;
}

export function manualIndexKey(value: string): string {
  return `service.manualIndex.${value}`;
}
