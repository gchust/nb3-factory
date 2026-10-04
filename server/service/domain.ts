/**
 * Domain vocabulary for the equipment after-sales service application.
 *
 * Kept free of database access so services, routes, seeds and the workflow
 * package can share one description of the business states.
 */

export const TICKET_STATUSES = [
  'pending',
  'accepted',
  'processing',
  'pending_confirm',
  'closed',
  'returned',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const DEVICE_STATUSES = ['active', 'disabled', 'maintenance'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const INSPECTION_STATUSES = [
  'planned',
  'in_progress',
  'completed',
  'overdue',
] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const TICKET_SOURCES = ['internal', 'external'] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];

export const TICKET_EVENT_TYPES = [
  'created',
  'acceptance_pending',
  'acceptance_failed',
  'accepted',
  'started',
  'submitted',
  'closed',
  'returned',
  'shared',
  'share_revoked',
  'comment',
  'external_received',
] as const;
export type TicketEventType = (typeof TICKET_EVENT_TYPES)[number];

export interface Customer {
  id: number;
  code: string;
  name: string;
  contact: string | null;
  phone: string | null;
  level: string;
  region: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: number;
  deviceNo: string;
  model: string;
  serialNo: string | null;
  customerId: number | null;
  status: DeviceStatus;
  installedAt: string | null;
  warrantyUntil: string | null;
  nextInspectionAt: string | null;
  location: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: number;
  ticketNo: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  confidential: boolean;
  customerId: number | null;
  deviceId: number | null;
  assigneeId: number | null;
  reporterId: number | null;
  source: TicketSource;
  externalEventNo: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  closedAt: string | null;
  slaDueAt: string | null;
  handling: string | null;
  resolution: string | null;
  acceptanceNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketEvent {
  id: number;
  ticketId: number;
  type: TicketEventType;
  status: TicketStatus | null;
  operatorId: number | null;
  operatorName: string | null;
  comment: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface TicketShare {
  id: number;
  ticketId: number;
  granteeId: number;
  granteeName: string | null;
  grantedById: number | null;
  reason: string | null;
  sharingRuleKey: string | null;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Inspection {
  id: number;
  deviceId: number;
  plannedDate: string;
  status: InspectionStatus;
  assigneeId: number | null;
  result: string | null;
  notes: string | null;
  ticketId: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeArticle {
  id: number;
  title: string;
  category: string | null;
  deviceModel: string | null;
  tags: string | null;
  status: string;
  summary: string | null;
  content: string;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketAttachment {
  id: number;
  ticketId: number;
  fileId: string;
  kind: string;
  note: string | null;
  createdById: number | null;
  createdAt: string;
}

/** Transition table for the ticket lifecycle. */
export const TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  pending: ['accepted'],
  accepted: ['processing', 'returned'],
  processing: ['pending_confirm', 'returned'],
  pending_confirm: ['closed', 'returned'],
  closed: [],
  returned: ['accepted'],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return (TICKET_TRANSITIONS[from] ?? []).includes(to);
}

export const PRIORITY_SLA_HOURS: Record<TicketPriority, number> = {
  low: 72,
  normal: 48,
  high: 24,
  urgent: 4,
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  pending: '待受理',
  accepted: '已受理',
  processing: '处理中',
  pending_confirm: '待确认',
  closed: '已关闭',
  returned: '已退回',
};

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function toIso(value: Date): string {
  return value.toISOString();
}

export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
