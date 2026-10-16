/**
 * The request and response shapes of the ticket desk's HTTP API.
 *
 * Every schema is declared once and used both to validate input and to
 * document the endpoint, so a client reads exactly what the server enforces.
 * Response schemas carry a `ref`, which is what turns them into named
 * components in the API document rather than anonymous definitions repeated
 * in every operation.
 */
import { z } from 'zod';

import type {
  TicketAvailableTransition,
  TicketCommentView,
  TicketContext,
  TicketDashboard,
  TicketDetail,
  TicketHistoryEntry,
  TicketListPage,
  TicketStaffMember,
  TicketSummary,
  TicketUserOption,
  TicketWorkload,
} from '../ticket-types.js';

export const TicketStateSchema = z
  .enum(['pending', 'assigned', 'resolved', 'closed'])
  .meta({ ref: 'TicketState' });

export const TicketUrgencySchema = z
  .enum(['low', 'normal', 'high', 'urgent'])
  .meta({ ref: 'TicketUrgency' });

export const TicketStaffRoleSchema = z
  .enum(['serviceDesk', 'engineer'])
  .meta({ ref: 'TicketStaffRole' });

export const TicketCommentKindSchema = z
  .enum(['comment', 'reason', 'solution'])
  .meta({ ref: 'TicketCommentKind' });

export const TicketScopeSchema = z.enum([
  'default',
  'reported',
  'assigned',
  'all',
]);

export const TicketStatusFilterSchema = z.enum([
  'open',
  'pending',
  'assigned',
  'resolved',
  'closed',
]);

export const TicketAttachmentInputSchema = z.strictObject({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  dataBase64: z.string().min(1),
});

const TicketAttachmentSchema = z.object({
  id: z.number().int(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  createdAt: z.string(),
});

const TicketCommentSchema = z
  .object({
    id: z.number().int(),
    kind: TicketCommentKindSchema,
    authorId: z.string(),
    authorName: z.string(),
    body: z.string(),
    createdAt: z.string(),
  })
  .meta({ ref: 'TicketComment' });

const TicketHistorySchema = z.object({
  id: z.string(),
  transition: z.string(),
  from: z.string().nullable(),
  to: z.string(),
  actorId: z.string(),
  at: z.string(),
});

const TicketAvailableTransitionSchema = z.object({
  name: z.string(),
  title: z.string(),
  to: z.array(z.string()),
  allowed: z.boolean(),
  blockers: z.array(z.string()),
});

export const TicketSummarySchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    urgency: TicketUrgencySchema,
    status: TicketStateSchema,
    requesterId: z.string(),
    requesterName: z.string(),
    assigneeId: z.string().nullable(),
    assigneeName: z.string().nullable(),
    resolution: z.string().nullable(),
    lastReason: z.string().nullable(),
    assignedAt: z.string().nullable(),
    resolvedAt: z.string().nullable(),
    closedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    statusChangedAt: z.string(),
    overdue: z.boolean(),
  })
  .meta({ ref: 'TicketSummary' });

export const TicketDetailSchema = TicketSummarySchema.extend({
  version: z.number().int(),
  description: z.string(),
  available: z.array(TicketAvailableTransitionSchema),
  comments: z.array(TicketCommentSchema),
  attachments: z.array(TicketAttachmentSchema),
  history: z.array(TicketHistorySchema),
}).meta({ ref: 'TicketDetail' });

export const TicketContextSchema = z
  .object({
    userId: z.string(),
    name: z.string(),
    role: z.enum(['serviceDesk', 'engineer', 'employee']),
    serviceDesk: z.boolean(),
    engineer: z.boolean(),
    root: z.boolean(),
  })
  .meta({ ref: 'TicketContext' });

export const TicketStaffSchema = z
  .object({
    id: z.number().int(),
    userId: z.string(),
    role: TicketStaffRoleSchema,
    displayName: z.string(),
    userIdLabel: z.string(),
  })
  .meta({ ref: 'TicketStaffMember' });

export const TicketUserOptionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    username: z.string().nullable(),
    email: z.string().nullable(),
  })
  .meta({ ref: 'TicketUserOption' });

export const TicketWorkloadSchema = z
  .object({
    userId: z.string(),
    name: z.string(),
    active: z.number().int(),
    resolved: z.number().int(),
    closed: z.number().int(),
  })
  .meta({ ref: 'TicketWorkload' });

