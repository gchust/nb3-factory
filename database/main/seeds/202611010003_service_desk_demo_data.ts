import { hashPassword } from 'better-auth/crypto';
import { defineSeed, type Repository, type SeedContext } from '@nocobase/db';

/**
 * The service desk's demonstration accounts and tickets, as installation data.
 *
 * They are required rather than sample data by this application's own choice:
 * the workflow has nothing to exercise without at least one engineer to assign
 * to and one ticket to assign, and this application's installation path runs
 * seeds but never sample data. Everything here is idempotent — accounts are
 * looked up by email, an existing assignment is left alone, and tickets are
 * written only while the table is empty — so re-running `db apply` changes
 * nothing.
 *
 * The Permission Sets it assigns are the ones
 * `202611010002_service_desk_permission_sets` creates, which runs first because
 * seeds are ordered by filename. They are assigned by inserting into the
 * authorization assignment table directly, the same way the Permission Set seed
 * writes its sets: an installation seed runs while only providers are
 * registered, before the authorization service and the application's role
 * scopes exist.
 *
 * Accounts are written through the same tables and the same password hash the
 * authentication plugin's own initial-admin seed uses (`better-auth/crypto`),
 * because a database task resolves no plugin service — only the connection's
 * `query` and `repository`.
 *
 * `transaction: false`: every step is idempotent, so a partial failure is safe
 * to retry, and a rollback would not leave a half-installed set of accounts
 * behind for the retry to reconcile.
 *
 * This file is immutable history — it keeps its own copy of the row shapes so a
 * later change to a Collection cannot quietly change what an applied seed means.
 */

/** The Permission Set that raises tickets but does not handle them. */
const EMPLOYEE_PERMISSION_SET = 'service-employee';
/** The Permission Set that handles tickets assigned to it. */
const ENGINEER_PERMISSION_SET = 'service-engineer';
/** The Permission Set that runs the desk: assignment and the whole queue. */
const SERVICE_DESK_PERMISSION_SET = 'service-desk';

const DEMO_PASSWORD = 'ServiceDesk#2026';

interface DemoUser {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly permissionSet: string;
}

const DEMO_USERS: readonly DemoUser[] = [
  {
    username: 'alex.kim',
    name: 'Alex Kim',
    email: 'alex.kim@example.com',
    permissionSet: EMPLOYEE_PERMISSION_SET,
  },
  {
    username: 'sam.ortiz',
    name: 'Sam Ortiz',
    email: 'sam.ortiz@example.com',
    permissionSet: EMPLOYEE_PERMISSION_SET,
  },
  {
    username: 'morgan.reed',
    name: 'Morgan Reed',
    email: 'morgan.reed@example.com',
    permissionSet: ENGINEER_PERMISSION_SET,
  },
  {
    username: 'priya.sharma',
    name: 'Priya Sharma',
    email: 'priya.sharma@example.com',
    permissionSet: ENGINEER_PERMISSION_SET,
  },
  {
    username: 'dana.cole',
    name: 'Dana Cole',
    email: 'dana.cole@example.com',
    permissionSet: SERVICE_DESK_PERMISSION_SET,
  },
];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const seed = defineSeed({
  name: '202611010003_service_desk_demo_data',
  transaction: false,
  async run(context: SeedContext): Promise<void> {
    const ids = new Map<string, string>();
    for (const demo of DEMO_USERS) {
      const id =
        (await findUserId(context, demo.email)) ??
        (await createAccount(context, demo));
      ids.set(demo.username, id);
      await assignPermissionSet(context, id, demo.permissionSet);
    }

    const tickets = context.repository<TicketRow>('tickets');
    if ((await tickets.count()) === 0) {
      await createDemoTickets(context, ids);
    }
  },
});

/**
 * Gives the account one Permission Set through the assignment table the Users
 * page reads direct roles from, unless that exact assignment already exists.
 */
