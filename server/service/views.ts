/**
 * What the HTTP layer returns.
 *
 * Every field is JSON-friendly — dates are ISO strings — and every view is the
 * complete statement of a response body, so the zod schemas in
 * `server/routes/schemas.ts` can be typed against it and the OpenAPI document
 * cannot drift from what the service actually returns.
 */

import type { AttachmentCategory } from './constants.js';
import type {
  WorkOrderAction,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
} from './domain.js';

export interface CustomerView {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly contactEmail: string | null;
  readonly address: string | null;
  readonly level: string;
  readonly note: string | null;
  readonly deviceCount: number;
  readonly openOrderCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DeviceView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly model: string | null;
  readonly serialNumber: string | null;
  readonly customerId: string;
  readonly customerName: string | null;
  readonly serviceEngineerId: string | null;
  readonly serviceEngineerName: string | null;
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly location: string | null;
  readonly installDate: string | null;
  readonly warrantyUntil: string | null;
  readonly nextInspectionDate: string | null;
  readonly inspectionCycleDays: number;
  readonly enabled: boolean;
  readonly note: string | null;
  readonly openOrderCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkOrderView {
  readonly id: string;
  readonly orderNo: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: WorkOrderStatus;
  readonly priority: WorkOrderPriority;
  readonly confidential: boolean;
  readonly source: WorkOrderSource;
  readonly externalEventNo: string | null;
  readonly faultCategory: string | null;
  readonly customerId: string | null;
  readonly customerName: string | null;
  readonly deviceId: string | null;
  readonly deviceCode: string | null;
  readonly deviceName: string | null;
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly createdById: string | null;
  readonly createdByName: string | null;
  readonly acceptedAt: string | null;
  readonly processingAt: string | null;
  readonly submittedAt: string | null;
  readonly confirmedAt: string | null;
  readonly closedAt: string | null;
  readonly closeSummary: string | null;
  readonly failureReason: string | null;
  readonly reopenCount: number;
  readonly overdueSince: string | null;
  readonly lastActivityAt: string;
  readonly attachmentCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkOrderExecutionView {
  readonly id: string;
  readonly workOrderId: string;
  readonly action: string;
  readonly fromStatus: string | null;
  readonly toStatus: string;
  readonly operatorId: string | null;
  readonly operatorName: string | null;
  readonly idempotencyKey: string | null;
  readonly result: string;
  readonly failureReason: string | null;
  readonly detail: string | null;
  readonly attempt: number;
  readonly createdAt: string;
}

export interface WorkOrderShareView {
  readonly id: string;
  readonly workOrderId: string;
  readonly sharedWithId: string;
  readonly sharedWithName: string | null;
  readonly sharedById: string | null;
  readonly sharedByName: string | null;
  readonly note: string | null;
  readonly expiresAt: string | null;
  readonly active: boolean;
  readonly readOnly: true;
  readonly createdAt: string;
}

export interface AttachmentView {
  readonly id: string;
  readonly workOrderId: string;
  readonly fileId: string;
  readonly category: AttachmentCategory;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly uploadedById: string | null;
  readonly uploadedByName: string | null;
  readonly contentUrl: string;
  readonly createdAt: string;
}

/**
 * The storage location behind one attachment, resolved only after the caller's
 * access to the order it belongs to has been checked.
 *
 * `disk` and `key` are what the Drive reads the bytes with; they are never part
 * of {@link AttachmentView}, which exposes no way to reach storage directly.
 */
export interface AttachmentStorage {
  readonly id: string;
  readonly workOrderId: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly disk: string;
  readonly key: string;
}

export interface RepairNoteView {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly deviceModel: string | null;
  readonly faultCategory: string | null;
  readonly authorId: string | null;
  readonly authorName: string | null;
  readonly status: 'draft' | 'published';
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ManualView {
  readonly id: string;
  readonly title: string;
  readonly modelName: string | null;
  readonly version: string | null;
  readonly docNo: string | null;
  readonly summary: string | null;
  readonly fileName: string | null;
  readonly status: 'draft' | 'published' | 'indexed' | 'failed';
  readonly indexMessage: string | null;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InspectionTaskView {
  readonly id: string;
  readonly deviceId: string;
  readonly deviceCode: string | null;
  readonly deviceName: string | null;
  readonly customerName: string | null;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly planDate: string;
  readonly status: 'pending' | 'completed' | 'skipped';
  readonly result: string | null;
  readonly remark: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkOrderDetailView {
  readonly order: WorkOrderView;
  /** Actions the state machine allows *and* the caller is permitted to take. */
  readonly allowedActions: readonly WorkOrderAction[];
  readonly executions: readonly WorkOrderExecutionView[];
  readonly shares: readonly WorkOrderShareView[];
  readonly attachments: readonly AttachmentView[];
}

export interface PageMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface Paged<T> {
  readonly data: readonly T[];
  readonly meta: PageMeta;
}

/** What the device platform integration may read back about its own submission. */
export interface ExternalTicketView {
  readonly orderNo: string;
  readonly externalEventNo: string | null;
  readonly status: WorkOrderStatus;
  readonly priority: WorkOrderPriority;
  readonly accepted: boolean;
  readonly closed: boolean;
  readonly assigneeName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ExternalTicketAcceptedView {
  /** The created or existing work order, so the caller can correlate further calls. */
  readonly workOrderId: string;
  readonly orderNo: string;
  readonly externalEventNo: string | null;
  readonly status: WorkOrderStatus;
  readonly priority: WorkOrderPriority;
  /** `true` when this call created the order, `false` when it returned the existing one. */
  readonly created: boolean;
}

export interface AssistantModelView {
  readonly configured: boolean;
  readonly provider: string | null;
  readonly model: string | null;
}

export interface AssistantKnowledgeBaseView {
  readonly configured: boolean;
  readonly vectorDatabase: string | null;
  readonly manifestCount: number;
}

/** The honest answer to "can the order assistant answer from the manuals?". */
export interface AssistantStatusView {
  readonly available: boolean;
  readonly reason: string | null;
  readonly model: AssistantModelView;
  readonly knowledgeBase: AssistantKnowledgeBaseView;
  readonly manualCount: number;
  readonly indexedManualCount: number;
}

export interface OverviewView {
  readonly totals: {
    readonly openOrders: number;
    readonly pendingAcceptance: number;
    readonly pendingConfirmation: number;
    readonly overdueOrders: number;
    readonly urgentOpenOrders: number;
    readonly todayInspections: number;
    readonly pendingInspections: number;
    readonly devices: number;
    readonly customers: number;
    readonly publishedNotes: number;
  };
  readonly byStatus: readonly {
    readonly status: WorkOrderStatus;
    readonly count: number;
  }[];
  /** Open orders per service group, so a supervisor sees where the load sits. */
  readonly groupWorkload: readonly {
    readonly groupId: string | null;
    readonly groupName: string | null;
    readonly openOrders: number;
  }[];
  readonly urgentQueue: readonly WorkOrderView[];
  readonly recentOrders: readonly WorkOrderView[];
  readonly myTodayInspections: readonly InspectionTaskView[];
}

/** A dispatch group, as the device and work-order forms need to list it. */
export interface ServiceGroupView {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly description: string | null;
  readonly active: boolean;
  readonly memberCount: number;
}

/** One person an order can be shared with, for the share picker. */
export interface ShareTargetView {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly disabled: boolean;
}

/** One row of the scheduled-run ledger, the at-most-once record of a task firing. */
export interface ScheduledRunView {
  readonly id: string;
  readonly taskKey: string;
  readonly runDate: string;
  readonly status: 'running' | 'succeeded' | 'failed';
  readonly summary: string | null;
  readonly failureReason: string | null;
  readonly finishedAt: string | null;
  readonly createdAt: string;
}

/** One overdue reminder that was recorded, so a second run the same day is a no-op. */
export interface OverdueReminderView {
  readonly id: string;
  readonly workOrderId: string;
  readonly orderNo: string | null;
  readonly orderTitle: string | null;
  readonly recipientId: string | null;
  readonly recipientName: string | null;
  readonly sentDate: string;
  readonly channel: string;
  readonly createdAt: string;
}

/** A scheduled task this application registers, as both the scheduler and its page describe it. */
export interface TaskDefinitionView {
  readonly key: string;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly scheduleKey: string;
  readonly targetType: string;
  readonly cron: string;
  readonly timezone: string;
  readonly lastRun: ScheduledRunView | null;
}

export interface TaskListView {
  readonly tasks: readonly TaskDefinitionView[];
}

/** What running a task on demand produced. */
export interface TaskRunResultView {
  readonly key: string;
  readonly runDate: string;
  readonly createdCount: number;
  readonly summary: {
    readonly pendingInspections: number;
    readonly overdueOrders: number;
  };
}
