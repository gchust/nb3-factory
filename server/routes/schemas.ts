import { z } from 'zod';

import type {
  DashboardResult,
  EngineerWorkload,
  ItRoleSummary,
  ItUserView,
  TicketAttachmentView,
  TicketRecordView,
  TicketView,
} from '../providers/it-tickets/index.js';

/**
 * The response and request schemas of the IT ticket API, written once so the handlers, the API document and the
 * tests all read the same shape. Every response schema is typed against what the service returns, so a field the
 * service stops returning fails type checking here instead of disappearing from the document.
 */

export const TICKET_URGENCIES = ['low', 'normal', 'high', 'urgent'] as const;
export const TICKET_STATUSES = [
  'pending',
  'processing',
  'resolved',
  'closed',
] as const;
export const TEAM_ROLES = ['engineer', 'serviceDesk'] as const;

export const TicketParams = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export const TeamMemberParams = z.object({
  userId: z.string().min(1),
});

export const TicketListQuery = z.object({
  scope: z.enum(['all', 'mine', 'assigned']).optional(),
  status: z.enum(['open', ...TICKET_STATUSES]).optional(),
  urgency: z.enum(TICKET_URGENCIES).optional(),
  keyword: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const CreateTicketInput = z.strictObject({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(20000),
  urgency: z.enum(TICKET_URGENCIES),
  attachmentIds: z.array(z.string().min(1)).max(20).optional(),
});

export const AssignTicketInput = z.strictObject({
  assigneeId: z.string().min(1),
});

export const ProcessTicketInput = z.strictObject({
  content: z.string().min(1).max(20000),
});

export const ResolveTicketInput = z.strictObject({
  resolution: z.string().min(1).max(20000),
});

export const ReturnTicketInput = z.strictObject({
  reason: z.string().min(1).max(20000),
});

export const CloseTicketInput = z.strictObject({
  comment: z.string().max(20000).optional(),
});

export const CommentTicketInput = z.strictObject({
  content: z.string().min(1).max(20000),
});

export const UpdateTeamMemberInput = z.strictObject({
  role: z.enum(['engineer', 'serviceDesk', 'none']),
});

export const TicketAttachmentSchema: z.ZodType<TicketAttachmentView> = z
  .object({
    id: z.string(),
    filename: z.string(),
    ext: z.string(),
    mimeType: z.string(),
    size: z.number(),
    contentUrl: z.string(),
  })
  .meta({ ref: 'ItTicketAttachment' });

export const TicketRecordSchema: z.ZodType<TicketRecordView> = z
  .object({
    id: z.number(),
    kind: z.string(),
    authorId: z.string().nullable(),
    authorName: z.string().nullable(),
    content: z.string().nullable(),
    fromStatus: z.string().nullable(),
    toStatus: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ ref: 'ItTicketRecord' });

export const TicketSchema: z.ZodType<TicketView> = z
  .object({
    id: z.number(),
    title: z.string(),
    description: z.string(),
    urgency: z.string(),
    status: z.string(),
    statusChangedAt: z.iso.datetime(),
    reporterId: z.string(),
    reporterName: z.string().nullable(),
    assigneeId: z.string().nullable(),
    assigneeName: z.string().nullable(),
    resolution: z.string().nullable(),
    resolvedAt: z.iso.datetime().nullable(),
    closedAt: z.iso.datetime().nullable(),
    closedById: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    overdue: z.boolean(),
    attachments: z.array(TicketAttachmentSchema),
    records: z.array(TicketRecordSchema).optional(),
  })
  .meta({ ref: 'ItTicket' });

export const ItRoleSchema: z.ZodType<ItRoleSummary> = z
  .object({
    userId: z.string(),
    role: z.enum(TEAM_ROLES).nullable(),
    isRoot: z.boolean(),
    isServiceDesk: z.boolean(),
  })
  .meta({ ref: 'ItRoleSummary' });

export const EngineerWorkloadSchema: z.ZodType<EngineerWorkload> = z
  .object({
    userId: z.string(),
    name: z.string(),
    role: z.enum(TEAM_ROLES).nullable(),
    open: z.number(),
    total: z.number(),
  })
  .meta({ ref: 'ItEngineerWorkload' });

export const DashboardSchema: z.ZodType<DashboardResult> = z
  .object({
    role: ItRoleSchema,
    pending: z.number(),
    processing: z.number(),
    resolved: z.number(),
    closed: z.number(),
    overdue: z.number(),
    mine: z.number(),
    engineers: z.array(EngineerWorkloadSchema),
  })
  .meta({ ref: 'ItDashboard' });

export const ItUserSchema: z.ZodType<ItUserView> = z
  .object({
    userId: z.string(),
    name: z.string(),
    email: z.string(),
    role: z.enum(TEAM_ROLES).nullable(),
  })
  .meta({ ref: 'ItUser' });

export const TicketListMetaSchema = z.object({
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
