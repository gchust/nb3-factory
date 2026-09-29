/**
 * Row shapes returned by the application's own `/api/service/*` endpoints.
 *
 * These mirror the columns the migrations declare; they are not generated from
 * the database, so an endpoint field that changes has to change here too.
 */

export type WorkOrderStatus =
  | 'pending_accept'
  | 'pending_process'
  | 'processing'
  | 'pending_confirm'
  | 'closed';

export type WorkOrderPriority = 'normal' | 'urgent';

export type KnowledgeStatus = 'draft' | 'published';

export interface ServiceCustomer {
  readonly id: number;
  readonly name: string;
  readonly contactName?: string | null;
  readonly contactPhone?: string | null;
  readonly contactEmail?: string | null;
  readonly address?: string | null;
  readonly note?: string | null;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface ServiceDevice {
  readonly id: number;
  readonly serialNumber: string;
  readonly name: string;
  readonly customerId?: number | null;
  readonly engineerId?: string | null;
  readonly enabled: boolean;
  readonly installedAt?: string | null;
  readonly nextInspectionDate?: string | null;
  readonly model?: string | null;
  readonly location?: string | null;
  readonly note?: string | null;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface ServiceActivity {
  readonly id: number;
  readonly workOrderId: number;
  readonly action: string;
  readonly actorId?: string | null;
  readonly detail?: unknown;
  readonly createdAt?: string;
}

export interface ServiceAttachment {
  readonly id: number;
  readonly workOrderId: number;
  readonly fileId: string;
  readonly category: 'photo' | 'report';
  readonly uploadedById?: string | null;
  readonly createdAt?: string;
  /** File metadata joined from the stored file so the client can preview it. */
  readonly filename?: string;
  readonly mimeType?: string;
  readonly ext?: string;
  readonly size?: string | number;
}

export interface ServiceShare {
  readonly id: number;
  readonly workOrderId: number;
  readonly sharedWithId: string;
  readonly sharedById: string;
  readonly revokedAt?: string | null;
  readonly createdAt?: string;
}

export interface ServiceWorkOrder {
  readonly id: number;
  readonly orderNo: string;
  readonly title: string;
  readonly description?: string | null;
  readonly customerId?: number | null;
  readonly deviceId?: number | null;
  readonly priority: WorkOrderPriority;
  readonly status: WorkOrderStatus;
  readonly source: string;
  readonly confidential: boolean;
  readonly assigneeId?: string | null;
  readonly createdById?: string | null;
  readonly acceptedById?: string | null;
  readonly acceptedAt?: string | null;
  readonly startedAt?: string | null;
  readonly submittedAt?: string | null;
  readonly closedAt?: string | null;
  readonly dueAt?: string | null;
  readonly resolution?: string | null;
  readonly lastReturnReason?: string | null;
  readonly returnCount?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly activities?: readonly ServiceActivity[];
  readonly attachments?: readonly ServiceAttachment[];
  readonly shares?: readonly ServiceShare[];
  readonly device?: ServiceDevice | null;
  readonly customer?: ServiceCustomer | null;
}

export interface ServiceKnowledgeArticle {
  readonly id: number;
  readonly title: string;
  readonly summary?: string | null;
  readonly content: string;
  readonly status: KnowledgeStatus;
  readonly tags?: string | null;
  readonly authorId?: string | null;
  readonly publishedAt?: string | null;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface ServiceManual {
  readonly id: number;
  readonly title: string;
  readonly version: string;
  readonly deviceModel?: string | null;
  readonly content: string;
  readonly status: KnowledgeStatus;
  readonly publishedAt?: string | null;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface ServiceInspection {
  readonly id: number;
  readonly deviceId: number;
  readonly plannedDate: string;
  readonly assigneeId?: string | null;
  readonly status: 'pending' | 'completed' | 'skipped';
  readonly result?: string | null;
  readonly completedAt?: string | null;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface ServiceTeamMember {
  readonly id: number;
  readonly userId: string;
  readonly displayName?: string | null;
  readonly groupName: 'group_a' | 'group_b';
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface ServiceEngineer {
  readonly id: string;
  readonly name: string;
  readonly group?: string | null;
}

export interface ServiceRoleFlags {
  readonly supervisor: boolean;
  readonly engineer: boolean;
  readonly observer: boolean;
  readonly integration: boolean;
  readonly unrestricted: boolean;
}

export interface ServiceSessionContext {
  readonly userId: string;
  readonly name: string;
  readonly role: ServiceRoleFlags;
}

export interface DashboardSummary {
  readonly role: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly overdue?: number;
  readonly groups?: readonly {
    readonly group?: string;
    readonly name?: string;
    readonly total: number;
    readonly open: number;
  }[];
}

export interface AssistantReference {
  readonly type: 'order' | 'knowledge' | 'manual';
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
}

export type AssistantStatus =
  'answered' | 'model_unavailable' | 'insufficient_evidence' | 'model_error';

export interface AssistantAnswer {
  readonly status: AssistantStatus;
  readonly answer: string;
  readonly references: readonly AssistantReference[];
  readonly proposedAction?: {
    readonly type: 'create_work_order';
    readonly title: string;
    readonly priority: WorkOrderPriority;
  };
}

export interface ServiceSchedule {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly scheduleStatus: string;
  readonly targetType: string;
  readonly runCount: number;
  readonly completedCount: number;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
}

export interface ServiceScheduleOccurrence {
  readonly id: string;
  readonly scheduleId: string;
  readonly status: string;
  readonly reason?: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly resultSummary?: Readonly<Record<string, unknown>>;
}

export interface ServiceScheduleRun {
  readonly scheduleId: string;
  readonly key: string;
  readonly runCount: number;
}

export interface AssistantConversation {
  readonly id: number;
  readonly title: string;
  readonly messages?: unknown;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}
