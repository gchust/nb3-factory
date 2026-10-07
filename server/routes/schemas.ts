/**
 * Request and response shapes for the service API.
 *
 * `server/service/views.ts` states what the service returns; each `*ViewSchema`
 * here is checked against that interface at compile time, so the OpenAPI document
 * and the actual body cannot drift apart without a type error.
 */

import { z } from 'zod';

import type {
  AttachmentView,
  AssistantStatusView,
  CustomerView,
  DeviceView,
  ExternalTicketAcceptedView,
  ExternalTicketView,
  InspectionTaskView,
  ManualView,
  OverviewView,
  OverdueReminderView,
  RepairNoteView,
  ScheduledRunView,
  ServiceGroupView,
  ShareTargetView,
  TaskDefinitionView,
  TaskListView,
  TaskRunResultView,
  WorkOrderDetailView,
  WorkOrderExecutionView,
  WorkOrderShareView,
  WorkOrderView,
} from '../service/views.js';

/** Fails to compile when the schema does not describe `View`. */
type Describes<Schema extends z.ZodType, View> =
  z.infer<Schema> extends View ? true : never;
const describes = <Schema extends z.ZodType, View>(
  _schema: Schema,
  _view?: View,
): Describes<Schema, View> => true as Describes<Schema, View>;

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export const IdParam = z.object({ id: z.string().min(1) });

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const ListQuery = PageQuery.extend({
  search: z.string().trim().min(1).optional(),
});

export const WorkOrderListQuery = ListQuery.extend({
  status: z
    .enum([
      'pending_acceptance',
      'pending_processing',
      'processing',
      'pending_confirmation',
      'closed',
    ])
    .optional(),
  assigneeId: z.string().min(1).optional(),
  groupId: z.string().min(1).optional(),
});

export const PageMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

/**
 * A work-order path segment naming the lifecycle action to perform.
 *
 * The names are the state machine's own, which is also the vocabulary
 * `allowedActions` on a work-order detail view hands back: a client posts one of
 * those strings here unchanged. The permission it requires is a separate naming
 * (`start` needs `process`, `reject` needs `confirm`) that the route resolves.
 */
export const WorkOrderActionParam = IdParam.extend({
  action: z.enum([
    'accept',
    'start',
    'submit',
    'confirm',
    'reject',
    'close',
    'reopen',
  ]),
});

/** The key of one scheduled task, as `constants.ts` registers it. */
export const TaskKeyParam = z.object({ key: z.string().trim().min(1) });

/** The task-run ledger, narrowed to one task when `taskKey` is given. */
export const ScheduledRunQuery = PageQuery.extend({
  taskKey: z.string().trim().min(1).optional(),
});

export const PageMeta = PageMetaSchema;

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export const CustomerViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  address: z.string().nullable(),
  level: z.string(),
  note: z.string().nullable(),
  deviceCount: z.number().int(),
  openOrderCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
describes(CustomerViewSchema, null as unknown as CustomerView);

export const DeviceViewSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  model: z.string().nullable(),
  serialNumber: z.string().nullable(),
  customerId: z.string(),
  customerName: z.string().nullable(),
  serviceEngineerId: z.string().nullable(),
  serviceEngineerName: z.string().nullable(),
  groupId: z.string().nullable(),
  groupName: z.string().nullable(),
  location: z.string().nullable(),
  installDate: z.string().nullable(),
  warrantyUntil: z.string().nullable(),
  nextInspectionDate: z.string().nullable(),
  inspectionCycleDays: z.number().int(),
  enabled: z.boolean(),
  note: z.string().nullable(),
  openOrderCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
describes(DeviceViewSchema, null as unknown as DeviceView);

export const WorkOrderViewSchema = z.object({
  id: z.string(),
  orderNo: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum([
    'pending_acceptance',
    'pending_processing',
    'processing',
    'pending_confirmation',
    'closed',
  ]),
  priority: z.enum(['normal', 'urgent']),
  confidential: z.boolean(),
  source: z.enum(['manual', 'external']),
  externalEventNo: z.string().nullable(),
  faultCategory: z.string().nullable(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  deviceId: z.string().nullable(),
  deviceCode: z.string().nullable(),
  deviceName: z.string().nullable(),
  groupId: z.string().nullable(),
  groupName: z.string().nullable(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  createdById: z.string().nullable(),
  createdByName: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  processingAt: z.string().nullable(),
  submittedAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  closeSummary: z.string().nullable(),
  failureReason: z.string().nullable(),
  reopenCount: z.number().int(),
  overdueSince: z.string().nullable(),
  lastActivityAt: z.string(),
  attachmentCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
describes(WorkOrderViewSchema, null as unknown as WorkOrderView);

export const WorkOrderExecutionViewSchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  action: z.string(),
  fromStatus: z.string().nullable(),
  toStatus: z.string(),
  operatorId: z.string().nullable(),
  operatorName: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  result: z.string(),
  failureReason: z.string().nullable(),
  detail: z.string().nullable(),
  attempt: z.number().int(),
  createdAt: z.string(),
});
describes(
  WorkOrderExecutionViewSchema,
  null as unknown as WorkOrderExecutionView,
);

export const WorkOrderShareViewSchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  sharedWithId: z.string(),
  sharedWithName: z.string().nullable(),
  sharedById: z.string().nullable(),
  sharedByName: z.string().nullable(),
  note: z.string().nullable(),
  expiresAt: z.string().nullable(),
  active: z.boolean(),
  readOnly: z.literal(true),
  createdAt: z.string(),
});
describes(WorkOrderShareViewSchema, null as unknown as WorkOrderShareView);

