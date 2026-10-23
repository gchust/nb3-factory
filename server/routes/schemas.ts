import { z } from 'zod';

import type { TicketCommentRecord } from '../tickets/resources.js';
import type {
  TicketRecord,
  TicketUrgency,
} from '../lifecycles/ticket-types.js';

/** The urgency levels a reporter may choose. Stored as a string column, so the list is the API's contract. */
export const TicketUrgencySchema = z.enum(['low', 'normal', 'high', 'urgent']);

export const TICKET_STATUSES = [
  'submitted',
  'assigned',
  'inProgress',
  'resolved',
  'closed',
] as const;

export const TicketStatusSchema = z.enum(TICKET_STATUSES);

/**
 * One ticket as every ticket endpoint returns it.
 *
 * The nullable fields are `.nullable()` rather than `.optional()` because a column that has no value reads back as
 * `null`, and a client that has to handle both spellings of "nothing" always gets it wrong somewhere.
 */
export const Ticket: z.ZodType<TicketRecord> = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    category: z.string().nullable(),
    urgency: TicketUrgencySchema,
    status: TicketStatusSchema,
    statusChangedAt: z.iso.datetime(),
    lifecycleVersion: z.number().int(),
    reporterId: z.string(),
    reporterName: z.string(),
    assigneeId: z.string().nullable(),
    assigneeName: z.string().nullable(),
    resolution: z.string().nullable(),
    resolvedAt: z.iso.datetime().nullable(),
    closedAt: z.iso.datetime().nullable(),
    reopenCount: z.number().int(),
    lastReopenedAt: z.iso.datetime().nullable(),
    overdueNotifiedAt: z.iso.datetime().nullable(),
    attachmentId: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ ref: 'Ticket' });

export const TicketComment: z.ZodType<TicketCommentRecord> = z
  .object({
    id: z.string(),
    ticketId: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    kind: z.enum(['comment', 'resolution', 'system']),
    body: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ ref: 'TicketComment' });

/** One transition the lifecycle log recorded, as the management page's execution table shows it. */
export const TicketTransition = z
  .object({
    id: z.string(),
    lifecycle: z.string(),
    recordId: z.string(),
    transition: z.string(),
    /** Null on the entry the record's creation wrote. */
    from: z.string().nullable(),
    to: z.string(),
    actorId: z.string(),
    input: z.record(z.string(), z.unknown()),
    at: z.iso.datetime(),
    version: z.number().int(),
    requestId: z.string().nullable(),
  })
  .meta({ ref: 'TicketTransition' });

/** One effect run, so a delivery that failed can be seen rather than guessed at. */
export const TicketEffectRun = z
  .object({
    id: z.string(),
    transitionId: z.string(),
    effect: z.string(),
    stayBound: z.boolean(),
    status: z.string(),
    attempts: z.number().int(),
    maxAttempts: z.number().int(),
    error: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ ref: 'TicketEffectRun' });

export const TicketHistory = z
  .object({
    transitions: z.array(TicketTransition),
    effectRuns: z.array(TicketEffectRun),
  })
  .meta({ ref: 'TicketHistory' });

/** A transition the current caller may fire, with the blockers that keep the others unavailable. */
export const AvailableTicketTransition = z
  .object({
    name: z.string(),
    title: z.string(),
    to: z.string(),
    allowed: z.boolean(),
    blockers: z.array(
      z.object({
        source: z.enum(['state', 'guard', 'manual']),
        kind: z.enum(['permission', 'precondition']),
        code: z.string(),
        message: z.string(),
      }),
    ),
  })
  .meta({ ref: 'AvailableTicketTransition' });

/** A ticket with everything its detail page shows: actions, history and the discussion. */
export const TicketDetail = z
  .object({
    ticket: Ticket,
    /** Null while the ticket has no recorded transition, which only happens before its creation commits. */
    version: z.number().int().nullable(),
    available: z.array(AvailableTicketTransition),
    history: TicketHistory,
    comments: z.array(TicketComment),
  })
  .meta({ ref: 'TicketDetail' });

