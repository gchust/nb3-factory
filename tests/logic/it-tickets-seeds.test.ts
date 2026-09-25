// @vitest-environment node

import type { SeedContext } from '@nocobase/db';
import { verifyPassword } from 'better-auth/crypto';
import { afterEach, describe, expect, it } from 'vitest';

import createPermissionSetsSeed from '../../database/main/seeds/202609300003_it_tickets_create_permission_sets.js';
import createSampleTicketsSeed from '../../database/main/seeds/202609300004_it_tickets_create_sample_tickets.js';
import createSampleUsersSeed from '../../database/main/seeds/202609300002_it_tickets_create_sample_users.js';
import {
  IT_TICKET_EMPLOYEE_SET,
  IT_TICKET_HANDLER_SET,
  SAMPLE_EMPLOYEE_USERNAMES,
  SAMPLE_HANDLER_USERNAME,
} from '../../server/providers/it-tickets-constants.js';
import type { ItTicketTestDatabase } from '../fixtures/it-tickets-database.js';
import { createItTicketTestDatabase } from '../fixtures/it-tickets-database.js';

const SAMPLE_PASSWORD = 'admin123';

describe('IT ticket sample seeds', () => {
  let context: ItTicketTestDatabase | undefined;

  afterEach(async () => {
    await context?.dispose();
    context = undefined;
  });

  it('creates the two sample roles, three accounts and three tickets', async () => {
    context = await createItTicketTestDatabase();
    await runSeeds(context);

    const users = await context.query
      .selectFrom('user')
      .select(['username', 'name'])
      .orderBy('username', 'asc')
      .execute<{ username: string; name: string }>();
    expect(users.map((user) => user.username)).toEqual(
      [...SAMPLE_EMPLOYEE_USERNAMES, SAMPLE_HANDLER_USERNAME].sort(),
    );

    // The password is the one the factory provisions, stored hashed.
    const accounts = await context.query
      .selectFrom('account')
      .select('password')
      .execute<{ password: string }>();
    expect(accounts).toHaveLength(3);
    for (const account of accounts) {
      expect(account.password).not.toBe(SAMPLE_PASSWORD);
      await expect(
        verifyPassword({ hash: account.password, password: SAMPLE_PASSWORD }),
      ).resolves.toBe(true);
    }

    const sets = await context.query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'title'])
      .orderBy('key', 'asc')
      .execute<{ key: string; title: string }>();
    expect(sets.map((set) => set.key)).toEqual([
      IT_TICKET_EMPLOYEE_SET,
      IT_TICKET_HANDLER_SET,
    ]);
    // Titles carry a namespace descriptor so the Users page can translate them.
    for (const set of sets) {
      expect(JSON.parse(set.title)).toMatchObject({ ns: 'nb3-factory' });
    }

    const assignments = await context.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['subjectType', 'permissionSetKey'])
      .execute<{ subjectType: string; permissionSetKey: string }>();
    expect(assignments).toHaveLength(3);
    expect(
      assignments.every((assignment) => assignment.subjectType === 'user'),
    ).toBe(true);

    const tickets = await context.query
      .selectFrom('itTickets')
      .select(['title', 'status', 'handlerId', 'resolutionNote'])
      .execute<{
        title: string;
        status: string;
        handlerId: string | null;
        resolutionNote: string | null;
      }>();
    expect(tickets).toHaveLength(3);
    expect(tickets.map((ticket) => ticket.status).sort()).toEqual([
      'completed',
      'in-progress',
      'pending',
    ]);
    const completed = tickets.find((ticket) => ticket.status === 'completed');
    expect(completed?.resolutionNote).toBeTruthy();
    const pending = tickets.find((ticket) => ticket.status === 'pending');
    expect(pending?.handlerId).toBeNull();

    // Employees hold the employee role, the handler holds the handler role.
    const handler = await context.query
      .selectFrom('user')
      .select('id')
      .where('username', '=', SAMPLE_HANDLER_USERNAME)
      .executeTakeFirstOrThrow<{ id: string }>();
    const handlerAssignment = assignments.filter(
      (assignment) => assignment.permissionSetKey === IT_TICKET_HANDLER_SET,
    );
    expect(handlerAssignment).toHaveLength(1);
    const assignmentIds = await context.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .execute<{ id: string }>();
    expect(assignmentIds.map((row) => row.id)).toContain(
      `user:${handler.id}:${IT_TICKET_HANDLER_SET}`,
    );
  });

  it('changes nothing when it runs a second time', async () => {
    context = await createItTicketTestDatabase();
    await runSeeds(context);
    const before = await snapshot(context);

    await runSeeds(context);
    const after = await snapshot(context);

    expect(after).toEqual(before);
  });

  it('creates its samples without touching data somebody already has', async () => {
    context = await createItTicketTestDatabase();
    // An unrelated account, a role somebody renamed, and an IT ticket somebody
    // already edited — all present before the seeds run.
    await context.query
      .insertInto('user')
      .values({
        id: 'existing-admin',
        name: 'Existing Admin',
        username: 'nocobase',
        email: 'admin@example.com',
        emailVerified: true,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      })
      .execute();
    await context.query
      .insertInto('authorizationPermissionSets')
      .values({
        id: 'existing-handler-set',
        key: IT_TICKET_HANDLER_SET,
        title: 'Custom handler title',
        grants: JSON.stringify([]),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      })
      .execute();
    await context.query
      .insertInto('itTickets')
      .values({
        title: 'Unable to connect to the office VPN',
        category: 'computer',
        description: 'Edited by a user after installation.',
        submitterId: 'existing-admin',
        handlerId: null,
        status: 'completed',
        resolutionNote: 'Something the user typed.',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
        updatedAt: new Date('2026-08-02T00:00:00.000Z'),
      })
      .execute();

    await runSeeds(context);

    const admin = await context.query
      .selectFrom('user')
      .select('name')
      .where('id', '=', 'existing-admin')
      .executeTakeFirstOrThrow<{ name: string }>();
    expect(admin.name).toBe('Existing Admin');

    const set = await context.query
      .selectFrom('authorizationPermissionSets')
      .select('title')
      .where('key', '=', IT_TICKET_HANDLER_SET)
      .executeTakeFirstOrThrow<{ title: string }>();
    expect(set.title).toBe('Custom handler title');

    // The edited ticket survives; the other two samples are added; no duplicate.
    const tickets = await context.query
      .selectFrom('itTickets')
      .select(['title', 'description', 'status', 'resolutionNote'])
      .execute<{
        title: string;
        description: string | null;
        status: string;
        resolutionNote: string | null;
      }>();
    expect(tickets).toHaveLength(3);
    const vpn = tickets.filter(
      (ticket) => ticket.title === 'Unable to connect to the office VPN',
    );
    expect(vpn).toHaveLength(1);
    expect(vpn[0]).toMatchObject({
      description: 'Edited by a user after installation.',
      status: 'completed',
      resolutionNote: 'Something the user typed.',
    });
    // The custom set did not stop the assignment from being created.
    const handlerAssignments = await context.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('permissionSetKey', '=', IT_TICKET_HANDLER_SET)
      .execute();
    expect(handlerAssignments).toHaveLength(1);
  });
});

