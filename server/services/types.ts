/**
 * Row shapes and domain enums for the after-sales service application.
 *
 * These interfaces describe what the application reads and writes. They are
 * deliberately hand-written rather than imported from the generated Collection
 * snapshot, so a business service never depends on a derived artifact.
 */

/** Order lifecycle. Mirrors the `service_orders.status` column. */
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

export const KNOWLEDGE_STATUSES = ['draft', 'published', 'archived'] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export const MANUAL_STATUSES = [
  'uploaded',
  'processing',
  'ready',
  'failed',
] as const;
export type ManualStatus = (typeof MANUAL_STATUSES)[number];

export const INSPECTION_STATUSES = ['pending', 'completed', 'skipped'] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_RESULTS = ['normal', 'attention', 'fault'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export const FILE_CATEGORIES = ['photo', 'report', 'other'] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export interface ServiceGroupRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerRow {
  id: number;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  address: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceRow {
  id: number;
  code: string;
  name: string;
  model: string | null;
  customerId: number;
  engineerId: string | null;
  groupId: number | null;
  enabled: boolean;
  nextInspectionDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceOrderRow {
  id: number;
  orderNo: string;
  title: string;
  customerId: number;
  deviceId: number;
  description: string | null;
  priority: string;
  dueAt: string | null;
  assigneeId: string | null;
  groupId: number | null;
  confidential: boolean;
  status: string;
  acceptanceNote: string | null;
  resolution: string | null;
  returnReason: string | null;
  acceptedAt: string | null;
  processingAt: string | null;
  submittedAt: string | null;
  closedAt: string | null;
  createdById: string | null;
  source: string;
  externalEventId: string | null;
  observerVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceOrderLogRow {
  id: number;
  orderId: number;
  action: string;
  status: string;
  message: string | null;
  detail: unknown;
  actorId: string | null;
  idempotencyKey: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface ServiceOrderShareRow {
  id: number;
  orderId: number;
  engineerId: string;
  grantedById: string;
  note: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceInspectionRow {
  id: number;
  deviceId: number;
  assigneeId: string | null;
  plannedDate: string;
  status: string;
  result: string | null;
  resultCode: string | null;
  completedAt: string | null;
  source: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepairKnowledgeRow {
  id: number;
  title: string;
  content: string;
  category: string | null;
  status: string;
  authorId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceManualRow {
  id: number;
  title: string;
  fileName: string;
  content: string;
  deviceId: number | null;
  status: string;
  failureReason: string | null;
  aiDocumentId: string | null;
  uploadedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceOrderFileRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  orderId: number | null;
  category: string | null;
  uploadedById: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A caller of the business services: an authenticated user. */
export interface Actor {
  readonly id: string;
}
