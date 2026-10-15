/**
 * The service desk's domain vocabulary: the states a ticket moves through, the
 * actions that move it, and the small amount of policy the workflow service
 * enforces on top of authorization.
 *
 * This module holds no framework imports so it can be reused by the service,
 * the routes, the seed and the tests without pulling in a database or container.
 */

/** A failure the route maps to an HTTP status; the service never picks one. */
export type ServiceDeskErrorCode =
  | 'TICKET_NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'INVALID_ASSIGNEE'
  | 'TICKET_CONFLICT'
  | 'INVALID_ARGUMENT';

export class ServiceDeskError extends Error {
  constructor(
    readonly code: ServiceDeskErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceDeskError';
  }
}

/** A ticket's position in the repair -> confirm -> close workflow. */
export const TICKET_STATUSES = [
  'pending',
  'processing',
  'resolved',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** How urgent the reporter says the issue is. */
export const TICKET_URGENCIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketUrgency = (typeof TICKET_URGENCIES)[number];

/** Every workflow action that is recorded in `ticketTransitions`. */
export const TICKET_ACTIONS = [
  'assign',
  'resolve',
  'confirm',
  'return',
  'comment',
] as const;
export type TicketAction = (typeof TICKET_ACTIONS)[number];

/**
 * The only legal status transitions. A transition whose current status is not
 * in this map is refused with `FAILED_PRECONDITION` before any write happens.
 */
export const STATUS_TRANSITIONS: Readonly<
  Record<TicketAction, Readonly<Partial<Record<TicketStatus, TicketStatus>>>>
> = {
  assign: { pending: 'processing', processing: 'processing' },
  resolve: { processing: 'resolved' },
  confirm: { resolved: 'closed' },
  return: { resolved: 'processing' },
  comment: {},
};

/** Whether `action` may move a ticket currently in `status`. */
export function canTransition(
  action: TicketAction,
  status: TicketStatus,
): boolean {
  if (action === 'comment') return true;
  return STATUS_TRANSITIONS[action][status] !== undefined;
}

/** The status a ticket reaches after `action`; `status` itself for `note`. */
export function nextStatus(
  action: TicketAction,
  status: TicketStatus,
): TicketStatus {
  return STATUS_TRANSITIONS[action][status] ?? status;
}

/** A ticket's unresolved window before the service desk is reminded, in ms. */
export const OVERDUE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * A stored timestamp. The Repository accepts a `Date` on write and returns the
 * portable ISO string on read, so both shapes reach this layer.
 */
export type TemporalValue = Date | string;

/** A ticket still being worked on counts as overdue after 24 hours without a state change. */
export function isOverdue(
  status: TicketStatus,
  statusChangedAt: TemporalValue,
  now: Date = new Date(),
): boolean {
  if (status !== 'pending' && status !== 'processing') return false;
  const changedAt =
    statusChangedAt instanceof Date
      ? statusChangedAt
      : new Date(statusChangedAt);
  return now.getTime() - changedAt.getTime() > OVERDUE_AFTER_MS;
}

/** A stored ticket as the service reads and returns it. */
export interface TicketRecord {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly urgency: string;
  readonly status: string;
  readonly requesterId: string;
  readonly assigneeId: string | null;
  readonly resolution: string | null;
  readonly attachmentIds: string[] | null;
  readonly statusChangedAt: TemporalValue;
  readonly lifecycleVersion: number;
  readonly overdueNotifiedAt: TemporalValue | null;
  readonly createdAt: TemporalValue;
  readonly updatedAt: TemporalValue;
}

/** A ticket as the API returns it: the stored row plus the display names of the people on it. */
export interface TicketView extends TicketRecord {
  readonly requesterName: string;
  readonly assigneeName: string | null;
}

/** A note in a ticket's handling history. */
export interface TicketNote {
  readonly id: number;
  readonly ticketId: number;
  readonly authorId: string;
  readonly content: string;
  readonly createdAt: TemporalValue;
}

/** A note as the API returns it: the row plus its author's display name. */
export interface TicketNoteView extends TicketNote {
  readonly authorName: string;
}

/** One row of the append-only workflow audit trail. */
export interface TicketTransition {
  readonly id: number;
  readonly ticketId: number;
  readonly action: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly actorId: string;
  readonly payload: Record<string, unknown> | null;
  readonly createdAt: TemporalValue;
}

/** A transition as the API returns it: the row plus its actor's display name. */
export interface TicketTransitionView extends TicketTransition {
  readonly actorName: string;
}

/** A ticket together with the child data shown in its detail view. */
export interface TicketDetail {
  readonly ticket: TicketView;
  readonly notes: readonly TicketNoteView[];
  readonly transitions: readonly TicketTransitionView[];
}

/** A ticket list page. */
export interface TicketPage {
  readonly items: readonly TicketView[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** One engineer's current load, for the dashboard. */
export interface EngineerWorkload {
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly openCount: number;
}

/** The service desk dashboard's figures. */
export interface ServiceDeskDashboard {
  readonly pendingAssignment: number;
  readonly processing: number;
  readonly resolved: number;
  readonly overdue: number;
  readonly pendingTickets: readonly TicketView[];
  readonly overdueTickets: readonly TicketView[];
  readonly workload: readonly EngineerWorkload[];
}
