import { z } from 'zod';

import {
  FILE_CATEGORIES,
  INSPECTION_RESULTS,
  INSPECTION_STATUSES,
  KNOWLEDGE_STATUSES,
  MANUAL_STATUSES,
  ORDER_PRIORITIES,
  ORDER_SOURCES,
  ORDER_STATUSES,
} from '../services/types.js';

/**
 * The request validators and response schemas of the service API.
 *
 * One value serves both jobs: `apiValidator()` parses a request with it, and
 * `dataResponse()` documents the answer with it, so the document can never drift
 * from what the route actually validates.
 */

const id = z.number().int().positive();
const refId = z.string().min(1).max(64);
const isoDateTime = z.string().min(1).max(64).meta({ format: 'date-time' });
const nullableText = z.string().nullable();

export const idParam = z.object({ id: z.coerce.number().int().positive() });
export const orderParam = z.object({
  orderId: z.coerce.number().int().positive(),
});
export const shareParam = z.object({
  orderId: z.coerce.number().int().positive(),
  shareId: z.coerce.number().int().positive(),
});
export const uploadParam = z.object({
  orderId: z.coerce.number().int().positive(),
  fileId: z.uuid(),
});

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(10000).optional(),
  keyword: z.string().trim().min(1).max(200).optional(),
});

// --- Request bodies ---------------------------------------------------------

export const createOrderInput = z.object({
  title: z.string().trim().min(1).max(200),
  deviceId: id,
  customerId: id.optional(),
  orderNo: z.string().trim().min(1).max(64).optional(),
  description: nullableText.optional(),
  priority: z.enum(ORDER_PRIORITIES).optional(),
  dueAt: isoDateTime.optional(),
  assigneeId: refId.optional(),
  groupId: id.optional(),
  confidential: z.boolean().optional(),
  observerVisible: z.boolean().optional(),
});

export const acceptOrderInput = z.object({
  acceptanceNote: nullableText.optional(),
});
export const submitOrderInput = z.object({
  resolution: z.string().trim().min(1).max(2000),
});
export const returnOrderInput = z.object({
  returnReason: z.string().trim().min(1).max(2000),
});
export const assignOrderInput = z.object({
  assigneeId: refId.nullable().optional(),
  groupId: id.nullable().optional(),
  dueAt: isoDateTime.nullable().optional(),
  priority: z.enum(ORDER_PRIORITIES).optional(),
  observerVisible: z.boolean().optional(),
});
export const grantShareInput = z.object({
  engineerId: refId,
  note: nullableText.optional(),
  expiresAt: isoDateTime.optional(),
});
export const attachFileInput = z.object({
  fileId: z.uuid(),
  category: z.enum(FILE_CATEGORIES).optional(),
});

export const customerInput = z.object({
  name: z.string().trim().min(1).max(200),
  contactName: nullableText.optional(),
  contactPhone: nullableText.optional(),
  address: nullableText.optional(),
  remark: nullableText.optional(),
});

export const deviceInput = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  model: nullableText.optional(),
  customerId: id,
  engineerId: refId.nullable().optional(),
  groupId: id.nullable().optional(),
  nextInspectionDate: isoDateTime.nullable().optional(),
});

export const knowledgeInput = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(200_000),
  category: nullableText.optional(),
  status: z.enum(['draft', 'published']).optional(),
});

export const manualInput = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(500_000),
  deviceId: id.nullable().optional(),
});

export const inspectionInput = z.object({
  deviceId: id,
  plannedDate: isoDateTime,
  assigneeId: refId.nullable().optional(),
});

export const completeInspectionInput = z.object({
  result: z.enum(INSPECTION_RESULTS),
  resultCode: z.string().trim().min(1).max(64),
  nextDate: isoDateTime.nullable().optional(),
});

export const deviceEventInput = z.object({
  externalEventId: z.string().trim().min(1).max(128),
  deviceCode: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  description: nullableText.optional(),
  priority: z.enum(ORDER_PRIORITIES).optional(),
  occurredAt: isoDateTime.optional(),
  dueAt: isoDateTime.nullable().optional(),
});

export const eventParam = z.object({
  externalEventId: z.string().trim().min(1).max(128),
});

// --- Response schemas -------------------------------------------------------