async function runSeeds(context: ItTicketTestDatabase): Promise<void> {
  const seedContext = {
    query: context.query,
    config: {
      get: (key: string) =>
        key === 'users.initialAdmin'
          ? { password: SAMPLE_PASSWORD }
          : undefined,
    },
  } as unknown as SeedContext;

  await createSampleUsersSeed.run(seedContext);
  await createPermissionSetsSeed.run(seedContext);
  await createSampleTicketsSeed.run(seedContext);
}

async function snapshot(
  context: ItTicketTestDatabase,
): Promise<Record<string, unknown>> {
  const [users, sets, assignments, tickets] = await Promise.all([
    context.query
      .selectFrom('user')
      .select(['id', 'username', 'name', 'email'])
      .orderBy('id', 'asc')
      .execute(),
    context.query
      .selectFrom('authorizationPermissionSets')
      .select(['id', 'key', 'title'])
      .orderBy('id', 'asc')
      .execute(),
    context.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['id', 'permissionSetKey'])
      .orderBy('id', 'asc')
      .execute(),
    context.query
      .selectFrom('itTickets')
      .select(['id', 'title', 'status', 'submitterId', 'handlerId'])
      .orderBy('id', 'asc')
      .execute(),
  ]);

  return { users, sets, assignments, tickets };
}
