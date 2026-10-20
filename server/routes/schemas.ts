import { z } from 'zod';

import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATES,
} from '../tickets/types.js';

export const TicketParams = z.object({
  ticketId: z.string().min(1),
});

export const TicketQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(TICKET_STATES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  q: z.string().trim().max(120).optional(),
});

export const CreateTicketInput = z.strictObject({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(20_000),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  attachmentIds: z.array(z.string().min(1)).max(20).optional(),
});

export const FireTicketInput = z.strictObject({
  transition: z.enum([
    'claim',
    'assign',
    'start',
    'resolve',
    'reopen',
    'close',
    'cancel',
  ]),
  assigneeId: z.string().min(1).optional(),
  resolution: z.string().trim().min(1).max(10_000).optional(),
  closeNote: z.string().trim().max(5_000).optional(),
  cancelReason: z.string().trim().min(1).max(5_000).optional(),
  reason: z.string().trim().max(5_000).optional(),
  expectedVersion: z.number().int().min(0).optional(),
  requestId: z.string().min(1).max(200).optional(),
});

export const CommentInput = z.strictObject({
  body: z.string().trim().min(1).max(10_000),
});

export const AttachmentInput = z.strictObject({
  attachmentIds: z.array(z.string().min(1)).min(1).max(20),
});

export const WorkflowExecutionQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  workflowName: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  q: z.string().trim().max(120).optional(),
});

export const WorkflowParams = z.object({
  workflowName: z.string().min(1),
});

export const WorkflowExecutionParams = z.object({
  recordId: z.string().min(1),
});

const TicketSchema = z.object({
  id: z.string(),
  ticketNo: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  status: z.enum(TICKET_STATES),
  requesterId: z.string(),
  assigneeId: z.string().nullable(),
  resolution: z.string().nullable(),
  closeNote: z.string().nullable(),
  cancelReason: z.string().nullable(),
  statusChangedAt: z.string(),
  lifecycleVersion: z.number(),
  resolvedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TicketResponse = TicketSchema;

export const TicketDetailResponse = TicketSchema.extend({
  comments: z.array(
    z.object({
      id: z.string(),
      ticketId: z.string(),
      authorId: z.string(),
      body: z.string(),
      createdAt: z.string(),
    }),
  ),
  attachments: z.array(
    z.object({
      id: z.string(),
      ticketId: z.string(),
      attachmentId: z.string(),
      createdAt: z.string(),
    }),
  ),
  files: z.array(
    z.object({
      id: z.string(),
      filename: z.string(),
      ext: z.string(),
      mimeType: z.string(),
      size: z.union([z.string(), z.number()]),
      createdAt: z.string(),
      updatedAt: z.string(),
      contentUrl: z.string().optional(),
    }),
  ),
  lifecycle: z.any(),
});

export const AccessResponse = z.object({
  actions: z.record(z.string(), z.boolean()),
});

export const EngineerResponse = z.object({
  id: z.string(),
  name: z.string(),
});

export const TicketDashboardResponse = z.object({
  summary: z.object({
    total: z.number(),
    active: z.number(),
    pending: z.number(),
    processing: z.number(),
    escalated: z.number(),
    resolved: z.number(),
    closed: z.number(),
    cancelled: z.number(),
    unassigned: z.number(),
    overdue: z.number(),
  }),
  unassigned: z.array(TicketResponse),
  overdue: z.array(TicketResponse),
  workload: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      active: z.number(),
      escalated: z.number(),
    }),
  ),
});

export const HistoryResponse = z.object({
  transitions: z.array(z.any()),
  effectRuns: z.array(z.any()),
  available: z.array(z.any()),
  version: z.number().nullable(),
  state: z.string(),
});

export const WorkflowDefinitionResponse = z.object({
  name: z.string(),
  title: z.string(),
  collection: z.string(),
  stateField: z.string(),
  initial: z.string(),
  states: z.array(z.string()),
  description: z.any(),
  transitions: z.array(z.any()),
  triggers: z.array(z.any()),
  parameters: z.record(z.string(), z.any()),
  diagram: z.string(),
  executionCount: z.number(),
});

export const WorkflowExecutionResponse = z.object({
  recordId: z.string(),
  ticketNo: z.string(),
  title: z.string(),
  state: z.string(),
  version: z.number().nullable(),
  statusChangedAt: z.string(),
  assigneeId: z.string().nullable(),
  requesterId: z.string(),
  transitionCount: z.number(),
});

export const WorkflowExecutionDetailResponse = WorkflowExecutionResponse.extend(
  {
    history: HistoryResponse,
    available: z.array(z.any()),
    description: z.object({
      description: z.any(),
      parameters: z.record(z.string(), z.any()),
      diagram: z.string(),
    }),
  },
);

export const LifecycleDescriptionResponse = z.object({
  description: z.any(),
  parameters: z.record(z.string(), z.any()),
  diagram: z.string(),
});