export const TicketPageMeta = z
  .object({
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .meta({ ref: 'TicketPageMeta' });

export const ListTicketsQuery = z.object({
  status: TicketStatusSchema.optional(),
  urgency: TicketUrgencySchema.optional(),
  assigneeId: z.string().optional(),
  overdue: z.enum(['1', 'true']).optional().meta({
    description:
      'Only the tickets that have stayed unresolved past the configured window.',
  }),
  q: z.string().optional().meta({
    description: 'Keyword matched against the title and description.',
  }),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const TicketParams = z.object({ ticketId: z.string().min(1) });

export const TicketTransitionParams = z.object({
  ticketId: z.string().min(1),
  transition: z.enum([
    'assign',
    'reassign',
    'start',
    'resolve',
    'confirm',
    'returnForRework',
    'reopen',
  ]),
});

/**
 * The body a transition accepts.
 *
 * Every transition accepts the idempotency key and the version the caller saw, so a double submission is answered
 * with the entry already recorded and a stale screen is refused with `409 ABORTED`. The business fields are optional
 * here because each transition reads only its own; the lifecycle's own validators refuse a transition that needs one
 * and did not get it, naming the field.
 */
export const FireTicketTransitionInput = z.strictObject({
  assigneeId: z.string().min(1).optional().meta({
    description: 'The engineer to hand the ticket to. `assign` and `reassign`.',
  }),
  assigneeName: z.string().min(1).optional().meta({
    description:
      "The engineer's display name, stored beside the id. `assign` and `reassign`.",
  }),
  resolution: z
    .string()
    .min(1)
    .optional()
    .meta({ description: 'What was done to fix the issue. `resolve`.' }),
  reason: z.string().min(1).optional().meta({
    description:
      'What is still wrong, or why the fix did not hold. `returnForRework` and `reopen`.',
  }),
  version: z.number().int().optional().meta({
    description:
      'The version the caller last saw; a stale value is refused with `409`.',
  }),
  requestId: z.string().min(1).max(128).optional().meta({
    description:
      'An idempotency key; sending the same key twice fires the transition once.',
  }),
});

export const CreateTicketInput = z.strictObject({
  title: z
    .string()
    .min(1)
    .max(255)
    .meta({ description: 'What is broken, in one line.' }),
  description: z
    .string()
    .max(10000)
    .optional()
    .meta({ description: 'What the reporter observed.' }),
  category: z
    .string()
    .max(64)
    .optional()
    .meta({ description: 'The kind of equipment or service.' }),
  urgency: TicketUrgencySchema.optional().meta({
    description: 'How soon the reporter needs it fixed.',
  }),
  attachmentId: z.string().min(1).optional().meta({
    description:
      'The `ticketAttachments` file id of a screenshot, uploaded separately.',
  }),
});

export const CreateTicketCommentInput = z.strictObject({
  body: z.string().min(1).max(5000),
});

export const ListExecutionsQuery = z.object({
  ticketId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const TicketExecution = z
  .object({
    id: z.string(),
    recordId: z.string(),
    recordTitle: z.string(),
    transition: z.string(),
    from: z.string().nullable(),
    to: z.string(),
    actorId: z.string().nullable(),
    at: z.iso.datetime(),
    version: z.number().int(),
  })
  .meta({ ref: 'TicketExecution' });

export const TicketEffect = z
  .object({
    id: z.string(),
    recordId: z.string(),
    effect: z.string(),
    status: z.string(),
    attempts: z.number().int(),
    maxAttempts: z.number().int(),
    error: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ ref: 'TicketEffect' });

export const TicketExecutions = z
  .object({
    transitions: z.array(TicketExecution),
    effects: z.array(TicketEffect),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .meta({ ref: 'TicketExecutions' });

export const TicketWorkloadRow = z
  .object({
    assigneeId: z.string(),
    assigneeName: z.string(),
    active: z.number().int(),
    waiting: z.number().int(),
  })
  .meta({ ref: 'TicketWorkloadRow' });

export const TicketDashboard = z
  .object({
    pendingAssignment: z.number().int(),
    inProgress: z.number().int(),
    waitingConfirmation: z.number().int(),
    overdue: z.number().int(),
    reportedByMe: z.number().int(),
    assignedToMe: z.number().int(),
    overdueHours: z.number().int(),
    workload: z.array(TicketWorkloadRow),
    recent: z.array(Ticket),
  })
  .meta({ ref: 'TicketDashboard' });

export const TicketAssignee = z
  .object({ id: z.string(), name: z.string() })
  .meta({ ref: 'TicketAssignee' });

export const TicketDefinition = z
  .object({
    name: z.string(),
    title: z.string(),
    collection: z.string(),
    states: z.array(z.string()),
    parameters: z.object({
      overdueHours: z.number().int(),
      maxReopenCount: z.number().int(),
    }),
  })
  .meta({ ref: 'TicketDefinition' });

/**
 * The diagram and the parameter defaults, as `describeLifecycle()` reports them.
 *
 * The description is a stable, serialisable shape the client's lifecycle diagram already consumes, so it is documented
 * as the object it is instead of being re-declared per field.
 */
export const TicketLifecycleDescription: z.ZodType<Record<string, unknown>> = z
  .looseObject({})
  .meta({ ref: 'TicketLifecycleDescription' });

export type ListTicketsQueryInput = z.infer<typeof ListTicketsQuery>;
export type FireTicketTransitionBody = z.infer<
  typeof FireTicketTransitionInput
>;
export type CreateTicketBody = z.infer<typeof CreateTicketInput>;

/** The urgency list the client's picker offers, in the order it shows them. */
export const TICKET_URGENCIES: readonly TicketUrgency[] = [
  'low',
  'normal',
  'high',
  'urgent',
];
