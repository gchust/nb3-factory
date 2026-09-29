import { sharedServiceToken } from './service-token.js';

/** Permission Set keys the application provisions for its own business roles. */
export const ROLE_KEYS = {
  supervisor: 'service-supervisor',
  engineer: 'service-engineer',
  observer: 'service-observer',
  integration: 'service-integration',
} as const;

export type BusinessRole = keyof typeof ROLE_KEYS;

/** The library's unrestricted set; holders bypass business checks. */
export const ROOT_PERMISSION_SET = 'root';

export const TICKET_STATUS = {
  pendingAcceptance: 'pending_acceptance',
  pendingProcessing: 'pending_processing',
  processing: 'processing',
  pendingConfirmation: 'pending_confirmation',
  closed: 'closed',
} as const;

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

export const TICKET_PRIORITY = {
  normal: 'normal',
  urgent: 'urgent',
} as const;

export type TicketPriority =
  (typeof TICKET_PRIORITY)[keyof typeof TICKET_PRIORITY];

/** Every status a user is allowed to read a ticket in; kept for validation. */
export const TICKET_STATUS_VALUES: readonly string[] =
  Object.values(TICKET_STATUS);

export interface ServiceActor {
  readonly id: string;
  readonly roleKeys: readonly string[];
  readonly isRoot: boolean;
  readonly isSupervisor: boolean;
  readonly isEngineer: boolean;
  readonly isObserver: boolean;
  readonly isIntegration: boolean;
}

/** Application-level failure with the HTTP status the route should answer with. */
export class ServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
  }
}

export function forbidden(message: string): ServiceError {
  return new ServiceError('FORBIDDEN', message, 403);
}

export function notFound(message: string): ServiceError {
  return new ServiceError('NOT_FOUND', message, 404);
}

export function invalid(message: string): ServiceError {
  return new ServiceError('INVALID_INPUT', message, 400);
}

export function conflict(message: string): ServiceError {
  return new ServiceError('CONFLICT', message, 409);
}

export function actorHasRole(actor: ServiceActor, role: BusinessRole): boolean {
  return actor.roleKeys.includes(ROLE_KEYS[role]);
}

export function actorIsStaff(actor: ServiceActor): boolean {
  return actor.isRoot || actor.isSupervisor || actor.isEngineer;
}

export interface CustomerRow {
  id: number;
  name: string;
  contactName?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  note?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface DeviceRow {
  id: number;
  code: string;
  name: string;
  model?: string | null;
  serialNo?: string | null;
  customerId: number;
  engineerId?: string | null;
  enabled: boolean;
  nextInspectionDate?: string | null;
  lastInspectionDate?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface TicketRow {
  id: number;
  code: string;
  title: string;
  description?: string | null;
  customerId: number;
  deviceId?: number | null;
  priority: string;
  confidential: boolean;
  status: string;
  assigneeId?: string | null;
  createdById?: string | null;
  source: string;
  externalEventNo?: string | null;
  dueAt?: Date | string | null;
  acceptedAt?: Date | string | null;
  acceptedById?: string | null;
  acceptNote?: string | null;
  processNote?: string | null;
  resultNote?: string | null;
  rejectReason?: string | null;
  confirmationNote?: string | null;
  closedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface InspectionRow {
  id: number;
  deviceId: number;
  inspectionDate: string;
  engineerId?: string | null;
  status: string;
  resultNote?: string | null;
  ticketId?: number | null;
  reminderSent: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface KnowledgeArticleRow {
  id: number;
  title: string;
  body?: string | null;
  category?: string | null;
  published: boolean;
  authorId?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface AssistantMessageRow {
  id: number;
  userId: string;
  ticketId?: number | null;
  question: string;
  answer: string;
  draft?: string | null;
  citations?: unknown;
  modelAvailable: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface TicketShareRow {
  id: number;
  ticketId: number;
  engineerId: string;
  expiresAt?: Date | string | null;
  createdById?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface ExecutionLogRow {
  id: number;
  ticketId: number;
  actorId?: string | null;
  action: string;
  detail?: string | null;
  createdAt?: Date | string;
}

export interface TicketAttachmentRow {
  id: number;
  ticketId: number;
  fileId: string;
  kind: string;
  uploadedById?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface TicketFileRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext?: string | null;
  mimeType: string;
  size: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

/** Row of the authentication plugin's `user` table, read-only here. */
export interface UserRow {
  id: string;
  name: string;
  username?: string | null;
  email: string;
  disabledAt?: Date | string | null;
}

export const accessServiceToken = sharedServiceToken<
  import('./access-service.js').AccessService
>('service.application.access');
export const serviceNotificationToken = sharedServiceToken<
  import('./notification-service.js').ServiceNotificationService
>('service.application.notification');
export const ticketServiceToken = sharedServiceToken<
  import('./ticket-service.js').TicketService
>('service.application.tickets');
export const inspectionServiceToken = sharedServiceToken<
  import('./inspection-service.js').InspectionService
>('service.application.inspections');
export const schedulerRunServiceToken = sharedServiceToken<
  import('./scheduler-run-service.js').SchedulerRunService
>('service.application.schedulerRuns');
export const knowledgeServiceToken = sharedServiceToken<
  import('./knowledge-service.js').KnowledgeService
>('service.application.knowledge');
export const dashboardServiceToken = sharedServiceToken<
  import('./dashboard-service.js').DashboardService
>('service.application.dashboard');
export const ledgerServiceToken = sharedServiceToken<
  import('./ledger-service.js').LedgerService
>('service.application.ledger');
export const serviceBootstrapToken = sharedServiceToken<
  import('./bootstrap.js').ServiceBootstrap
>('service.application.bootstrap');
export const integrationKeyServiceToken = sharedServiceToken<
  import('./integration-key-service.js').IntegrationKeyService
>('service.application.integrationKeys');
