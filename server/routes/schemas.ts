import { z } from 'zod';

import {
  IT_TICKET_STATUSES,
  IT_TICKET_URGENCIES,
} from '../it-ticket-domain.js';
import type { ItTicketService } from '../services/it-ticket-service.js';

export type TicketListView = Awaited<ReturnType<ItTicketService['list']>>;
export type TicketSummaryView = TicketListView['items'][number];
export type TicketDetailView = Awaited<ReturnType<ItTicketService['detail']>>;
export type TicketDashboardView = Awaited<
  ReturnType<ItTicketService['dashboard']>
>;
export type TicketEngineerView = Awaited<
  ReturnType<ItTicketService['engineers']>
>[number];
export type SampleDataView = Awaited<
  ReturnType<ItTicketService['loadSampleData']>
>;

const isoDateTime = z.iso.datetime();
const nullableIsoDateTime = isoDateTime.nullable();

const ticketSummaryShape = {
  id: z.number().int(),
  number: z.string(),
  title: z.string(),
  description: z.string(),
  urgency: z.string(),
  status: z.string(),
  requesterId: z.string(),
  requesterName: z.string(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  statusChangedAt: nullableIsoDateTime,
  assignedAt: nullableIsoDateTime,
  resolvedAt: nullableIsoDateTime,
  closedAt: nullableIsoDateTime,
  returnedAt: nullableIsoDateTime,
  createdAt: nullableIsoDateTime,
  updatedAt: nullableIsoDateTime,
} as const;

export const TicketSummary: z.ZodType<TicketSummaryView> = z
  .object(ticketSummaryShape)
  .meta({ ref: 'ItTicketSummary' });

export const TicketDetail: z.ZodType<TicketDetailView> = z
  .object({
    ...ticketSummaryShape,
    resolution: z.string().nullable(),
    activities: z.array(
      z.object({
        id: z.number().int(),
        type: z.string(),
        content: z.string().nullable(),
        fromStatus: z.string().nullable(),
        toStatus: z.string().nullable(),
        authorId: z.string(),
        authorName: z.string(),
        createdAt: nullableIsoDateTime,
      }),
    ),
    attachments: z.array(
      z.object({
        id: z.string(),
        filename: z.string(),
        ext: z.string(),
        mimeType: z.string(),
        size: z.number(),
        contentUrl: z.string(),
        createdAt: nullableIsoDateTime,
      }),
    ),
    permissions: z.object({
      canAssign: z.boolean(),
      canProgress: z.boolean(),
      canResolve: z.boolean(),
      canClose: z.boolean(),
      canReturn: z.boolean(),
      canComment: z.boolean(),
    }),
  })
  .meta({ ref: 'ItTicket' });

export const TicketListMeta = z
  .object({
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .meta({ ref: 'ItTicketListMeta' });

export const TicketEngineer: z.ZodType<TicketEngineerView> = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  })
  .meta({ ref: 'ItTicketEngineer' });

export const TicketDashboard: z.ZodType<TicketDashboardView> = z
  .object({
    pendingAssignment: z.number().int(),
    inProgress: z.number().int(),
    resolvedAwaiting: z.number().int(),
    overdue: z.number().int(),
    myOpen: z.number().int(),
    canAssign: z.boolean(),
    overdueAfterHours: z.number().int(),
    workload: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        open: z.number().int(),
        overdue: z.number().int(),
      }),
    ),
    recent: z.array(TicketSummary),
    generatedAt: isoDateTime,
  })
  .meta({ ref: 'ItTicketDashboard' });

export const SampleDataResult: z.ZodType<SampleDataView> = z
  .object({
    loaded: z.literal(true),
    overdueReminded: z.number().int(),
  })
  .meta({ ref: 'ItTicketSampleDataResult' });

export const TicketListQuery = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(['open', ...IT_TICKET_STATUSES]).optional(),
  urgency: z.enum(IT_TICKET_URGENCIES).optional(),
  assigneeId: z.string().max(64).optional(),
  sort: z
    .enum(['createdAt', 'updatedAt', 'number', 'title'])
    .default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const TicketParams = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export const CreateTicketInput = z.strictObject({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(20_000),
  urgency: z.enum(IT_TICKET_URGENCIES),
  fileIds: z.array(z.uuid()).max(5).default([]),
});

export const AssignTicketInput = z.strictObject({
  assigneeId: z.string().min(1).max(64),
});

export const ProgressTicketInput = z.strictObject({
  content: z.string().trim().min(1).max(4_000),
});

export const ResolveTicketInput = z.strictObject({
  resolution: z.string().trim().min(1).max(4_000),
});

export const ReturnTicketInput = z.strictObject({
  reason: z.string().trim().min(1).max(4_000),
});

export const CommentTicketInput = z.strictObject({
  content: z.string().trim().min(1).max(4_000),
});
