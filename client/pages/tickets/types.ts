export type TicketStatus = 'pending' | 'processing' | 'resolved' | 'closed';
export type TicketUrgency = 'low' | 'normal' | 'high' | 'urgent';
export type HelpdeskRole = 'employee' | 'engineer' | 'serviceDesk' | 'admin';

export interface TicketLog {
  readonly id: number;
  readonly action: string;
  readonly content: string | null;
  readonly authorId: string | null;
  readonly authorName: string | null;
  readonly createdAt: string;
}

export interface Ticket {
  readonly id: number;
  readonly ticketNo: string;
  readonly title: string;
  readonly description: string;
  readonly urgency: TicketUrgency;
  readonly status: TicketStatus;
  readonly reporterId: string;
  readonly reporterName: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly screenshot: string | null;
  readonly solution: string | null;
  readonly lastRejectedReason: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly overdue: boolean;
  readonly logs?: readonly TicketLog[];
}

export interface Engineer {
  readonly id: string;
  readonly name: string;
}

export interface Viewer {
  readonly userId: string;
  readonly name: string;
  readonly role: HelpdeskRole;
}

export interface EngineerWorkload {
  readonly userId: string;
  readonly name: string;
  readonly open: number;
  readonly resolved: number;
}

export interface TicketStats {
  readonly total: number;
  readonly pending: number;
  readonly processing: number;
  readonly resolved: number;
  readonly closed: number;
  readonly overdue: number;
  readonly engineerWorkload: readonly EngineerWorkload[];
}

export const TICKET_STATUSES: readonly TicketStatus[] = [
  'pending',
  'processing',
  'resolved',
  'closed',
];

export const TICKET_URGENCIES: readonly TicketUrgency[] = [
  'low',
  'normal',
  'high',
  'urgent',
];

/** A role able to dispatch tickets, or see every ticket. */
export function isOverseer(role: HelpdeskRole): boolean {
  return role === 'serviceDesk' || role === 'admin';
}

/** What a ticket list's child routes read through `<Outlet context>`: a way to refresh the list behind them. */
export interface TicketsOutletContext {
  readonly reload: () => void;
}
