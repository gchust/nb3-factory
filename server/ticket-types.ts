/**
 * The ticket desk's shared vocabulary: the values its tables hold, the rows
 * they store, and the shapes the HTTP API answers with.
 *
 * It has no imports of its own, so the lifecycle, the service and the routes
 * can all depend on it without a cycle.
 */

/** `status` is written by the lifecycle runtime only; these are its four states. */
export type TicketState = 'pending' | 'assigned' | 'resolved' | 'closed';

/** How urgent the reporter says the issue is. */
export type TicketUrgency = 'low' | 'normal' | 'high' | 'urgent';

export const TICKET_URGENCIES: readonly TicketUrgency[] = [
  'low',
  'normal',
  'high',
  'urgent',
];

export type TicketCommentKind =
  /** An engineer's note in the handling process. */
  | 'comment'
  /** A requester's reason for returning the ticket. */
  | 'reason'
  /** The resolution written when an engineer completes handling. */
  | 'solution';

/** A person's standing in the desk. Everyone else is an employee who may only report issues. */
export type TicketStaffRole = 'serviceDesk' | 'engineer';

export interface TicketRow {
  id: number;
  title: string;
  description: string;
  urgency: string;
  status: string;
  statusChangedAt: string | Date;
  lifecycleVersion: number;
  requesterId: string;
  requesterName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  resolution: string | null;
  lastReason: string | null;
  assignedAt: string | Date | null;
  resolvedAt: string | Date | null;
  closedAt: string | Date | null;
  remindedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface TicketCommentRow {
  id: number;
  ticketId: number;
  authorId: string;
  authorName: string;
  kind: string;
  body: string;
  createdAt: string | Date;
}

export interface TicketAttachmentRow {
  id: number;
  ticketId: number;
  uploaderId: string;
  disk: string;
  key: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string | Date;
}

export interface TicketStaffRow {
  id: number;
  userId: string;
  role: string;
  displayName: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** One attachment as a page lists it; the bytes are fetched from their own route. */
export interface TicketAttachmentView {
  id: number;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface TicketCommentView {
  id: number;
  kind: TicketCommentKind;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/** One line of the ticket's own history, read from the lifecycle's transition log. */
export interface TicketHistoryEntry {
  id: string;
  transition: string;
  from: string | null;
  to: string;
  actorId: string;
  at: string;
}

/** A ticket as a list or the dashboard shows it. */
export interface TicketSummary {
  id: number;
  title: string;
  urgency: TicketUrgency;
  status: TicketState;
  requesterId: string;
  requesterName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  resolution: string | null;
  lastReason: string | null;
  assignedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string;
  /** True while a ticket is open and has been in its state for over a day. */
  overdue: boolean;
}

/** A ticket with everything a detail view shows. */
export interface TicketDetail extends TicketSummary {
  /** The lifecycle's optimistic version; a page passes it back so a stale screen is refused. */
  version: number;
  description: string;
  /** What the viewer may do with it now, straight from the lifecycle. */
  available: TicketAvailableTransition[];
  comments: TicketCommentView[];
  attachments: TicketAttachmentView[];
  history: TicketHistoryEntry[];
}

export interface TicketAvailableTransition {
  name: string;
  title: string;
  to: readonly string[];
  allowed: boolean;
  /** Why not, as the lifecycle's blockers say it (already translated by the server). */
  blockers: readonly string[];
}

/** The viewer's standing, so a page renders only what it may do. */
export interface TicketContext {
  userId: string;
  name: string;
  role: TicketStaffRole | 'employee';
  serviceDesk: boolean;
  engineer: boolean;
  root: boolean;
}

export interface TicketStaffMember {
  id: number;
  userId: string;
  role: TicketStaffRole;
  displayName: string;
  userIdLabel: string;
}

export interface TicketUserOption {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
}

export interface TicketWorkload {
  userId: string;
  name: string;
  /** Tickets assigned to them and not yet closed. */
  active: number;
  /** Tickets they handled and are now waiting for the requester. */
  resolved: number;
  /** Tickets of theirs that were closed. */
  closed: number;
}

export interface TicketDashboard {
  serviceDesk: boolean;
  pending: TicketSummary[];
  pendingCount: number;
  overdue: TicketSummary[];
  overdueCount: number;
  workload: TicketWorkload[];
  /** The viewer's own open tickets, whatever their role. */
  mine: TicketSummary[];
  /** Tickets assigned to the viewer while they are an engineer. */
  assignedToMe: TicketSummary[];
}

export interface TicketListPage {
  items: TicketSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export type TicketScope = 'default' | 'reported' | 'assigned' | 'all';

/** What the list page's status filter offers; `open` is every state but `closed`. */
export type TicketStatusFilter = 'open' | TicketState;

export function isTicketUrgency(value: unknown): value is TicketUrgency {
  return (
    typeof value === 'string' &&
    (TICKET_URGENCIES as readonly string[]).includes(value)
  );
}

export function isTicketStaffRole(value: unknown): value is TicketStaffRole {
  return value === 'serviceDesk' || value === 'engineer';
}
