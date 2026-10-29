export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'resolved',
  'closed',
] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TICKET_CATEGORIES = [
  'incident',
  'access',
  'hardware',
  'software',
  'other',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export interface TicketUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface TicketAttachment {
  readonly id: string;
  readonly fileId: string;
  readonly commentId: string | null;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly contentUrl: string;
}

export interface TicketComment {
  readonly id: string;
  readonly ticketId: string;
  readonly authorId: string;
  readonly author: TicketUser | null;
  readonly body: string;
  readonly internal: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachments: readonly TicketAttachment[];
}

export interface TicketListItem {
  readonly id: string;
  readonly ticketNo: string;
  readonly title: string;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly category: TicketCategory;
  readonly requesterId: string;
  readonly requester: TicketUser | null;
  readonly assigneeId: string | null;
  readonly assignee: TicketUser | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly overdue: boolean;
  readonly slaDeadline: string;
}

export interface TicketDetail extends TicketListItem {
  readonly description: string;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly comments: readonly TicketComment[];
  readonly attachments: readonly TicketAttachment[];
  readonly viewer: {
    readonly canCommentInternal: boolean;
    readonly canAssign: boolean;
    readonly canResolve: boolean;
    readonly canClose: boolean;
    readonly canReopen: boolean;
  };
}

export interface TicketWorkload {
  readonly user: TicketUser;
  readonly active: number;
  readonly overdue: number;
}

export interface TicketDashboard {
  readonly viewer: { readonly serviceDesk: boolean };
  readonly counts: {
    readonly open: number;
    readonly inProgress: number;
    readonly resolved: number;
    readonly closed: number;
    readonly active: number;
    readonly unassigned: number;
    readonly overdue: number;
  };
  readonly unassigned: readonly TicketListItem[];
  readonly overdue: readonly TicketListItem[];
  readonly awaitingConfirmation: readonly TicketListItem[];
  readonly recent: readonly TicketListItem[];
  readonly workload: readonly TicketWorkload[];
}

export interface TicketFilters {
  readonly q?: string;
  readonly status?: TicketStatus;
  readonly priority?: TicketPriority;
  readonly category?: TicketCategory;
  readonly page: number;
  readonly pageSize: number;
}

export interface TicketPage {
  readonly rows: readonly TicketListItem[];
  readonly total: number;
}
