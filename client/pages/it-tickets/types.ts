export const TICKET_STATUSES = [
  'pending',
  'in_progress',
  'resolved',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_URGENCIES = ['low', 'medium', 'high', 'critical'] as const;
export type TicketUrgency = (typeof TICKET_URGENCIES)[number];

export const TICKET_SORTS = [
  'createdAt',
  'updatedAt',
  'number',
  'title',
] as const;
export type TicketSort = (typeof TICKET_SORTS)[number];
export type SortOrder = 'asc' | 'desc';

export type TicketStatusFilter = TicketStatus | 'open';

export interface TicketSummary {
  readonly id: number;
  readonly number: string;
  readonly title: string;
  readonly description: string;
  readonly urgency: TicketUrgency;
  readonly status: TicketStatus;
  readonly requesterId: string;
  readonly requesterName: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly statusChangedAt: string | null;
  readonly assignedAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly returnedAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface TicketActivity {
  readonly id: number;
  readonly type: string;
  readonly content: string | null;
  readonly fromStatus: TicketStatus | null;
  readonly toStatus: TicketStatus | null;
  readonly authorId: string;
  readonly authorName: string;
  readonly createdAt: string | null;
}

export interface TicketAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly contentUrl: string;
  readonly createdAt: string | null;
}

export interface TicketPermissions {
  readonly canAssign: boolean;
  readonly canProgress: boolean;
  readonly canResolve: boolean;
  readonly canClose: boolean;
  readonly canReturn: boolean;
  readonly canComment: boolean;
}

export interface TicketDetail extends TicketSummary {
  readonly resolution: string | null;
  readonly activities: readonly TicketActivity[];
  readonly attachments: readonly TicketAttachment[];
  readonly permissions: TicketPermissions;
}

export interface TicketEngineer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface TicketWorkload {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly open: number;
  readonly overdue: number;
}

export interface TicketDashboard {
  readonly pendingAssignment: number;
  readonly inProgress: number;
  readonly resolvedAwaiting: number;
  readonly overdue: number;
  readonly myOpen: number;
  readonly canAssign: boolean;
  readonly overdueAfterHours: number;
  readonly workload: readonly TicketWorkload[];
  readonly recent: readonly TicketSummary[];
  readonly generatedAt: string;
}

export interface UploadedFile {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly contentUrl: string;
}

export interface DataResponse<T> {
  readonly data: T;
}

export interface ListResponse<T> extends DataResponse<readonly T[]> {
  readonly meta: {
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  };
}