export const TicketDashboardSchema = z
  .object({
    serviceDesk: z.boolean(),
    pending: z.array(TicketSummarySchema),
    pendingCount: z.number().int(),
    overdue: z.array(TicketSummarySchema),
    overdueCount: z.number().int(),
    workload: z.array(TicketWorkloadSchema),
    mine: z.array(TicketSummarySchema),
    assignedToMe: z.array(TicketSummarySchema),
  })
  .meta({ ref: 'TicketDashboard' });

/** The `meta` a paged list answers with. */
export const TicketPageMetaSchema = z.object({
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

/** One page of the ticket list, as the service's `listTickets` answers. */
export const TicketListPageSchema = TicketPageMetaSchema.extend({
  items: z.array(TicketSummarySchema),
}).meta({ ref: 'TicketListPage' });

// ------------------------------------------------------------------ request

export const TicketParams = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export const TicketAttachmentParams = z.object({
  ticketId: z.coerce.number().int().positive(),
  attachmentId: z.coerce.number().int().positive(),
});

export const TicketCommentQuery = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export const TicketUserIdParams = z.object({
  userId: z.string().min(1),
});

const PageSchema = z.coerce.number().int().positive().optional();
const PageSizeSchema = z.coerce.number().int().positive().max(100).optional();

export const TicketListQuerySchema = z.object({
  scope: TicketScopeSchema.optional(),
  status: TicketStatusFilterSchema.optional(),
  urgency: TicketUrgencySchema.optional(),
  assigneeId: z.string().min(1).optional(),
  requesterId: z.string().min(1).optional(),
  q: z.string().optional(),
  page: PageSchema,
  pageSize: PageSizeSchema,
});

export const CreateTicketInputSchema = z.strictObject({
  title: z.string().min(1),
  description: z.string().min(1),
  urgency: TicketUrgencySchema,
  attachments: z.array(TicketAttachmentInputSchema).max(5).optional(),
});

export const FireTicketInputSchema = z.strictObject({
  transition: z.string().min(1),
  input: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string().min(1).optional(),
  version: z.number().int().optional(),
});

export const CommentInputSchema = z.strictObject({
  body: z.string().min(1),
});

export const AttachmentsInputSchema = z.strictObject({
  attachments: z.array(TicketAttachmentInputSchema).min(1).max(5),
});

export const CommentTargetInputSchema = CommentInputSchema.extend({
  ticketId: z.number().int().positive(),
});

export const AttachmentsTargetInputSchema = AttachmentsInputSchema.extend({
  ticketId: z.number().int().positive(),
});

export const StaffInputSchema = z.strictObject({
  userId: z.string().min(1),
  role: TicketStaffRoleSchema,
  displayName: z.string().min(1).optional(),
});

/** Compile-time proof that the response schemas still describe the service's view types. */
export type SchemaChecks = {
  readonly summary: z.ZodType<TicketSummary>;
  readonly detail: z.ZodType<TicketDetail>;
  readonly context: z.ZodType<TicketContext>;
  readonly staff: z.ZodType<TicketStaffMember>;
  readonly user: z.ZodType<TicketUserOption>;
  readonly workload: z.ZodType<TicketWorkload>;
  readonly dashboard: z.ZodType<TicketDashboard>;
  readonly page: z.ZodType<TicketListPage>;
  readonly comment: z.ZodType<TicketCommentView>;
  readonly history: z.ZodType<TicketHistoryEntry>;
  readonly available: z.ZodType<TicketAvailableTransition>;
};

export const ticketResponseSchemas = {
  summary: TicketSummarySchema,
  detail: TicketDetailSchema,
  context: TicketContextSchema,
  staff: TicketStaffSchema,
  user: TicketUserOptionSchema,
  workload: TicketWorkloadSchema,
  dashboard: TicketDashboardSchema,
  page: TicketListPageSchema,
  comment: TicketCommentSchema,
  history: TicketHistorySchema,
  available: TicketAvailableTransitionSchema,
} satisfies SchemaChecks;

export {
  TicketAttachmentSchema,
  TicketCommentSchema,
  TicketHistorySchema,
  TicketAvailableTransitionSchema,
};
