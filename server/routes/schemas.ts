import { z } from 'zod';

/** One handling-history entry of a ticket. */
export const ticketLogSchema = z.object({
  id: z.number(),
  action: z.string(),
  content: z.string().nullable(),
  authorId: z.string().nullable(),
  authorName: z.string().nullable(),
  createdAt: z.string(),
});

/** A ticket as the helpdesk API returns it. */
export const ticketSchema = z.object({
  id: z.number(),
  ticketNo: z.string(),
  title: z.string(),
  description: z.string(),
  urgency: z.string(),
  status: z.string(),
  reporterId: z.string(),
  reporterName: z.string(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  screenshot: z.string().nullable(),
  solution: z.string().nullable(),
  lastRejectedReason: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  overdue: z.boolean(),
  logs: z.array(ticketLogSchema).optional(),
});

export const engineerSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const viewerSchema = z.object({
  userId: z.string(),
  name: z.string(),
  role: z.enum(['employee', 'engineer', 'serviceDesk', 'admin']),
});

export const statsSchema = z.object({
  total: z.number(),
  pending: z.number(),
  processing: z.number(),
  resolved: z.number(),
  closed: z.number(),
  overdue: z.number(),
  engineerWorkload: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      open: z.number(),
      resolved: z.number(),
    }),
  ),
});

export const listTicketsQuerySchema = z.object({
  status: z.string().optional(),
  urgency: z.string().optional(),
  // Query values arrive as strings; accepting only the two literals avoids the
  // `Boolean("false") === true` trap of `z.coerce.boolean()`.
  overdue: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const ticketIdParamSchema = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export const createTicketBodySchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(20000),
  urgency: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  // A data URL of an image up to 2 MB (base64 expands it to roughly 2.7 MB) has to fit.
  screenshot: z.string().trim().max(4_000_000).optional().nullable(),
});

export const assignTicketBodySchema = z.object({
  assigneeId: z.string().trim().min(1).max(64),
});

export const contentBodySchema = z.object({
  content: z.string().trim().min(1).max(20000),
});

export const resolveTicketBodySchema = z.object({
  solution: z.string().trim().min(1).max(20000),
});
