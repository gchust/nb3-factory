export const TICKET_STATUSES = [
  'pending',
  'processing',
  'resolved',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_URGENCIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketUrgency = (typeof TICKET_URGENCIES)[number];

export const TEAM_ROLES = ['engineer', 'serviceDesk'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export interface TicketAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  /** Where the browser reads the bytes, already carrying the deployment base path. */
  readonly contentUrl: string;
}

export interface TicketRecord {
  readonly id: number;
  readonly kind: string;
  readonly authorId: string | null;
  readonly authorName: string | null;
  readonly content: string | null;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly createdAt: string;
}

export interface Ticket {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly urgency: string;
  readonly status: string;
  readonly statusChangedAt: string;
  readonly reporterId: string;
  readonly reporterName: string | null;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly resolution: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly closedById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Neither closed nor resolved, and untouched for over a day. */
  readonly overdue: boolean;
  readonly attachments: readonly TicketAttachment[];
  readonly records?: readonly TicketRecord[];
}

export interface TicketList {
  readonly data: readonly Ticket[];
  readonly meta: {
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  };
}

export interface ItRole {
  readonly userId: string;
  readonly role: TeamRole | null;
  readonly isRoot: boolean;
  readonly isServiceDesk: boolean;
}

export interface EngineerWorkload {
  readonly userId: string;
  readonly name: string;
  readonly role: TeamRole | null;
  readonly open: number;
  readonly total: number;
}

export interface ItDashboard {
  readonly role: ItRole;
  readonly pending: number;
  readonly processing: number;
  readonly resolved: number;
  readonly closed: number;
  readonly overdue: number;
  readonly mine: number;
  readonly engineers: readonly EngineerWorkload[];
}

export interface ItUser {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: TeamRole | null;
}

/** What the tickets list passes to its child routes: the `new` dialog and the ticket detail page. */
export interface TicketsOutletContext {
  readonly reload: () => void;
}

export function isTicketStatus(value: string | null): value is TicketStatus {
  return TICKET_STATUSES.some((status) => status === value);
}

export function isTicketUrgency(value: string | null): value is TicketUrgency {
  return TICKET_URGENCIES.some((urgency) => urgency === value);
}
