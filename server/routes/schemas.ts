import type { ApiSchema } from '@nocobase/app-server/router';
import { z } from 'zod';

/** The input schemas the ticket routes validate with, and the response schemas they document. */

export const TicketStatusSchema = z.enum([
  'pending',
  'processing',
  'resolved',
  'closed',
]);

export const TicketUrgencySchema = z.enum(['low', 'medium', 'high', 'urgent']);

/** `:ticketId` — the numeric id, kept as a string so a bad one is a validation error, not `NaN`. */
export const TicketParams = z.object({
  ticketId: z
    .string()
    .regex(/^[1-9]\d*$/, 'A ticket id is a positive integer.'),
});

export const TicketListQuery = z.object({
  status: TicketStatusSchema.optional(),
  urgency: TicketUrgencySchema.optional(),
  assigneeId: z.string().min(1).max(64).optional(),
  requesterId: z.string().min(1).max(64).optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const CreateTicketInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  urgency: TicketUrgencySchema,
  screenshotIds: z.array(z.string().min(1).max(64)).max(20).optional(),
});

export const AssignTicketInput = z.object({
  assigneeId: z.string().min(1).max(64),
});

export const ProcessTicketInput = z.object({
  content: z.string().min(1).max(5000),
});

export const ResolveTicketInput = z.object({
  resolution: z.string().min(1).max(5000),
});

export const ReturnTicketInput = z.object({
  reason: z.string().min(1).max(5000),
});

export const CommentTicketInput = z.object({
  content: z.string().min(1).max(5000),
});

const nullableText = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} satisfies ApiSchema;
const timestamp = { type: 'string', format: 'date-time' } satisfies ApiSchema;

const screenshot = {
  type: 'object',
  required: ['id', 'filename', 'ext', 'mimeType', 'size'],
  properties: {
    id: { type: 'string', description: 'The file record id.' },
    filename: { type: 'string' },
    ext: { type: 'string', description: 'Lowercase extension without a dot.' },
    mimeType: { type: 'string' },
    size: { type: 'integer', minimum: 0 },
  },
} satisfies ApiSchema;

const ticket = {
  type: 'object',
  required: [
    'id',
    'title',
    'description',
    'urgency',
    'status',
    'requesterId',
    'screenshots',
    'submittedAt',
    'returnCount',
    'overdue',
    'updatedAt',
  ],
  properties: {
    id: { type: 'integer' },
    title: { type: 'string' },
    description: { type: 'string' },
    urgency: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'urgent'],
    },
    status: {
      type: 'string',
      enum: ['pending', 'processing', 'resolved', 'closed'],
    },
    requesterId: { type: 'string' },
    requesterName: nullableText,
    assigneeId: nullableText,
    assigneeName: nullableText,
    resolution: nullableText,
    screenshots: { type: 'array', items: screenshot },
    submittedAt: timestamp,
    assignedAt: { anyOf: [timestamp, { type: 'null' }] },
    resolvedAt: { anyOf: [timestamp, { type: 'null' }] },
    closedAt: { anyOf: [timestamp, { type: 'null' }] },
    lastReturnedAt: { anyOf: [timestamp, { type: 'null' }] },
    returnCount: { type: 'integer', minimum: 0 },
    overdue: { type: 'boolean' },
    updatedAt: timestamp,
  },
} satisfies ApiSchema;

export const TicketViewSchema = {
  ...ticket,
  description: 'One service ticket, as the list and the dashboard return it.',
} satisfies ApiSchema;

const ticketLog = {
  type: 'object',
  required: ['id', 'kind', 'content', 'createdAt'],
  properties: {
    id: { type: 'integer' },
    kind: { type: 'string' },
    content: { type: 'string' },
    authorId: nullableText,
    authorName: nullableText,
    createdAt: timestamp,
  },
} satisfies ApiSchema;

export const TicketDetailSchema = {
  ...ticket,
  description: 'One service ticket with its process log, oldest entry first.',
  required: [...ticket.required, 'logs'],
  properties: {
    ...ticket.properties,
    logs: { type: 'array', items: ticketLog },
  },
} satisfies ApiSchema;

export const TicketListMetaSchema = {
  type: 'object',
  required: ['total'],
  properties: { total: { type: 'integer', minimum: 0 } },
} satisfies ApiSchema;

const workload = {
  type: 'object',
  required: ['engineerId', 'engineerName', 'active', 'resolved'],
  properties: {
    engineerId: { type: 'string' },
    engineerName: { type: 'string' },
    active: { type: 'integer', minimum: 0 },
    resolved: { type: 'integer', minimum: 0 },
  },
} satisfies ApiSchema;

export const DashboardSchema = {
  type: 'object',
  required: ['role', 'pendingAssignment', 'overdue', 'workloads'],
  properties: {
    role: {
      type: 'string',
      enum: ['employee', 'engineer', 'service-desk'],
      description: 'What the caller may do, as the server resolved it.',
    },
    pendingAssignment: { type: 'array', items: TicketViewSchema },
    overdue: { type: 'array', items: TicketViewSchema },
    workloads: { type: 'array', items: workload },
  },
} satisfies ApiSchema;

export const EngineerSchema = {
  type: 'object',
  required: ['id', 'name', 'email'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
  },
} satisfies ApiSchema;
