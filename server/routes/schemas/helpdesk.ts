import { z } from 'zod';

export const TicketStatus = z.enum([
  'open',
  'processing',
  'resolved',
  'closed',
]);
export const TicketPriority = z.enum(['low', 'medium', 'high', 'urgent']);
export const TicketCategory = z.enum([
  'hardware',
  'software',
  'network',
  'access',
  'other',
]);
export const TicketTransition = z.enum([
  'assign',
  'reassign',
  'progress',
  'resolve',
  'confirm',
  'return',
]);

export const TicketSchema = z.looseObject({
  id: z.string(),
  ticketNo: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  priority: z.string(),
  status: TicketStatus,
  statusChangedAt: z.iso.datetime(),
  lifecycleVersion: z.number(),
  reporterId: z.string(),
  reporterName: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
  resolution: z.string().nullable().optional(),
  resolvedAt: z.iso.datetime().nullable().optional(),
  closedAt: z.iso.datetime().nullable().optional(),
  lastReminderAt: z.iso.datetime().nullable().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const CommentSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  authorId: z.string().nullable(),
  authorName: z.string().nullable().optional(),
  kind: z.enum(['system', 'comment']),
  body: z.string(),
  createdAt: z.iso.datetime(),
});

export const FileSchema = z.object({
  id: z.string(),
  disk: z.string(),
  key: z.string(),
  filename: z.string(),
  ext: z.string(),
  mimeType: z.string(),
  size: z.union([z.string(), z.number()]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const AttachmentSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  fileId: z.string(),
  uploadedById: z.string(),
  createdAt: z.iso.datetime(),
  file: FileSchema,
});

export const BlockerSchema = z.object({
  source: z.enum(['state', 'guard', 'manual']),
  kind: z.enum(['permission', 'precondition']),
  code: z.string(),
  message: z.string(),
});

export const AvailableTransitionSchema = z.object({
  name: z.string(),
  title: z.string(),
  to: z.array(z.string()),
  allowed: z.boolean(),
  blockers: z.array(BlockerSchema),
});

export const TransitionEntrySchema = z.object({
  id: z.number(),
  lifecycle: z.string(),
  recordId: z.string(),
  transition: z.string(),
  from: z.string().nullable(),
  to: z.string(),
  actorId: z.string(),
  input: z.record(z.string(), z.unknown()),
  at: z.iso.datetime(),
  version: z.number(),
  requestId: z.string().nullable().optional(),
});

export const EffectRunSchema = z.object({
  id: z.number(),
  transitionId: z.number(),
  lifecycle: z.string(),
  recordId: z.string(),
  effect: z.string(),
  status: z.string(),
  attempts: z.number(),
  maxAttempts: z.number(),
  result: z.unknown().nullable().optional(),
  error: z.string().nullable().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const TicketViewSchema = z.object({
  state: z.string(),
  version: z.number().nullable(),
  available: z.array(AvailableTransitionSchema),
  history: z.object({
    transitions: z.array(TransitionEntrySchema),
    effectRuns: z.array(EffectRunSchema),
  }),
});

export const TicketDetailSchema = z.object({
  ticket: TicketSchema,
  lifecycle: TicketViewSchema,
  permissions: z.record(z.string(), z.boolean()),
  comments: z.array(CommentSchema),
  attachments: z.array(AttachmentSchema),
});

export const ListTicketsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: TicketStatus.optional(),
  priority: TicketPriority.optional(),
  category: TicketCategory.optional(),
  search: z.string().trim().max(200).optional(),
  overdue: z.literal('true').optional(),
});

export const TicketParams = z.object({ ticketId: z.string().min(1) });

export const CreateTicketInput = z.strictObject({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(20000),
  category: TicketCategory,
  priority: TicketPriority,
});

export const FireTicketInput = z.strictObject({
  transition: TicketTransition,
  input: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string().min(1).max(255).optional(),
  expectVersion: z.number().int().min(1).optional(),
});

export const CommentInput = z.strictObject({
  body: z.string().trim().min(1).max(20000),
});

export const AttachmentParams = z.object({
  ticketId: z.string().min(1),
  attachmentId: z.string().min(1),
});

export const EngineerWorkloadSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  processing: z.number(),
  resolved: z.number(),
  closed: z.number(),
  total: z.number(),
});

export const DashboardSchema = z.object({
  totals: z.object({
    all: z.number(),
    open: z.number(),
    processing: z.number(),
    resolved: z.number(),
    closed: z.number(),
    overdue: z.number(),
  }),
  byPriority: z.object({
    low: z.number(),
    medium: z.number(),
    high: z.number(),
    urgent: z.number(),
  }),
  byCategory: z.object({
    hardware: z.number(),
    software: z.number(),
    network: z.number(),
    access: z.number(),
    other: z.number(),
  }),
  recent: z.array(TicketSchema),
  workload: z.array(EngineerWorkloadSchema),
  reminderHours: z.number(),
});

export const HelpdeskSettingsSchema = z.object({
  reminderHours: z.number(),
  updatedAt: z.iso.datetime().nullable(),
});

export const UpdateSettingsInput = z.strictObject({
  reminderHours: z.number().int().min(1).max(720),
});

export const WorkflowDefinitionSchema = z.object({
  name: z.string(),
  initial: z.string(),
  states: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      final: z.boolean(),
    }),
  ),
  transitions: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      from: z.array(z.string()),
      to: z.array(z.string()),
      manual: z.boolean(),
      accept: z.array(z.string()),
      effects: z.array(z.string()),
    }),
  ),
  triggers: z.array(
    z.object({
      name: z.string(),
      transition: z.string(),
      when: z.array(z.string()),
    }),
  ),
  diagram: z.string(),
});

export const AssigneeSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
});

export const WorkflowExecutionsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  ticketId: z.string().optional(),
  status: z.string().optional(),
});

export const WorkflowExecutionParams = z.object({
  transitionId: z.coerce.number().int().min(1),
});

export const WorkflowExecutionSchema = z.object({
  transition: TransitionEntrySchema,
  effectRuns: z.array(EffectRunSchema),
  ticket: TicketSchema.nullable(),
  history: z.array(TransitionEntrySchema).default([]),
});
