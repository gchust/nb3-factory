// @vitest-environment node
import path from 'node:path';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import type { MigrationSource } from '@nocobase/db';
import type { DatabaseManager } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import {
  createItTicketService,
  type ItTicketService,
  type TicketPrincipal,
} from '../../server/providers/it-tickets/service.js';

/**
 * The service desk's business rules against a real database: who sees which
 * ticket, what each role may do to it, how the state machine moves, and when
 * the service desk is reminded. The service is constructed directly, so a
 * failure points at the rule rather than at an HTTP layer or the shell.
 */

const sources: readonly MigrationSource[] = [
  {
    packageName: 'it-tickets-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

const test = createDatabaseTest({ migrations: sources });

interface UserRow {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TicketTimestampRow {
  id: number;
  updatedAt: Date;
  statusChangedAt: Date;
}

interface TicketFileRow {
  id: string;
  ticketId: number | null;
  uploaderId: string | null;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

interface People {
  reporter: TicketPrincipal;
  other: TicketPrincipal;
  engineer: TicketPrincipal;
  desk: TicketPrincipal;
  root: TicketPrincipal;
}

/**
 * `user` belongs to the authentication plugin, which these tests do not boot.
 * The service only reads `id`, `name` and `email` from it, so the test stands
 * up the three columns those reads need.
 */
async function seedPeople(database: DatabaseManager): Promise<People> {
  await database.builder().createCollection('user', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('name', { length: 255 }).notNull();
    collection.string('email', { length: 255 }).notNull();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id', { name: 'pk_test_user' });
  });

  const people: People = {
    reporter: { userId: 'user-reporter' },
    other: { userId: 'user-other' },
    engineer: { userId: 'user-engineer' },
    desk: { userId: 'user-desk' },
    root: { userId: 'user-root' },
  };
  const now = new Date();
  const users = database.repository<UserRow>('user');
  const names: Record<string, string> = {
    'user-reporter': 'Reporter',
    'user-other': 'Other',
    'user-engineer': 'Engineer',
    'user-desk': 'Desk',
    'user-root': 'Root',
  };
  for (const [id, name] of Object.entries(names)) {
    await users.createOne({
      values: {
        id,
        name,
        email: `${id}@example.com`,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  const team = database.repository('itTeamMembers');
  await team.createOne({
    values: {
      userId: people.engineer.userId,
      role: 'engineer',
      createdAt: now,
      updatedAt: now,
    },
  });
  await team.createOne({
    values: {
      userId: people.desk.userId,
      role: 'serviceDesk',
      createdAt: now,
      updatedAt: now,
    },
  });

  return people;
}

/** Root is a Permission Set assignment, so it is supplied as a stub rather than a row. */
function rootAuthorization(rootUserId: string): AppAuthorization {
  return {
    permissionSets: {
      listAssignments: async (key: string) => [
        { subject: { type: 'user', id: rootUserId }, permissionSet: { key } },
      ],
      getEffective: async (options: { principal?: { id: string } }) =>
        options.principal?.id === rootUserId ? [{ key: 'root' }] : [],
    },
  } as unknown as AppAuthorization;
}

function createService(
  database: DatabaseManager,
  options: { publicBasePath?: string; authz?: AppAuthorization } = {},
): ItTicketService {
  const app = {
    container: new ServiceContainer(),
    publicBasePath: options.publicBasePath ?? '',
  } as unknown as Application;
  return createItTicketService({
    app,
    database,
    authz: options.authz,
  });
}

function backdate(
  database: DatabaseManager,
  ticketId: number,
  ageMs: number,
): Promise<unknown> {
  const when = new Date(Date.now() - ageMs);
  return database.repository<TicketTimestampRow>('itTickets').updateOne({
    filter: { id: ticketId },
    values: { updatedAt: when, statusChangedAt: when },
  });
}

const HOUR = 60 * 60 * 1000;

test('keeps every role to the tickets it may see', async ({ database }) => {
  const people = await seedPeople(database);
  const service = createService(database);

  const ticket = await service.create(people.reporter, {
    title: 'Printer is broken',
    description: 'The third-floor printer reports a fault.',
    urgency: 'high',
  });
  expect(ticket.status).toBe('pending');
  expect(ticket.urgency).toBe('high');

  await expect(service.list(people.reporter, {})).resolves.toMatchObject({
    total: 1,
  });
  // An unrelated employee is not a participant and sees nothing.
  await expect(service.list(people.other, {})).resolves.toMatchObject({
    total: 0,
  });
  // An engineer only sees what is assigned; nothing is yet.
  await expect(service.list(people.engineer, {})).resolves.toMatchObject({
    total: 0,
  });
  // The service desk sees the whole queue.
  await expect(
    service.list(people.desk, { scope: 'all' }),
  ).resolves.toMatchObject({ total: 1 });

  await expect(service.get(people.other, ticket.id)).rejects.toMatchObject({
    status: 403,
    reason: 'TICKET_FORBIDDEN',
  });
  await expect(service.get(people.desk, ticket.id)).resolves.toMatchObject({
    id: ticket.id,
    reporterName: 'Reporter',
  });

  await expect(
    service.create(people.reporter, {
      title: '   ',
      description: 'No title',
      urgency: 'normal',
    }),
  ).rejects.toMatchObject({ status: 400, reason: 'TICKET_MISSING_FIELD' });
});

test('moves a ticket through assignment, work, resolution, return and closure', async ({
  database,
}) => {
  const people = await seedPeople(database);
  const service = createService(database);

  const ticket = await service.create(people.reporter, {
    title: 'VPN fails',
    description: 'Authentication keeps failing.',
    urgency: 'normal',
  });

  // Only the service desk assigns.
  await expect(
    service.assign(people.reporter, ticket.id, people.engineer.userId),
  ).rejects.toMatchObject({ status: 403, reason: 'TICKET_FORBIDDEN' });
  await expect(
    service.assign(people.desk, ticket.id, 'missing-user'),
  ).rejects.toMatchObject({ status: 400, reason: 'TICKET_INVALID_ASSIGNEE' });

  const assigned = await service.assign(
    people.desk,
    ticket.id,
    people.engineer.userId,
  );
  expect(assigned.status).toBe('processing');
  expect(assigned.assigneeId).toBe(people.engineer.userId);
  await expect(service.list(people.engineer, {})).resolves.toMatchObject({
    total: 1,
  });

  // A reporter who is not the assignee may not work the ticket.
  await expect(
    service.process(people.reporter, ticket.id, 'trying'),
  ).rejects.toMatchObject({ status: 403 });

  const processed = await service.process(
    people.engineer,
    ticket.id,
    'Rebuilt the profile.',
  );
  expect(processed.status).toBe('processing');
  expect(processed.records?.map((record) => record.kind)).toEqual([
    'created',
    'assigned',
    'processing',
  ]);

  const resolved = await service.resolve(
    people.engineer,
    ticket.id,
    'Reinstalled the VPN client.',
  );
  expect(resolved.status).toBe('resolved');
  expect(resolved.resolution).toBe('Reinstalled the VPN client.');
  expect(resolved.resolvedAt).not.toBeNull();

  // The reporter returns it because the fix did not hold.
  const returned = await service.returnForRework(
    people.reporter,
    ticket.id,
    'Still cannot connect.',
  );
  expect(returned.status).toBe('processing');
  expect(returned.resolution).toBeNull();
  expect(returned.resolvedAt).toBeNull();

  await service.resolve(people.engineer, ticket.id, 'Replaced the router.');
  const closed = await service.close(
    people.reporter,
    ticket.id,
    'Confirmed, thanks.',
  );
  expect(closed.status).toBe('closed');
  expect(closed.closedAt).not.toBeNull();
  expect(closed.closedById).toBe(people.reporter.userId);

  // A closed ticket is final.
  await expect(
    service.process(people.engineer, ticket.id, 'More work'),
  ).rejects.toMatchObject({ status: 409, reason: 'TICKET_CLOSED' });
  await expect(
    service.assign(people.desk, ticket.id, people.engineer.userId),
  ).rejects.toMatchObject({ status: 409, reason: 'TICKET_CLOSED' });
  // The resolution is not shown as overdue once it is closed.
  await expect(service.get(people.reporter, ticket.id)).resolves.toMatchObject({
    overdue: false,
  });
});

test('rejects a resolution or a close from the wrong status', async ({
  database,
}) => {
  const people = await seedPeople(database);
  const service = createService(database);

  const ticket = await service.create(people.reporter, {
    title: 'Mailbox full',
    description: 'Cannot receive mail.',
    urgency: 'low',
  });

  // Confirming a ticket that was never resolved is not a transition.
  await expect(
    service.close(people.reporter, ticket.id, 'done'),
  ).rejects.toMatchObject({ status: 409, reason: 'TICKET_INVALID_STATE' });
  await expect(
    service.returnForRework(people.reporter, ticket.id, 'not done'),
  ).rejects.toMatchObject({ status: 409, reason: 'TICKET_INVALID_STATE' });
  // A comment resolves nothing but is recorded for anyone who can see it.
  const commented = await service.comment(
    people.desk,
    ticket.id,
    'Picking this up.',
  );
  expect(commented.records?.at(-1)).toMatchObject({
    kind: 'commented',
    content: 'Picking this up.',
  });
  await expect(
    service.comment(people.other, ticket.id, 'uninvited'),
  ).rejects.toMatchObject({ status: 403 });
});

test('summarizes the queue and each engineer for the dashboard', async ({
  database,
}) => {
  const people = await seedPeople(database);
  const service = createService(database);

  await service.create(people.reporter, {
    title: 'Waiting',
    description: 'Nobody has it yet.',
    urgency: 'high',
  });
  const working = await service.create(people.reporter, {
    title: 'Working',
    description: 'An engineer has it.',
    urgency: 'normal',
  });
  await service.assign(people.desk, working.id, people.engineer.userId);

  await expect(service.roleOf(people.desk)).resolves.toMatchObject({
    role: 'serviceDesk',
    isServiceDesk: true,
  });
  await expect(service.roleOf(people.engineer)).resolves.toMatchObject({
    role: 'engineer',
    isServiceDesk: false,
  });
  await expect(service.roleOf(people.reporter)).resolves.toMatchObject({
    role: null,
    isServiceDesk: false,
  });

  const deskDashboard = await service.dashboard(people.desk);
  expect(deskDashboard).toMatchObject({
    pending: 1,
    processing: 1,
    resolved: 0,
    closed: 0,
  });
  expect(deskDashboard.engineers).toContainEqual({
    userId: people.engineer.userId,
    name: 'Engineer',
    role: 'engineer',
    open: 1,
    total: 1,
  });

  const engineerDashboard = await service.dashboard(people.engineer);
  // The dashboard counts what the role may see: their assignment, not the queue.
  expect(engineerDashboard.mine).toBe(1);
  expect(engineerDashboard.engineers).toEqual([]);

  // `mine` for a service-desk user is what they reported themselves.
  const deskMine = await service.dashboard(people.desk);
  expect(deskMine).toMatchObject({ mine: 0 });
});

test('reminds the service desk once about a ticket open over a day', async ({
  database,
}) => {
  const people = await seedPeople(database);
  const service = createService(database);

  const ticket = await service.create(people.reporter, {
    title: 'Server room cooling',
    description: 'Temperature alarm.',
    urgency: 'urgent',
  });
  await backdate(database, ticket.id, 25 * HOUR);

  await expect(service.get(people.desk, ticket.id)).resolves.toMatchObject({
    overdue: true,
  });
  await expect(service.scanOverdueReminders()).resolves.toBe(1);
  // Setting `remindedAt` keeps the next scan quiet until another day passes.
  await expect(service.scanOverdueReminders()).resolves.toBe(0);
  // The ticket is still overdue; it has only been reminded about.
  await expect(service.get(people.desk, ticket.id)).resolves.toMatchObject({
    overdue: true,
  });
});

test('lets only root change the team, and records who is on it', async ({
  database,
}) => {
  const people = await seedPeople(database);
  const service = createService(database, {
    authz: rootAuthorization(people.root.userId),
  });

  await expect(service.listUsers(people.engineer)).rejects.toMatchObject({
    status: 403,
    reason: 'TEAM_FORBIDDEN',
  });

  const listed = await service.listUsers(people.desk);
  expect(listed).toContainEqual({
    userId: people.engineer.userId,
    name: 'Engineer',
    email: 'user-engineer@example.com',
    role: 'engineer',
  });
  expect(listed).toContainEqual({
    userId: people.desk.userId,
    name: 'Desk',
    email: 'user-desk@example.com',
    role: 'serviceDesk',
  });

  // A team member cannot promote themselves.
  await expect(
    service.setMemberRole(people.desk, people.other.userId, 'engineer'),
  ).rejects.toMatchObject({ status: 403, reason: 'TEAM_FORBIDDEN' });
  await expect(
    service.setMemberRole(people.root, 'missing-user', 'engineer'),
  ).rejects.toMatchObject({ status: 400, reason: 'TEAM_UNKNOWN_USER' });

  await expect(
    service.setMemberRole(people.root, people.other.userId, 'engineer'),
  ).resolves.toContainEqual(
    expect.objectContaining({ userId: people.other.userId, role: 'engineer' }),
  );
  // Root counts as the service desk even without a team row.
  await expect(service.roleOf(people.root)).resolves.toMatchObject({
    role: null,
    isRoot: true,
    isServiceDesk: true,
  });

  await service.setMemberRole(people.root, people.other.userId, null);
  const after = await service.listUsers(people.root);
  expect(after.find((user) => user.userId === people.other.userId)?.role).toBe(
    null,
  );
});

test('links an uploaded screenshot to the ticket and resolves its URL', async ({
  database,
}) => {
  const people = await seedPeople(database);
  const service = createService(database, { publicBasePath: '/main' });
  const now = new Date();
  const fileId = '0f0f0f0f-1111-2222-3333-444444444444';
  await database.repository<TicketFileRow>('itTicketFiles').createOne({
    values: {
      id: fileId,
      ticketId: null,
      uploaderId: people.reporter.userId,
      disk: 'local',
      key: `${fileId}.png`,
      filename: 'screen.png',
      ext: 'png',
      mimeType: 'image/png',
      size: 1024,
      createdAt: now,
      updatedAt: now,
    },
  });

  const ticket = await service.create(people.reporter, {
    title: 'Screen flickers',
    description: 'See the screenshot.',
    urgency: 'low',
    attachmentIds: [fileId],
  });
  expect(ticket.attachments).toEqual([
    {
      id: fileId,
      filename: 'screen.png',
      ext: 'png',
      mimeType: 'image/png',
      size: 1024,
      contentUrl: `/main/uploads/it-tickets/${fileId}.png`,
    },
  ]);
  await expect(
    service.create(people.reporter, {
      title: 'Bad attachment',
      description: 'Not uploaded.',
      urgency: 'low',
      attachmentIds: ['missing-file'],
    }),
  ).rejects.toMatchObject({
    status: 400,
    reason: 'TICKET_INVALID_ATTACHMENT',
  });
});
