import { z } from 'zod';

import {
  IT_TICKET_CATEGORIES,
  IT_TICKET_STATUSES,
} from '../it-tickets/ticket.js';

const dateTime = () =>
  z.string().meta({ format: 'date-time' }).nullable().meta({
    description:
      'An RFC 3339 timestamp, or `null` while the step has not happened yet.',
  });

/** One ticket as the API returns it. Describes the response; it validates nothing. */
export const ItTicketSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(IT_TICKET_CATEGORIES),
  description: z.string().nullable(),
  status: z.enum(IT_TICKET_STATUSES),
  resolutionNote: z.string().nullable(),
  submitterId: z.string(),
  submitterName: z.string(),
  handlerId: z.string().nullable(),
  handlerName: z.string().nullable(),
  startedAt: dateTime(),
  completedAt: dateTime(),
  createdAt: z.string().meta({ format: 'date-time' }),
  updatedAt: z.string().meta({ format: 'date-time' }),
});

export const ItTicketParams = z.object({
  ticketId: z.string().min(1),
});

export const ListItTicketsQuery = z.object({
  status: z.enum(IT_TICKET_STATUSES).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const CreateItTicketInput = z.strictObject({
  title: z.string().trim().min(1),
  category: z.enum(IT_TICKET_CATEGORIES),
  description: z.string().trim().max(2000).optional(),
});

export const CompleteItTicketInput = z.strictObject({
  resolutionNote: z.string().trim().min(1).max(2000),
});

export const ItTicketPageMeta = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
