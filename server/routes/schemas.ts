import { TICKET_CATEGORIES, TICKET_STATUSES } from '../tickets-resources.js';
import { z } from 'zod';

/** One ticket as every ticket route returns it. */
export const TicketSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  category: z.enum(TICKET_CATEGORIES),
  description: z.string().nullable(),
  status: z.enum(TICKET_STATUSES),
  resolution: z.string().nullable(),
  submitterId: z.string(),
  submitterName: z.string().nullable(),
  handlerId: z.string().nullable(),
  handlerName: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ListTicketsQuerySchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const TicketListMetaSchema = z.object({
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const TicketIdParamSchema = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export const CreateTicketInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  category: z.enum(TICKET_CATEGORIES),
  description: z.string().trim().max(5000).optional(),
});

export const CompleteTicketInputSchema = z.strictObject({
  resolution: z.string().trim().min(1).max(5000),
});
