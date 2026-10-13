/**
 * Request and response schemas for the `/api/serviceDesk` routes. They document the API at `/api/swagger`; the
 * routes validate requests against the same objects and send exactly the shapes described here.
 *
 * Every response object carries `.meta({ ref: '...' })` so the OpenAPI document names it rather than a converter
 * number, which `findApiDocumentSchemaProblems()` rejects.
 */
import { z } from 'zod';

const dateTime = () => z.string().meta({ format: 'date-time' });

export const TicketStateSchema = z.enum([
  'submitted',
  'assigned',
  'processing',
  'resolved',
  'returned',
  'closed',
  'cancelled',
]);

export const TicketUrgencySchema = z.enum(['low', 'normal', 'high', 'urgent']);

// ---------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------

export const TicketParams = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export const StaffParams = z.object({
  userId: z.string().trim().min(1).max(64),
});

export const ListTicketsQuery = z.object({
  status: TicketStateSchema.optional(),
  assigneeId: z.string().min(1).optional(),
  requesterId: z.string().min(1).optional(),
  scope: z.enum(['all', 'mine', 'assigned']).optional(),
  /** Query values are strings; the route turns `'true'` into a boolean. */
  overdue: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const CreateTicketInput = z.strictObject({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(20_000),
  category: z.string().trim().max(64).nullish(),
  location: z.string().trim().max(255).nullish(),
  urgency: TicketUrgencySchema,
  attachmentIds: z.array(z.string().min(1)).max(10).optional(),
});

export const FireTicketInput = z.strictObject({
  transition: z.string().trim().min(1).max(64),
  input: z.record(z.string(), z.unknown()).optional(),
  expectVersion: z.number().int().nonnegative().optional(),
  /** A key the caller reuses for the retries of one action, so a duplicate submission changes nothing. */
  requestId: z.string().trim().min(1).max(128).optional(),
});

export const AddNoteInput = z.strictObject({
  content: z.string().trim().min(1).max(20_000),
  kind: z.enum(['handling', 'comment']).optional(),
});

export const DirectoryQuery = z.object({
  search: z.string().trim().max(100).optional(),
});

export const SetRoleInput = z.strictObject({
  role: z.enum(['engineer', 'helpdesk']).nullable(),
});

// ---------------------------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------------------------

export const ServiceDeskUserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  })
  .meta({ ref: 'ServiceDeskUser' });

export const TicketRecordSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    description: z.string(),
    category: z.string().nullable(),
    location: z.string().nullable(),
    urgency: TicketUrgencySchema,
    status: TicketStateSchema,
    statusChangedAt: dateTime(),
    lifecycleVersion: z.number(),
    requesterId: z.string(),
    assigneeId: z.string().nullable(),
    solution: z.string().nullable(),
    returnReason: z.string().nullable(),
    attachmentIds: z.array(z.string()).nullable(),
    createdAt: dateTime(),
    updatedAt: dateTime(),
  })
  .meta({ ref: 'ServiceDeskTicketRecord' });

export const TicketListItemSchema = TicketRecordSchema.extend({
  requesterName: z.string(),
  assigneeName: z.string().nullable(),
  overdue: z.boolean(),
}).meta({ ref: 'ServiceDeskTicketListItem' });

export const TicketListMetaSchema = z
  .object({ total: z.number().int() })
  .meta({ ref: 'ServiceDeskTicketListMeta' });

export const BlockerSchema = z
  .object({
    source: z.enum(['state', 'guard', 'manual']),
    kind: z.enum(['permission', 'precondition']),
    code: z.string(),
    message: z.string(),
  })
  .meta({ ref: 'ServiceDeskBlocker' });

export const AvailableTransitionSchema = z
  .object({
    name: z.string(),
    title: z.string(),
    to: z.array(z.string()),
    allowed: z.boolean(),
    blockers: z.array(BlockerSchema),
  })
  .meta({ ref: 'ServiceDeskAvailableTransition' });

/**
 * The lifecycle's own log entries. They are shown as the ticket's history, so they are documented loosely: their
 * exact fields are the library's, and a page reads only the transition name, actor and time.
 */
export const TransitionEntrySchema = z
  .record(z.string(), z.unknown())
  .meta({ ref: 'ServiceDeskTransitionEntry' });

export const EffectRunSchema = z
  .record(z.string(), z.unknown())
  .meta({ ref: 'ServiceDeskEffectRun' });

export const TicketHistorySchema = z
  .object({
    transitions: z.array(TransitionEntrySchema),
    effectRuns: z.array(EffectRunSchema),
  })
  .meta({ ref: 'ServiceDeskTicketHistory' });

export const TicketViewSchema = z
  .object({
    record: TicketRecordSchema,
    state: TicketStateSchema,
    version: z.number().nullable(),
    available: z.array(AvailableTransitionSchema),
    history: TicketHistorySchema,
    requester: ServiceDeskUserSchema.nullable(),
    assignee: ServiceDeskUserSchema.nullable(),
    overdue: z.boolean(),
  })
  .meta({ ref: 'ServiceDeskTicketView' });

export const TicketNoteSchema = z
  .object({
    id: z.number(),
    ticketId: z.number(),
    authorId: z.string(),
    kind: z.enum(['handling', 'comment', 'system']),
    content: z.string(),
    createdAt: dateTime(),
    authorName: z.string(),
  })
  .meta({ ref: 'ServiceDeskTicketNote' });

export const OverviewSchema = z
  .object({
    me: z.object({
      userId: z.string(),
      helpdesk: z.boolean(),
      engineer: z.boolean(),
    }),
    counts: z.record(z.string(), z.number().int()),
    pendingAssignment: z.number().int(),
    overdue: z.number().int(),
    open: z.number().int(),
    workload: z.array(
      z.object({
        engineerId: z.string(),
        name: z.string(),
        open: z.number().int(),
        overdue: z.number().int(),
      }),
    ),
  })
  .meta({ ref: 'ServiceDeskOverview' });

export const StaffMemberSchema = z
  .object({
    user: ServiceDeskUserSchema,
    role: z.enum(['engineer', 'helpdesk']),
  })
  .meta({ ref: 'ServiceDeskStaffMember' });

export const MeSchema = z
  .object({
    userId: z.string(),
    name: z.string(),
    email: z.string(),
    helpdesk: z.boolean(),
    engineer: z.boolean(),
  })
  .meta({ ref: 'ServiceDeskMe' });