export const AttachmentViewSchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  fileId: z.string(),
  category: z.enum(['photo', 'report']),
  filename: z.string(),
  ext: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  uploadedById: z.string().nullable(),
  uploadedByName: z.string().nullable(),
  contentUrl: z.string(),
  createdAt: z.string(),
});
describes(AttachmentViewSchema, null as unknown as AttachmentView);

export const RepairNoteViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  deviceModel: z.string().nullable(),
  faultCategory: z.string().nullable(),
  authorId: z.string().nullable(),
  authorName: z.string().nullable(),
  status: z.enum(['draft', 'published']),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
describes(RepairNoteViewSchema, null as unknown as RepairNoteView);

export const ManualViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  modelName: z.string().nullable(),
  version: z.string().nullable(),
  docNo: z.string().nullable(),
  summary: z.string().nullable(),
  fileName: z.string().nullable(),
  status: z.enum(['draft', 'published', 'indexed', 'failed']),
  indexMessage: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
describes(ManualViewSchema, null as unknown as ManualView);

export const InspectionTaskViewSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  deviceCode: z.string().nullable(),
  deviceName: z.string().nullable(),
  customerName: z.string().nullable(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  planDate: z.string(),
  status: z.enum(['pending', 'completed', 'skipped']),
  result: z.string().nullable(),
  remark: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
describes(InspectionTaskViewSchema, null as unknown as InspectionTaskView);

export const WorkOrderDetailViewSchema = z.object({
  order: WorkOrderViewSchema,
  allowedActions: z.array(
    z.enum([
      'accept',
      'start',
      'submit',
      'confirm',
      'reject',
      'close',
      'reopen',
    ]),
  ),
  executions: z.array(WorkOrderExecutionViewSchema),
  shares: z.array(WorkOrderShareViewSchema),
  attachments: z.array(AttachmentViewSchema),
});
describes(WorkOrderDetailViewSchema, null as unknown as WorkOrderDetailView);

export const ExternalTicketViewSchema = z.object({
  orderNo: z.string(),
  externalEventNo: z.string().nullable(),
  status: z.string(),
  priority: z.enum(['normal', 'urgent']),
  accepted: z.boolean(),
  closed: z.boolean(),
  assigneeName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
describes(ExternalTicketViewSchema, null as unknown as ExternalTicketView);

export const ExternalTicketAcceptedViewSchema = z.object({
  workOrderId: z.string(),
  orderNo: z.string(),
  externalEventNo: z.string().nullable(),
  status: z.string(),
  priority: z.enum(['normal', 'urgent']),
  created: z.boolean(),
});
describes(
  ExternalTicketAcceptedViewSchema,
  null as unknown as ExternalTicketAcceptedView,
);

export const AssistantStatusViewSchema = z.object({
  available: z.boolean(),
  reason: z.string().nullable(),
  model: z.object({
    configured: z.boolean(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
  }),
  knowledgeBase: z.object({
    configured: z.boolean(),
    vectorDatabase: z.string().nullable(),
    manifestCount: z.number().int(),
  }),
  manualCount: z.number().int(),
  indexedManualCount: z.number().int(),
});
describes(AssistantStatusViewSchema, null as unknown as AssistantStatusView);

export const OverviewViewSchema = z.object({
  totals: z.object({
    openOrders: z.number().int(),
    pendingAcceptance: z.number().int(),
    pendingConfirmation: z.number().int(),
    overdueOrders: z.number().int(),
    urgentOpenOrders: z.number().int(),
    todayInspections: z.number().int(),
    pendingInspections: z.number().int(),
    devices: z.number().int(),
    customers: z.number().int(),
    publishedNotes: z.number().int(),
  }),
  byStatus: z.array(z.object({ status: z.string(), count: z.number().int() })),
  groupWorkload: z.array(
    z.object({
      groupId: z.string().nullable(),
      groupName: z.string().nullable(),
      openOrders: z.number().int(),
    }),
  ),
  urgentQueue: z.array(WorkOrderViewSchema),
  recentOrders: z.array(WorkOrderViewSchema),
  myTodayInspections: z.array(InspectionTaskViewSchema),
});
describes(OverviewViewSchema, null as unknown as OverviewView);

export const ServiceGroupViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  memberCount: z.number().int(),
});
describes(ServiceGroupViewSchema, null as unknown as ServiceGroupView);

export const ShareTargetViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  disabled: z.boolean(),
});
describes(ShareTargetViewSchema, null as unknown as ShareTargetView);

