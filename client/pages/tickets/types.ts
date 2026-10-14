/**
 * The shapes the IT service desk API returns. They mirror `server/routes/schemas.ts`; the server is the source of
 * truth, and a change there has to be repeated here.
 */

export type TicketStatus = 'pending' | 'processing' | 'resolved' | 'closed';
export type TicketUrgency = 'normal' | 'urgent' | 'critical';

/** The manual transitions the API accepts; `remind` is fired by the server only. */
export type TicketTransitionName =
  'assign' | 'reassign' | 'progress' | 'resolve' | 'confirm' | 'return';

export interface TicketAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: string | number;
  readonly contentUrl: string;
}

export interface TicketTransitionView {
  readonly name: string;
  readonly to: string;
  readonly allowed: boolean;
  readonly blockers: readonly string[];
}

export interface TicketHistoryEntry {
  readonly transition: string;
  readonly from: string | null;
  readonly to: string;
  readonly actorId: string;
  readonly input: unknown;
  readonly at: string;
  readonly version: number;
}

export interface Ticket {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly urgency: string;
  readonly status: string;
  readonly reporterId: string;
  readonly reporterName: string | null;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly handlingNote: string | null;
  readonly solution: string | null;
  readonly attachmentIds: readonly string[];
  readonly attachments: readonly TicketAttachment[];
  readonly assignedAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly returnedCount: number;
  readonly lastReturnReason: string | null;
  readonly remindedAt: string | null;
  readonly statusChangedAt: string;
  readonly lifecycleVersion: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly available: readonly TicketTransitionView[];
  readonly canFire: readonly string[];
  readonly history: readonly TicketHistoryEntry[];
}

export interface TicketListMeta {
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface Engineer {
  readonly id: string;
  readonly name: string | null;
  readonly username: string | null;
  readonly processing: number;
}

export interface TicketDashboard {
  readonly counts: Record<TicketStatus, number>;
  readonly pendingAssignment: readonly Ticket[];
  readonly overdue: readonly Ticket[];
  readonly workload: readonly Engineer[];
}

export interface TeamMember {
  readonly id: string;
  readonly name: string | null;
  readonly username: string | null;
  readonly email: string;
  readonly roles: readonly string[];
}

export interface TeamRole {
  readonly key: string;
  readonly label: string;
  readonly assignable: boolean;
  readonly removable: boolean;
}

export interface Team {
  readonly members: readonly TeamMember[];
  readonly roles: readonly TeamRole[];
}

export interface TicketListQuery {
  readonly status?: string;
  readonly urgency?: string;
  readonly q?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

/** The context a child overlay reads from its parent page. */
export interface TicketsOutletContext {
  readonly reload: () => void;
}

/** The context the ticket detail page hands to the action dialogs it declares as children. */
export interface TicketDetailOutletContext {
  readonly ticket: Ticket;
  readonly reload: () => void;
}
