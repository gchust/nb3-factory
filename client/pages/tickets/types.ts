export type TicketStatus = 'open' | 'assigned' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface TicketAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
}

export interface TicketSummary {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly requesterId: string;
  readonly requesterName: string | null;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly slaDueAt: string;
  readonly assignedAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly reopenedAt: string | null;
  readonly resolution: string | null;
  readonly attachments: readonly TicketAttachment[];
  readonly commentCount: number;
  readonly overdue: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TicketActivity {
  readonly id: number;
  readonly authorId: string;
  readonly authorName: string | null;
  readonly kind:
    'created' | 'comment' | 'assigned' | 'resolved' | 'confirmed' | 'reopened';
  readonly body: string;
  readonly createdAt: string;
}

export interface ServiceDeskTicket extends TicketSummary {
  readonly activities: readonly TicketActivity[];
  readonly availableActions: readonly ServiceDeskAction[];
}

export type ServiceDeskAction =
  'assign' | 'comment' | 'resolve' | 'confirm' | 'reopen';

export interface UploadedAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
}

export interface TicketListResult {
  readonly items: readonly TicketSummary[];
  readonly total: number;
  readonly canCreate: boolean;
}

export interface EngineerWorkload {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly active: number;
  readonly overdue: number;
}

export interface DashboardResult {
  readonly canCreate: boolean;
  readonly canAssign: boolean;
  readonly total: number;
  readonly open: number;
  readonly assigned: number;
  readonly unassigned: number;
  readonly resolved: number;
  readonly closed: number;
  readonly overdue: number;
  readonly resolutionRate: number;
  readonly byPriority: {
    readonly low: number;
    readonly normal: number;
    readonly high: number;
    readonly urgent: number;
  };
  readonly workload: readonly EngineerWorkload[];
  readonly recent: readonly TicketSummary[];
}

export interface Assignee {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}
