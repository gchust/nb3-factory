/**
 * The row shapes the after-sales service API answers with.
 *
 * They mirror the response schemas the routes declare in
 * `server/routes/schemas.ts`; the endpoints are the authority and a response
 * schema change belongs in both files in the same change.
 */

export const ORDER_STATUSES = [
  'pending_acceptance',
  'pending_processing',
  'processing',
  'pending_confirmation',
  'closed',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];

export const ORDER_SOURCES = ['internal', 'platform'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const INSPECTION_STATUSES = ['pending', 'completed', 'skipped'] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_RESULTS = ['normal', 'attention', 'fault'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export const KNOWLEDGE_STATUSES = ['draft', 'published', 'archived'] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export const MANUAL_STATUSES = [
  'uploaded',
  'processing',
  'ready',
  'failed',
] as const;
export type ManualStatus = (typeof MANUAL_STATUSES)[number];

export const FILE_CATEGORIES = ['photo', 'report', 'other'] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export interface ServiceGroup {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly address: string | null;
  readonly remark: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Device {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly model: string | null;
  readonly customerId: number;
  readonly engineerId: string | null;
  readonly groupId: number | null;
  readonly enabled: boolean;
  readonly nextInspectionDate: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServiceOrder {
  readonly id: number;
  readonly orderNo: string;
  readonly title: string;
  readonly customerId: number | null;
  readonly deviceId: number | null;
  readonly description: string | null;
  readonly status: OrderStatus;
  readonly priority: OrderPriority;
  readonly dueAt: string | null;
  readonly assigneeId: string | null;
  readonly groupId: number | null;
  readonly confidential: boolean;
  readonly observerVisible: boolean;
  readonly source: OrderSource;
  readonly externalEventId: string | null;
  readonly acceptanceNote: string | null;
  readonly resolution: string | null;
  readonly returnReason: string | null;
  readonly acceptedAt: string | null;
  readonly processingAt: string | null;
  readonly submittedAt: string | null;
  readonly closedAt: string | null;
  readonly createdById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServiceOrderLog {
  readonly id: number;
  readonly orderId: number;
  readonly action: string;
  readonly status: string;
  readonly message: string;
  readonly detail: unknown;
  readonly actorId: string | null;
  readonly idempotencyKey: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly createdAt: string;
}

export interface ServiceOrderShare {
  readonly id: number;
  readonly orderId: number;
  readonly engineerId: string;
  readonly grantedById: string | null;
  readonly note: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServiceInspection {
  readonly id: number;
  readonly deviceId: number;
  readonly assigneeId: string | null;
  readonly plannedDate: string;
  readonly status: InspectionStatus;
  readonly result: InspectionResult | null;
  readonly resultCode: string | null;
  readonly completedAt: string | null;
  readonly source: string;
  readonly idempotencyKey: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RepairKnowledge {
  readonly id: number;
  readonly title: string;
  readonly content: string;
  readonly category: string | null;
  readonly status: KnowledgeStatus;
  readonly authorId: string | null;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DeviceManual {
  readonly id: number;
  readonly title: string;
  readonly fileName: string;
  readonly content: string;
  readonly deviceId: number | null;
  readonly status: ManualStatus;
  readonly failureReason: string | null;
  readonly aiDocumentId: string | null;
  readonly uploadedById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServiceOrderFile {
  readonly id: string;
  readonly orderId: number | null;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly category: FileCategory | null;
  readonly uploadedById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DashboardGroupCount {
  readonly groupId: number;
  readonly code: string;
  readonly name: string;
  readonly orders: number;
}

export interface DashboardSummary {
  readonly openOrders: number;
  readonly overdueOrders: number;
  readonly myOrders: number;
  readonly pendingInspections: number;
  readonly devicesDue: number;
  readonly byStatus: Readonly<Record<string, number>>;
  readonly recentOrders: readonly ServiceOrder[];
  readonly groupCounts: readonly DashboardGroupCount[];
}

export interface OrderTimeline {
  readonly logs: readonly ServiceOrderLog[];
  readonly shares: readonly ServiceOrderShare[];
}

export interface ListMeta {
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface ServiceList<T> {
  readonly data: readonly T[];
  readonly meta: ListMeta;
}

/** The fields of a user this application reads: an assignee or a colleague to share with. */
export interface DirectoryUser {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
}

/** What the server reports about the AI service assistant it registered. */
export interface AssistantStatus {
  readonly employee: {
    readonly username: string;
    readonly nickname: string;
    readonly registered: boolean;
  };
  readonly tools: readonly {
    readonly name: string;
    readonly registered: boolean;
  }[];
  readonly llmServices: readonly string[];
  readonly responderReady: boolean;
  readonly chatSurface: 'not-installed';
}

/** The order list query; `undefined` omits a filter entirely. */
export interface OrderListQuery {
  readonly keyword?: string;
  readonly status?: string;
  readonly priority?: string;
  readonly assigneeId?: string;
  readonly customerId?: number;
  readonly deviceId?: number;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreateOrderInput {
  readonly title: string;
  readonly deviceId: number;
  readonly customerId?: number;
  readonly orderNo?: string;
  readonly description?: string | null;
  readonly priority?: OrderPriority;
  readonly dueAt?: string;
  readonly assigneeId?: string;
  readonly groupId?: number;
  readonly confidential?: boolean;
  readonly observerVisible?: boolean;
}

// --- Integration account API keys -------------------------------------------

/**
 * One API key of the external platform's machine account.
 *
 * The secret is never part of this shape: it is returned only once, when the
 * key is created.
 */
export interface IntegrationKey {
  readonly id: string;
  readonly name: string | null;
  readonly enabled: boolean;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly lastRequest: string | null;
}

export interface CreatedIntegrationKey {
  readonly key: IntegrationKey;
  /** The one-time secret; the server stores only its hash. */
  readonly secret: string;
}
