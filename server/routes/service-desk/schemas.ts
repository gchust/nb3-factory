import { z } from 'zod';

import {
  TICKET_STATUSES,
  TICKET_URGENCIES,
} from '../../service-desk/domain.js';

/**
 * The request and response schemas for the service desk's HTTP API.
 *
 * Input schemas describe exactly what a caller may send and are attached to a
 * route with `apiValidator()`. Response schemas are written against what the
 * workflow service returns, so the API document cannot drift from the real
 * payload.
 */

const id = z.string().min(1).max(64);
const isoDate = z.string().meta({
  description: 'An RFC 3339 timestamp, such as `2026-10-04T08:00:00.000Z`.',
});

export const TicketStatus = z.enum(TICKET_STATUSES);
export const TicketUrgency = z.enum(TICKET_URGENCIES);

// ------------------------------------------------------------------ inputs

export const TicketListQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: TicketStatus.optional(),
  urgency: TicketUrgency.optional(),
  keyword: z.string().trim().min(1).max(200).optional(),
  assigneeId: id.optional(),
  requesterId: id.optional(),
});

export const TicketParams = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export const CreateTicketBody = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .meta({ description: 'A one-line summary of the problem.' }),
  description: z
    .string()
    .trim()
    .min(1)
    .max(20000)
    .meta({ description: 'What went wrong, in the reporter’s words.' }),
  urgency: TicketUrgency,
  attachmentIds: z.array(z.string().min(1)).max(20).optional().meta({
    description: 'Ids of files uploaded through `/ticketAttachments`.',
  }),
});

export const AssignTicketBody = z.strictObject({
  assigneeId: id.meta({ description: 'The engineer who now owns the ticket.' }),
  note: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .optional()
    .meta({ description: 'Optional instructions for the engineer.' }),
});

export const ResolveTicketBody = z.strictObject({
  resolution: z
    .string()
    .trim()
    .min(1)
    .max(20000)
    .meta({ description: 'How the problem was fixed.' }),
  note: z.string().trim().min(1).max(5000).optional(),
});

export const ReturnTicketBody = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .meta({ description: 'Why the resolution is not accepted.' }),
});

export const CommentBody = z.strictObject({
  content: z.string().trim().min(1).max(5000),
});

// ----------------------------------------------------------------- outputs

export const Ticket = z
  .object({
    id: z.number().int(),
    title: z.string(),
    description: z.string(),
    urgency: z.string(),
    status: z.string(),
    requesterId: z.string(),
    requesterName: z.string(),
    assigneeId: z.string().nullable(),
    assigneeName: z.string().nullable(),
    resolution: z.string().nullable(),
    attachmentIds: z.array(z.string()).nullable(),
    statusChangedAt: isoDate,
    lifecycleVersion: z.number().int(),
    overdueNotifiedAt: isoDate.nullable(),
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .meta({ ref: 'ServiceDeskTicket' });

export const TicketNote = z
  .object({
    id: z.number().int(),
    ticketId: z.number().int(),
    authorId: z.string(),
    authorName: z.string(),
    content: z.string(),
    createdAt: isoDate,
  })
  .meta({ ref: 'ServiceDeskTicketNote' });

export const TicketTransition = z
  .object({
    id: z.number().int(),
    ticketId: z.number().int(),
    action: z.string(),
    fromStatus: z.string(),
    toStatus: z.string(),
    actorId: z.string(),
    actorName: z.string(),
    payload: z.record(z.string(), z.unknown()).nullable(),
    createdAt: isoDate,
  })
  .meta({ ref: 'ServiceDeskTicketTransition' });

export const TicketDetail = z
  .object({
    ticket: Ticket,
    notes: z.array(TicketNote),
    transitions: z.array(TicketTransition),
  })
  .meta({ ref: 'ServiceDeskTicketDetail' });

export const Engineer = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  })
  .meta({ ref: 'ServiceDeskEngineer' });

export const EngineerWorkload = z
  .object({
    assigneeId: z.string(),
    assigneeName: z.string(),
    openCount: z.number().int(),
  })
  .meta({ ref: 'ServiceDeskEngineerWorkload' });

export const Dashboard = z
  .object({
    pendingAssignment: z.number().int(),
    processing: z.number().int(),
    resolved: z.number().int(),
    overdue: z.number().int(),
    pendingTickets: z.array(Ticket),
    overdueTickets: z.array(Ticket),
    workload: z.array(EngineerWorkload),
  })
  .meta({ ref: 'ServiceDeskDashboard' });
