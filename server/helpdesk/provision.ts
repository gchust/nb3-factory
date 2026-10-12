import { randomUUID } from 'node:crypto';

import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { recordAccess } from '@nocobase/app-plugin-authorization/server';
import type { UserManagementService } from '@nocobase/app-plugin-users/server';
import type { DatabaseManager } from '@nocobase/db';
import type { JsonObject, LifecycleRuntime } from '@nocobase/lifecycle';

import type { Ticket } from './lifecycle.js';
import {
  assignedAccess,
  EMPLOYEE_PERMISSION_SET,
  ENGINEER_PERMISSION_SET,
  reporterAccess,
  SERVICE_DESK_PERMISSION_SET,
  ticketsReference,
} from './resources.js';

/**
 * Puts the help desk's three jobs in place and loads a small demonstration set.
 *
 * The permission sets are produced from the same composite references the seeds would use, so the two cannot drift,
 * and the demonstration records go through the lifecycle runtime rather than around it, which is what gives them a
 * transition history. Every step is create-if-missing, so a restart neither duplicates nor overwrites.
 */
export interface HelpdeskProvisionInput {
  readonly database: DatabaseManager;
  readonly authorization: AppAuthorization;
  readonly users: UserManagementService;
  readonly runtime: LifecycleRuntime;
  readonly now?: () => Date;
}

const TITLE_NS = 'app';

export async function provisionHelpdesk(
  input: HelpdeskProvisionInput,
): Promise<void> {
  await ensurePermissionSets(input);
  await ensureSampleData(input);
}

/** The three job permission sets, from the composite reference. */
export async function ensurePermissionSets(
  input: Pick<HelpdeskProvisionInput, 'authorization'>,
): Promise<void> {
  const { authorization } = input;
  const definitions: {
    key: string;
    title: { key: string; ns: string };
    grants: readonly ReturnType<typeof ticketsReference.grant>[];
  }[] = [
    {
      key: EMPLOYEE_PERMISSION_SET,
      title: { key: 'helpdesk.permissionSets.employee', ns: TITLE_NS },
      grants: [
        ticketsReference.grant({
          view: { tickets: reporterAccess.key },
          create: {},
          comment: {},
          confirm: {},
          reopen: {},
        }),
      ],
    },
    {
      key: ENGINEER_PERMISSION_SET,
      title: { key: 'helpdesk.permissionSets.engineer', ns: TITLE_NS },
      grants: [
        ticketsReference.grant({
          view: { tickets: assignedAccess.key },
          start: {},
          resolve: {},
          comment: { tickets: assignedAccess.key },
        }),
      ],
    },
    {
      key: SERVICE_DESK_PERMISSION_SET,
      title: { key: 'helpdesk.permissionSets.serviceDesk', ns: TITLE_NS },
      grants: [
        ticketsReference.grant({
          view: { tickets: recordAccess.allRecords.key },
          dashboard: {},
          assign: {},
          comment: { tickets: recordAccess.allRecords.key },
        }),
      ],
    },
  ];
  for (const definition of definitions) {
    const existing = await authorization.permissionSets.get(definition.key);
    if (existing) {
      await authorization.permissionSets.update(definition.key, definition);
    } else {
      await authorization.permissionSets.create(definition);
    }
  }
}

interface DemoUser {
  readonly username: string;
  readonly email: string;
  readonly name: string;
  readonly permissionSet: string;
}

const DEMO_USERS: readonly DemoUser[] = [
  {
    username: 'alice',
    email: 'alice@example.com',
    name: 'Alice Chen',
    permissionSet: EMPLOYEE_PERMISSION_SET,
  },
  {
    username: 'bob',
    email: 'bob@example.com',
    name: 'Bob Li',
    permissionSet: ENGINEER_PERMISSION_SET,
  },
  {
    username: 'carol',
    email: 'carol@example.com',
    name: 'Carol Wang',
    permissionSet: ENGINEER_PERMISSION_SET,
  },
  {
    username: 'dave',
    email: 'dave@example.com',
    name: 'Dave Zhao',
    permissionSet: SERVICE_DESK_PERMISSION_SET,
  },
];

/** The password every demonstration account starts with; sample data, never a stored secret. */
export const DEMO_PASSWORD = 'Helpdesk123!';

