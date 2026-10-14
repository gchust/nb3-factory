import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);
const dateTime = () => z.string().meta({ format: 'date-time' });
const nullableDateTime = () => dateTime().nullable();

/** `/tickets/:ticketId`. */
export const TicketParams = z.object({
  ticketId: z.coerce.number().int().positive(),
});

/** `/tickets/team/:userId`. */
export const TeamMemberParams = z.object({
  userId: nonEmpty,
});

export const TicketStatus = z.enum([
  'pending',
  'processing',
  'resolved',
  'closed',
]);
export const TicketUrgency = z.enum(['normal', 'urgent', 'critical']);

export const ListTicketsQuery = z.object({
  status: TicketStatus.optional(),
  urgency: TicketUrgency.optional(),
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const CreateTicketInput = z.strictObject({
  title: nonEmpty,
  description: nonEmpty,
  urgency: TicketUrgency.optional(),
  attachmentIds: z.array(nonEmpty).max(20).optional(),
});

/** The manual transitions; `remind` is trigger-only and never accepted here. */
export const TicketTransition = z.enum([
  'assign',
  'reassign',
  'progress',
  'resolve',
  'confirm',
  'return',
]);

export const FireTicketInput = z.strictObject({
  transition: TicketTransition,
  input: z.record(z.string(), z.json()).optional(),
  requestId: nonEmpty.optional(),
  expectVersion: z.number().int().nonnegative().optional(),
});

export const CreateTeamMemberInput = z.strictObject({
  name: nonEmpty,
  username: nonEmpty.optional(),
  email: nonEmpty,
  password: nonEmpty,
  roles: z.array(nonEmpty).optional(),
});

export const SetTeamMemberRolesInput = z.strictObject({
  roles: z.array(nonEmpty),
});

// Response schemas. They describe what the routes send in the API document at
// `/api/swagger/docs`; nothing validates a response against them.

export const TicketAttachmentSchema = z
  .object({
    id: z.string(),
    filename: z.string(),
    ext: z.string(),
    mimeType: z.string(),
    size: z.union([z.string(), z.number()]),
    contentUrl: z
      .string()
      .meta({ description: 'Where the browser reads the screenshot.' }),
  })
  .meta({ ref: 'ItTicketAttachment' });

export const TicketTransitionSchema = z
  .object({
    name: z.string().meta({
      description: 'The transition to pass to `/fire`.',
    }),
    to: z.string(),
    allowed: z.boolean(),
    blockers: z.array(z.string()),
  })
  .meta({ ref: 'ItTicketTransition' });

export const TicketHistorySchema = z
  .object({
    transition: z.string(),
    from: z.string().nullable(),
    to: z.string(),
    actorId: z.string(),
    input: z.record(z.string(), z.unknown()).nullable(),
    at: dateTime(),
    version: z.number().int(),
  })
  .meta({ ref: 'ItTicketHistoryEntry' });

export const TicketSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    description: z.string(),
    urgency: z.string(),
    status: z.string(),
    reporterId: z.string(),
    reporterName: z.string().nullable(),
    assigneeId: z.string().nullable(),
    assigneeName: z.string().nullable(),
    handlingNote: z.string().nullable(),
    solution: z.string().nullable(),
    attachmentIds: z.array(z.string()),
    attachments: z.array(TicketAttachmentSchema),
    assignedAt: nullableDateTime(),
    resolvedAt: nullableDateTime(),
    closedAt: nullableDateTime(),
    returnedCount: z.number().int(),
    lastReturnReason: z.string().nullable(),
    remindedAt: nullableDateTime(),
    statusChangedAt: dateTime(),
    lifecycleVersion: z.number().int(),
    createdAt: dateTime(),
    updatedAt: dateTime(),
    available: z.array(TicketTransitionSchema).meta({
      description:
        'The transitions this caller may fire, each with the blockers that would refuse it.',
    }),
    canFire: z.array(z.string()).meta({
      description:
        "The transitions this caller's role allows here, before the state check; use it to show the right actions.",
    }),
    history: z.array(TicketHistorySchema).meta({
      description: 'The transition log, oldest first. Only on the detail view.',
    }),
  })
  .meta({ ref: 'ItTicket' });

export const TicketPageMeta = z
  .object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  })
  .meta({ ref: 'ItTicketPageMeta' });

export const EngineerSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    username: z.string().nullable(),
    processing: z
      .number()
      .int()
      .meta({ description: 'Tickets assigned to this engineer still open.' }),
  })
  .meta({ ref: 'ItEngineer' });

export const TicketDashboardSchema = z
  .object({
    counts: z
      .record(TicketStatus, z.number().int())
      .meta({ description: 'How many visible tickets sit in each state.' }),
    pendingAssignment: z.array(TicketSchema),
    overdue: z.array(TicketSchema).meta({
      description: 'Visible tickets unresolved for more than 24 hours.',
    }),
    workload: z.array(EngineerSchema),
  })
  .meta({ ref: 'ItTicketDashboard' });

export const TeamMemberSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    username: z.string().nullable(),
    email: z.string(),
    roles: z.array(z.string()),
  })
  .meta({ ref: 'ItTeamMember' });

export const TeamRoleSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    assignable: z.boolean(),
    removable: z.boolean(),
  })
  .meta({ ref: 'ItTeamRole' });

export const TeamSchema = z
  .object({
    members: z.array(TeamMemberSchema),
    roles: z.array(TeamRoleSchema),
  })
  .meta({ ref: 'ItTeam' });
