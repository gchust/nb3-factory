import { z } from 'zod';

/**
 * The request and response schemas of the help-desk endpoints. They are the API document's description of the
 * endpoints in `server/routes/helpdesk.ts` and the input validation those handlers run; they are not the service's
 * own types, which live in `server/helpdesk/service.ts`.
 */

export const ticketStateSchema = z.enum([
  'submitted',
  'assigned',
  'processing',
  'resolved',
  'closed',
]);

export const ticketPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

export const manualTransitionSchema = z.enum([
  'assign',
  'start',
  'resolve',
  'confirm',
  'reopen',
]);

export const ticketSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string().nullable(),
  priority: ticketPrioritySchema,
  status: ticketStateSchema,
  statusChangedAt: z.string(),
  lifecycleVersion: z.number(),
  reporterId: z.string(),
  reporterName: z.string(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  resolution: z.string().nullable(),
  serviceDeskNote: z.string().nullable(),
  reopenReason: z.string().nullable(),
  reopenedCount: z.number(),
  screenshotIds: z.array(z.string()).nullable(),
  resolvedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  lastReminderAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const offeredTransitionSchema = z.object({
  name: z.string(),
  title: z.string(),
  allowed: z.boolean(),
  blockers: z.array(z.object({ code: z.string(), message: z.string() })),
});

export const ticketCommentSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  kind: z.string(),
  body: z.string(),
  createdAt: z.string(),
});

export const ticketAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  ext: z.string(),
  mimeType: z.string(),
  size: z.union([z.string(), z.number()]),
});

export const ticketDetailSchema = z.object({
  ticket: ticketSchema,
  available: z.array(offeredTransitionSchema),
  comments: z.array(ticketCommentSchema),
  attachments: z.array(ticketAttachmentSchema),
});

export const overviewSchema = z.object({
  role: z.enum(['service-desk', 'engineer', 'employee']),
  stats: z.object({
    pending: z.number(),
    overdue: z.number(),
    open: z.number(),
    resolved: z.number(),
    total: z.number(),
  }),
  workload: z.array(
    z.object({ id: z.string(), name: z.string(), count: z.number() }),
  ),
  recent: z.array(ticketSchema),
});

export const engineerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

export const listTicketsQuerySchema = z.object({
  status: ticketStateSchema.optional(),
  q: z.string().min(1).max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const ticketParamsSchema = z.object({
  id: z.string().min(1),
});

export const createTicketBodySchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  category: z.string().max(64).nullable().optional(),
  priority: ticketPrioritySchema,
  screenshotIds: z.array(z.string()).optional(),
});

export const fireTicketBodySchema = z.object({
  transition: manualTransitionSchema,
  input: z.record(z.string(), z.unknown()).optional(),
  version: z.number().int().optional(),
});

export const commentTicketBodySchema = z.object({
  body: z.string().min(1),
  kind: z.enum(['comment', 'processing']).optional(),
});