export const ScheduledRunViewSchema = z.object({
  id: z.string(),
  taskKey: z.string(),
  runDate: z.string(),
  status: z.enum(['running', 'succeeded', 'failed']),
  summary: z.string().nullable(),
  failureReason: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});
describes(ScheduledRunViewSchema, null as unknown as ScheduledRunView);

export const OverdueReminderViewSchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  orderNo: z.string().nullable(),
  orderTitle: z.string().nullable(),
  recipientId: z.string().nullable(),
  recipientName: z.string().nullable(),
  sentDate: z.string(),
  channel: z.string(),
  createdAt: z.string(),
});
describes(OverdueReminderViewSchema, null as unknown as OverdueReminderView);

export const TaskDefinitionViewSchema = z.object({
  key: z.string(),
  titleKey: z.string(),
  descriptionKey: z.string(),
  scheduleKey: z.string(),
  targetType: z.string(),
  cron: z.string(),
  timezone: z.string(),
  lastRun: ScheduledRunViewSchema.nullable(),
});
describes(TaskDefinitionViewSchema, null as unknown as TaskDefinitionView);

export const TaskListViewSchema = z.object({
  tasks: z.array(TaskDefinitionViewSchema),
});
describes(TaskListViewSchema, null as unknown as TaskListView);

export const TaskRunResultViewSchema = z.object({
  key: z.string(),
  runDate: z.string(),
  createdCount: z.number().int(),
  summary: z.object({
    pendingInspections: z.number().int(),
    overdueOrders: z.number().int(),
  }),
});
describes(TaskRunResultViewSchema, null as unknown as TaskRunResultView);

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

export const CreateCustomerInput = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().min(1),
  contactName: z.string().trim().min(1).nullable().optional(),
  contactPhone: z.string().trim().min(1).nullable().optional(),
  contactEmail: z.string().trim().email().nullable().optional(),
  address: z.string().nullable().optional(),
  level: z.enum(['normal', 'vip', 'key']).optional(),
  note: z.string().nullable().optional(),
});

export const UpdateCustomerInput = CreateCustomerInput.partial().omit({
  code: true,
});

export const CreateDeviceInput = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().min(1),
  model: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  customerId: z.string().min(1),
  serviceEngineerId: z.string().nullable().optional(),
  groupId: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  installDate: z.string().datetime().nullable().optional(),
  warrantyUntil: z.string().datetime().nullable().optional(),
  nextInspectionDate: z.string().datetime().nullable().optional(),
  inspectionCycleDays: z.number().int().min(1).max(3650).optional(),
  enabled: z.boolean().optional(),
  note: z.string().nullable().optional(),
});

export const UpdateDeviceInput = CreateDeviceInput.partial().omit({
  code: true,
});

export const CreateWorkOrderInput = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  priority: z.enum(['normal', 'urgent']).optional(),
  confidential: z.boolean().optional(),
  faultCategory: z
    .enum([
      'mechanical',
      'electrical',
      'software',
      'wear',
      'calibration',
      'other',
    ])
    .nullable()
    .optional(),
  customerId: z.string().min(1).nullable().optional(),
  deviceId: z.string().min(1).nullable().optional(),
  groupId: z.string().min(1).nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
});

export const TransitionInput = z.object({
  idempotencyKey: z.string().trim().min(1).max(128).nullable().optional(),
  closeSummary: z.string().trim().min(1).nullable().optional(),
  failureReason: z.string().trim().min(1).nullable().optional(),
  remark: z.string().trim().min(1).nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
});

export const ShareInput = z.object({
  sharedWithId: z.string().min(1),
  note: z.string().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

/**
 * The non-file half of an attachment upload.
 *
 * The `file` field itself is read from the multipart body by the route, because a
 * `File` is not something a JSON schema describes; this validates what a caller
 * chooses about it.
 */
export const AttachmentForm = z.object({
  category: z.enum(['photo', 'report']).default('photo'),
});

export const CreateRepairNoteInput = z.object({
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  deviceModel: z.string().nullable().optional(),
  faultCategory: z
    .enum([
      'mechanical',
      'electrical',
      'software',
      'wear',
      'calibration',
      'other',
    ])
    .nullable()
    .optional(),
});

export const CreateManualInput = z.object({
  title: z.string().trim().min(1),
  modelName: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  docNo: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  fileName: z.string().nullable().optional(),
});

export const CompleteInspectionInput = z.object({
  result: z.enum(['normal', 'abnormal']),
  remark: z.string().nullable().optional(),
});

export const RunTaskInput = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const ExternalTicketInput = z.object({
  externalEventNo: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  priority: z.enum(['normal', 'urgent']).optional(),
  faultCategory: z
    .enum([
      'mechanical',
      'electrical',
      'software',
      'wear',
      'calibration',
      'other',
    ])
    .nullable()
    .optional(),
  deviceCode: z.string().trim().min(1).nullable().optional(),
  customerCode: z.string().trim().min(1).nullable().optional(),
});

export const ExternalTicketParams = z.object({
  externalEventNo: z.string().min(1),
});
