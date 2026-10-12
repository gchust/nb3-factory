/** The lifecycle states a ticket moves through; the server owns the transitions between them. */
export const TICKET_STATES = [
  'submitted',
  'assigned',
  'processing',
  'resolved',
  'closed',
] as const;

export type TicketState = (typeof TICKET_STATES)[number];

/** How urgent the reporter says the problem is. */
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/** The transitions a person may trigger, as the server names them. */
export type ManualTransition =
  'assign' | 'start' | 'resolve' | 'confirm' | 'reopen';

export interface Ticket {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: string | null;
  readonly priority: TicketPriority;
  readonly status: TicketState;
  readonly statusChangedAt: string;
  readonly reporterId: string;
  readonly reporterName: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly resolution: string | null;
  readonly serviceDeskNote: string | null;
  readonly reopenReason: string | null;
  readonly reopenedCount: number;
  readonly screenshotIds: readonly string[] | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OfferedTransition {
  readonly name: ManualTransition;
  readonly title: string;
  readonly allowed: boolean;
  readonly blockers: readonly {
    readonly code: string;
    readonly message: string;
  }[];
}

export interface TicketComment {
  readonly id: string;
  readonly ticketId: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly kind: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface TicketAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: string | number;
}

export interface TicketDetail {
  readonly ticket: Ticket;
  readonly available: readonly OfferedTransition[];
  readonly comments: readonly TicketComment[];
  readonly attachments: readonly TicketAttachment[];
}

export interface TicketOverview {
  readonly role: 'service-desk' | 'engineer' | 'employee';
  readonly stats: {
    readonly pending: number;
    readonly overdue: number;
    readonly open: number;
    readonly resolved: number;
    readonly total: number;
  };
  readonly workload: readonly {
    readonly id: string;
    readonly name: string;
    readonly count: number;
  }[];
  readonly recent: readonly Ticket[];
}

export interface Engineer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

/** The child routes of the ticket list read `reload` from the outlet to refresh it after a write. */
export interface TicketsOutletContext {
  readonly reload: () => void;
}

export function isTicketState(value: string | null): value is TicketState {
  return value !== null && TICKET_STATES.some((state) => state === value);
}