async function ensureSampleData(input: HelpdeskProvisionInput): Promise<void> {
  const { database, authorization, runtime } = input;
  const total = await database.repository('tickets').count({});
  if (total > 0) return;

  const created = new Map<string, { id: string; name: string }>();
  for (const demo of DEMO_USERS) {
    const user = await ensureUser(input, demo);
    created.set(demo.username, user);
    await ensureAssignment(authorization, user.id, demo.permissionSet);
  }

  const alice = created.get('alice');
  const bob = created.get('bob');
  const carol = created.get('carol');
  const dave = created.get('dave');
  if (!alice || !bob || !carol || !dave) return;

  const now = input.now?.() ?? new Date();
  const hoursAgo = (hours: number) =>
    new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

  const create = async (values: {
    title: string;
    description: string;
    category: string;
    priority: Ticket['priority'];
    reporterId: string;
    reporterName: string;
    createdAt: string;
  }) =>
    runtime.create(
      'tickets',
      { id: randomUUID(), ...values, updatedAt: values.createdAt },
      { actor: { id: values.reporterId } },
    );

  const assign = async (id: string, assignee: { id: string; name: string }) =>
    runtime.fire('tickets', id, 'assign', {
      actor: { id: dave.id },
      manual: true,
      input: { assigneeId: assignee.id, assigneeName: assignee.name },
    });

  const step = async (
    id: string,
    transition: string,
    actorId: string,
    values: Record<string, unknown> = {},
  ) =>
    runtime.fire('tickets', id, transition, {
      actor: { id: actorId },
      manual: true,
      input: values as JsonObject,
    });

  // Awaiting dispatch: the service desk's queue.
  await create({
    title: 'Laptop will not turn on',
    description:
      'The power light blinks once and nothing happens. Tried another charger.',
    category: 'hardware',
    priority: 'high',
    reporterId: alice.id,
    reporterName: 'Alice Chen',
    createdAt: hoursAgo(3),
  });

  // Dispatched to Bob, not started.
  const assigned = await create({
    title: 'VPN client disconnects every few minutes',
    description: 'Wired and wireless both drop the VPN tunnel repeatedly.',
    category: 'network',
    priority: 'medium',
    reporterId: alice.id,
    reporterName: 'Alice Chen',
    createdAt: hoursAgo(9),
  });
  await assign(String(assigned.record.id), bob);

  // Bob is working on it.
  const processing = await create({
    title: 'Finance report exports empty CSV',
    description: 'The monthly export downloads but contains no rows.',
    category: 'software',
    priority: 'high',
    reporterId: alice.id,
    reporterName: 'Alice Chen',
    createdAt: hoursAgo(20),
  });
  await assign(String(processing.record.id), bob);
  await step(String(processing.record.id), 'start', bob.id);

  // Carol resolved hers; Alice has not confirmed yet.
  const resolved = await create({
    title: 'Second monitor not detected',
    description: 'The dock sees the monitor but Windows does not.',
    category: 'hardware',
    priority: 'low',
    reporterId: alice.id,
    reporterName: 'Alice Chen',
    createdAt: hoursAgo(26),
  });
  await assign(String(resolved.record.id), carol);
  await step(String(resolved.record.id), 'resolve', carol.id, {
    resolution:
      'Replaced the dock firmware and reseated the DisplayPort cable.',
  });

  // A finished ticket, for the history views.
  const closed = await create({
    title: 'Cannot install the design suite',
    description: 'Installer exits with error 1603 on the new laptop.',
    category: 'software',
    priority: 'medium',
    reporterId: alice.id,
    reporterName: 'Alice Chen',
    createdAt: hoursAgo(70),
  });
  await assign(String(closed.record.id), bob);
  await step(String(closed.record.id), 'resolve', bob.id, {
    resolution: 'Removed a leftover registry entry and reinstalled.',
  });
  await step(String(closed.record.id), 'confirm', alice.id);
  await database.repository('tickets').updateOne({
    filter: { id: closed.record.id },
    values: { closedAt: hoursAgo(48) },
  });

  // Older than a day and still unresolved: the overdue reminder case.
  const overdue = await create({
    title: 'Meeting room projector flickers',
    description: 'The image cuts out for a second every minute or so.',
    category: 'hardware',
    priority: 'urgent',
    reporterId: alice.id,
    reporterName: 'Alice Chen',
    createdAt: hoursAgo(40),
  });
  await database.repository('tickets').updateOne({
    filter: { id: overdue.record.id },
    values: { statusChangedAt: hoursAgo(30) },
  });
}

async function ensureUser(
  input: HelpdeskProvisionInput,
  demo: DemoUser,
): Promise<{ id: string; name: string }> {
  const existing = await input.database
    .repository<{ id: string; name: string }>('user')
    .findOne({
      filter: (filter) => filter.string('email').eq(demo.email),
      select: (select) => select.fields('id', 'name'),
    });
  if (existing) return existing;
  const user = await input.users.create({
    name: demo.name,
    username: demo.username,
    email: demo.email,
    password: DEMO_PASSWORD,
  });
  return { id: user.id, name: user.name };
}

async function ensureAssignment(
  authorization: AppAuthorization,
  userId: string,
  permissionSet: string,
): Promise<void> {
  const assignments =
    await authorization.permissionSets.listAssignments(permissionSet);
  if (
    assignments.some(
      (assignment) =>
        assignment.subject.type === 'user' && assignment.subject.id === userId,
    )
  ) {
    return;
  }
  await authorization.permissionSets.assign({
    subject: { type: 'user', id: userId },
    permissionSet,
  });
}