export const serviceGroupSchema = z.object({
  id,
  code: z.string(),
  name: z.string(),
  description: nullableText,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const customerSchema = z.object({
  id,
  name: z.string(),
  contactName: nullableText,
  contactPhone: nullableText,
  address: nullableText,
  remark: nullableText,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const deviceSchema = z.object({
  id,
  code: z.string(),
  name: z.string(),
  model: nullableText,
  customerId: id,
  engineerId: refId.nullable(),
  groupId: id.nullable(),
  enabled: z.boolean(),
  nextInspectionDate: isoDateTime.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const serviceOrderSchema = z.object({
  id,
  orderNo: z.string(),
  title: z.string(),
  customerId: id.nullable(),
  deviceId: id.nullable(),
  description: nullableText,
  status: z.enum(ORDER_STATUSES),
  priority: z.enum(ORDER_PRIORITIES),
  dueAt: isoDateTime.nullable(),
  assigneeId: refId.nullable(),
  groupId: id.nullable(),
  confidential: z.boolean(),
  observerVisible: z.boolean(),
  source: z.enum(ORDER_SOURCES),
  externalEventId: z.string().nullable(),
  acceptanceNote: nullableText,
  resolution: nullableText,
  returnReason: nullableText,
  acceptedAt: isoDateTime.nullable(),
  processingAt: isoDateTime.nullable(),
  submittedAt: isoDateTime.nullable(),
  closedAt: isoDateTime.nullable(),
  createdById: refId.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const serviceOrderLogSchema = z.object({
  id,
  orderId: id,
  action: z.string(),
  status: z.string(),
  message: z.string(),
  detail: z.unknown().nullable(),
  actorId: refId.nullable(),
  idempotencyKey: z.string().nullable(),
  startedAt: isoDateTime.nullable(),
  finishedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});

export const serviceOrderShareSchema = z.object({
  id,
  orderId: id,
  engineerId: refId,
  grantedById: refId.nullable(),
  note: nullableText,
  expiresAt: isoDateTime.nullable(),
  revokedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const serviceInspectionSchema = z.object({
  id,
  deviceId: id,
  assigneeId: refId.nullable(),
  plannedDate: isoDateTime,
  status: z.enum(INSPECTION_STATUSES),
  result: z.enum(INSPECTION_RESULTS).nullable(),
  resultCode: z.string().nullable(),
  completedAt: isoDateTime.nullable(),
  source: z.string(),
  idempotencyKey: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const repairKnowledgeSchema = z.object({
  id,
  title: z.string(),
  content: z.string(),
  category: nullableText,
  status: z.enum(KNOWLEDGE_STATUSES),
  authorId: refId.nullable(),
  publishedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const deviceManualSchema = z.object({
  id,
  title: z.string(),
  fileName: z.string(),
  content: z.string(),
  deviceId: id.nullable(),
  status: z.enum(MANUAL_STATUSES),
  failureReason: nullableText,
  aiDocumentId: z.string().nullable(),
  uploadedById: refId.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const serviceOrderFileSchema = z.object({
  id: z.uuid(),
  orderId: id.nullable(),
  disk: z.string(),
  key: z.string(),
  filename: z.string(),
  ext: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  category: z.enum(FILE_CATEGORIES).nullable(),
  uploadedById: refId.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const dashboardSummarySchema = z.object({
  openOrders: z.number().int(),
  overdueOrders: z.number().int(),
  myOrders: z.number().int(),
  pendingInspections: z.number().int(),
  devicesDue: z.number().int(),
  byStatus: z.record(z.string(), z.number().int()),
  recentOrders: z.array(serviceOrderSchema),
  groupCounts: z.array(
    z.object({
      groupId: z.number().int(),
      code: z.string(),
      name: z.string(),
      orders: z.number().int(),
    }),
  ),
});

export const orderTimelineSchema = z.object({
  logs: z.array(serviceOrderLogSchema),
  shares: z.array(serviceOrderShareSchema),
});

export const deviceEventResultSchema = z.object({
  order: serviceOrderSchema,
  created: z.boolean(),
  externalEventId: z.string(),
});

export const removalResultSchema = z.object({ removed: z.boolean() });

export const integrationKeyParam = z.object({
  keyId: z.string().min(1).max(128),
});

export const integrationKeySchema = z.object({
  id: z.string(),
  name: nullableText,
  enabled: z.boolean(),
  expiresAt: isoDateTime.nullable(),
  createdAt: z.string(),
  lastRequest: isoDateTime.nullable(),
});

export const createIntegrationKeyInput = z.object({
  name: z.string().trim().min(1).max(100),
  expiresInDays: z.number().int().positive().max(3650).nullable().optional(),
});

export const createdIntegrationKeySchema = z.object({
  key: integrationKeySchema,
  secret: z.string(),
});

export const listMetaSchema = z.object({
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const manualIndexResultSchema = z.object({
  status: z.enum(['ready', 'pending', 'failed']),
  detail: z.string(),
});

export const assistantStatusSchema = z.object({
  employee: z.object({
    username: z.string(),
    nickname: z.string(),
    registered: z.boolean(),
  }),
  tools: z.array(
    z.object({
      name: z.string(),
      registered: z.boolean(),
    }),
  ),
  llmServices: z.array(z.string()),
  responderReady: z.boolean(),
  chatSurface: z.literal('not-installed'),
});
