/**
 * The service desk's wire types. They mirror `server/routes/service-desk/schemas.ts`; keep the two in step.
 */

export const TICKET_STATUSES = [
  'pending',
  'processing',
  'resolved',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_URGENCIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketUrgency = (typeof TICKET_URGENCIES)[number];

export interface Ticket {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly urgency: string;
  readonly status: string;
  readonly requesterId: string;
  readonly requesterName: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly resolution: string | null;
  readonly attachmentIds: readonly string[] | null;
  readonly statusChangedAt: string;
  readonly lifecycleVersion: number;
  readonly overdueNotifiedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TicketNote {
  readonly id: number;
  readonly ticketId: number;
  readonly authorId: string;
  readonly authorName: string;
  readonly content: string;
  readonly createdAt: string;
}

export interface TicketTransition {
  readonly id: number;
  readonly ticketId: number;
  readonly action: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly payload: Readonly<Record<string, unknown>> | null;
  readonly createdAt: string;
}

export interface TicketDetail {
  readonly ticket: Ticket;
  readonly notes: readonly TicketNote[];
  readonly transitions: readonly TicketTransition[];
}

export interface Engineer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface EngineerWorkload {
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly openCount: number;
}

export interface ServiceDeskDashboard {
  readonly pendingAssignment: number;
  readonly processing: number;
  readonly resolved: number;
  readonly overdue: number;
  readonly pendingTickets: readonly Ticket[];
  readonly overdueTickets: readonly Ticket[];
  readonly workload: readonly EngineerWorkload[];
}

export interface TicketPage {
  readonly items: readonly Ticket[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface TicketListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: string;
  readonly urgency?: string;
  readonly keyword?: string;
  readonly assigneeId?: string;
  readonly requesterId?: string;
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description: string;
  readonly urgency: string;
  readonly attachmentIds?: readonly string[];
}

export interface AssignTicketInput {
  readonly assigneeId: string;
  readonly note?: string;
}

export interface ResolveTicketInput {
  readonly resolution: string;
  readonly note?: string;
}

export interface ReturnTicketInput {
  readonly reason: string;
}