async function assignPermissionSet(
  context: SeedContext,
  userId: string,
  permissionSet: string,
): Promise<void> {
  const existing = await context.query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('subjectType', '=', 'user')
    .where('subjectId', '=', userId)
    .where('permissionSetKey', '=', permissionSet)
    .executeTakeFirst();
  if (existing) return;
  const now = new Date();
  await context.query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id: `user:${userId}:${permissionSet}`,
      subjectType: 'user',
      subjectId: userId,
      permissionSetKey: permissionSet,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function findUserId(
  context: SeedContext,
  email: string,
): Promise<string | undefined> {
  const user = await context
    .repository<{ id: string; email: string }>('user')
    .findOne({ filter: { email: email.toLowerCase() } });
  return user?.id;
}

/**
 * Creates one sign-in-capable account: the `user` row and the credential
 * `account` row Better Auth's username sign-in reads, the same two rows the
 * authentication plugin's initial-admin seed writes.
 */
async function createAccount(
  context: SeedContext,
  demo: DemoUser,
): Promise<string> {
  const now = new Date();
  const userId = crypto.randomUUID();
  await context.query
    .insertInto('user')
    .values({
      id: userId,
      name: demo.name,
      username: demo.username.toLowerCase(),
      email: demo.email.toLowerCase(),
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await context.query
    .insertInto('account')
    .values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: await hashPassword(DEMO_PASSWORD),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  return userId;
}

async function createDemoTickets(
  context: SeedContext,
  ids: ReadonlyMap<string, string>,
): Promise<void> {
  const alex = requireUser(ids, 'alex.kim');
  const sam = requireUser(ids, 'sam.ortiz');
  const morgan = requireUser(ids, 'morgan.reed');
  const priya = requireUser(ids, 'priya.sharma');
  const dana = requireUser(ids, 'dana.cole');

  const tickets = context.repository<TicketRow>('tickets');
  const notes = context.repository<TicketNoteRow>('ticketNotes');
  const transitions =
    context.repository<TicketTransitionRow>('ticketTransitions');

  // Two days ago: raised by an employee, still waiting for an assignee.
  const laptop = await createTicket(tickets, {
    title: 'Laptop will not power on',
    description:
      'My ThinkPad shows no reaction when I press the power button, even on the charger. I have a client call tomorrow morning.',
    urgency: 'high',
    status: 'pending',
    requesterId: alex,
    assigneeId: null,
    resolution: null,
    attachmentIds: null,
    statusChangedAt: ago(2 * DAY),
    overdueNotifiedAt: null,
    createdAt: ago(2 * DAY),
    updatedAt: ago(2 * DAY),
  });
  await notes.createOne({
    values: {
      ticketId: laptop.id,
      authorId: alex,
      content: 'I also tried a different charger and a different outlet.',
      createdAt: ago(2 * DAY - HOUR),
    },
  });

  // A day and a half ago: assigned and in progress.
  const wifi = await createTicket(tickets, {
    title: 'Wi-Fi drops in meeting room B',
    description:
      'The connection drops every few minutes during video calls in meeting room B, on the second floor.',
    urgency: 'normal',
    status: 'processing',
    requesterId: sam,
    assigneeId: morgan,
    resolution: null,
    attachmentIds: null,
    statusChangedAt: ago(1.5 * DAY),
    overdueNotifiedAt: null,
    createdAt: ago(1.6 * DAY),
    updatedAt: ago(1.5 * DAY),
  });
  await recordAssignment(transitions, {
    ticketId: wifi.id,
    actorId: dana,
    fromStatus: 'pending',
    toStatus: 'processing',
    payload: { assigneeId: morgan },
    createdAt: ago(1.5 * DAY),
  });

  // Thirty hours untouched: the overdue reminder picks this one up.
  const vpn = await createTicket(tickets, {
    title: 'VPN disconnects every 20 minutes',
    description:
      'The company VPN drops roughly every 20 minutes from my home office and reconnects after a minute.',
    urgency: 'high',
    status: 'processing',
    requesterId: alex,
    assigneeId: morgan,
    resolution: null,
    attachmentIds: null,
    statusChangedAt: ago(30 * HOUR),
    overdueNotifiedAt: null,
    createdAt: ago(40 * HOUR),
    updatedAt: ago(30 * HOUR),
  });
  await recordAssignment(transitions, {
    ticketId: vpn.id,
    actorId: dana,
    fromStatus: 'pending',
    toStatus: 'processing',
    payload: { assigneeId: morgan },
    createdAt: ago(30 * HOUR),
  });
  await notes.createOne({
    values: {
      ticketId: vpn.id,
      authorId: morgan,
      content:
        'Collected the VPN client logs; reproducing with the network team.',
      createdAt: ago(31 * HOUR),
    },
  });

  // Waiting for the reporter to confirm the fix.
  const printer = await createTicket(tickets, {
    title: 'Printer on the 3rd floor jams every print',
    description:
      'The large printer next to the kitchen jams on almost every job and shows error E-04.',
    urgency: 'low',
    status: 'resolved',
    requesterId: sam,
    assigneeId: priya,
    resolution:
      'Replaced the worn pickup roller and cleared the paper path; ten test pages printed without a jam.',
    attachmentIds: null,
    statusChangedAt: ago(6 * HOUR),
    overdueNotifiedAt: null,
    createdAt: ago(3 * DAY),
    updatedAt: ago(6 * HOUR),
  });
  await recordAssignment(transitions, {
    ticketId: printer.id,
    actorId: dana,
    fromStatus: 'pending',
    toStatus: 'processing',
    payload: { assigneeId: priya },
    createdAt: ago(2.8 * DAY),
  });
  await notes.createOne({
    values: {
      ticketId: printer.id,
      authorId: priya,
      content: 'Ordered a spare roller; installed it this afternoon.',
      createdAt: ago(6 * HOUR),
    },
  });

  // A finished ticket, kept so the dashboard's counts are not all zero.
  await createTicket(tickets, {
    title: 'Set up a laptop for a new starter',
    description:
      'Prepare a laptop, accounts and access for a designer starting next week.',
    urgency: 'normal',
    status: 'closed',
    requesterId: sam,
    assigneeId: priya,
    resolution:
      'Laptop imaged, accounts created and access granted; handed over on the start date.',
    attachmentIds: null,
    statusChangedAt: ago(4 * DAY),
    overdueNotifiedAt: null,
    createdAt: ago(6 * DAY),
    updatedAt: ago(4 * DAY),
  });
}

function requireUser(ids: ReadonlyMap<string, string>, key: string): string {
  const id = ids.get(key);
  if (!id) throw new Error(`Demo user ${key} was not created`);
  return id;
}

function ago(milliseconds: number): Date {
  return new Date(Date.now() - milliseconds);
}

interface TicketRow {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly urgency: string;
  readonly status: string;
  readonly requesterId: string;
  readonly assigneeId: string | null;
  readonly resolution: string | null;
  readonly attachmentIds: string[] | null;
  readonly statusChangedAt: Date;
  readonly lifecycleVersion: number;
  readonly overdueNotifiedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface TicketNoteRow {
  readonly id: number;
  readonly ticketId: number;
  readonly authorId: string;
  readonly content: string;
  readonly createdAt: Date;
}

interface TicketTransitionRow {
  readonly id: number;
  readonly ticketId: number;
  readonly action: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly actorId: string;
  readonly payload: Record<string, unknown> | null;
  readonly createdAt: Date;
}

interface CreateTicketValues {
  readonly title: string;
  readonly description: string;
  readonly urgency: string;
  readonly status: string;
  readonly requesterId: string;
  readonly assigneeId: string | null;
  readonly resolution: string | null;
  readonly attachmentIds: string[] | null;
  readonly statusChangedAt: Date;
  readonly overdueNotifiedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

async function createTicket(
  repository: Repository<TicketRow>,
  values: CreateTicketValues,
): Promise<TicketRow> {
  const { record } = await repository.createOne({
    values: { ...values, lifecycleVersion: 1 },
  });
  return record;
}

async function recordAssignment(
  repository: Repository<TicketTransitionRow>,
  input: {
    readonly ticketId: number;
    readonly actorId: string;
    readonly fromStatus: string;
    readonly toStatus: string;
    readonly payload: Record<string, unknown>;
    readonly createdAt: Date;
  },
): Promise<void> {
  await repository.createOne({
    values: {
      ticketId: input.ticketId,
      action: 'assign',
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorId: input.actorId,
      payload: input.payload,
      createdAt: input.createdAt,
    },
  });
}

export default seed;
