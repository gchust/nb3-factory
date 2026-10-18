import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Demo data for the IT service desk.
 *
 * This is a *required* seed rather than a `sample: true` one on purpose. The deployment and verification path runs
 * `nocobase db apply` only, which applies required seeds and skips sample ones, and this application has to arrive
 * with the accounts and tickets the business asked for so the roles and the dashboard can be exercised immediately.
 * See `docs/it-service-desk.md`. It is guarded on an empty `tickets` table and never overwrites existing rows.
 */
const seed = defineSeed({
  name: '202610140002_it_service_desk_demo_data',
  async run({ query }) {
    const existing = await query
      .selectFrom('tickets')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existing) return;

    const now = Date.now();
    const at = (offsetMs: number) => new Date(now - offsetMs).toISOString();
    const hour = 60 * 60 * 1000;

    const passwordHash = await hashPassword('admin123');

    const users = [
      {
        id: 'demo-user-servicedesk',
        name: 'Service Desk',
        username: 'servicedesk',
        email: 'servicedesk@example.com',
        role: 'it-service-desk',
      },
      {
        id: 'demo-user-engineer1',
        name: 'Engineer One',
        username: 'engineer1',
        email: 'engineer1@example.com',
        role: 'it-engineer',
      },
      {
        id: 'demo-user-engineer2',
        name: 'Engineer Two',
        username: 'engineer2',
        email: 'engineer2@example.com',
        role: 'it-engineer',
      },
      {
        id: 'demo-user-employee1',
        name: 'Employee One',
        username: 'employee1',
        email: 'employee1@example.com',
        role: null,
      },
    ] as const;

    for (const user of users) {
      const existingUser = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', user.username)
        .executeTakeFirst();
      if (existingUser) continue;
      const createdAt = new Date(now);
      await query
        .insertInto('user')
        .values({
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          emailVerified: true,
          createdAt,
          updatedAt: createdAt,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: crypto.randomUUID(),
          accountId: user.id,
          providerId: 'credential',
          userId: user.id,
          password: passwordHash,
          createdAt,
          updatedAt: createdAt,
        })
        .execute();
    }

    const permissionSets = [
      { key: 'it-engineer', title: 'IT engineer' },
      { key: 'it-service-desk', title: 'IT service desk' },
    ];
    for (const set of permissionSets) {
      const existingSet = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (existingSet) continue;
      const createdAt = new Date(now);
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: set.key,
          title: JSON.stringify(set.title),
          grants: JSON.stringify([]),
          createdAt,
          updatedAt: createdAt,
        })
        .execute();
    }

    for (const user of users) {
      if (!user.role) continue;
      const assignmentId = `user:${user.id}:${user.role}`;
      const existingAssignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (existingAssignment) continue;
      const createdAt = new Date(now);
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'user',
          subjectId: user.id,
          permissionSetKey: user.role,
          createdAt,
          updatedAt: createdAt,
        })
        .execute();
    }

    const reporter = 'demo-user-employee1';
    const tickets = [
      {
        title: 'Laptop will not power on',
        description:
          'My laptop does not start after the power outage this morning.',
        urgency: 'urgent',
        reporterId: reporter,
        assigneeId: null,
        handlingNote: null,
        solution: null,
        status: 'pending',
        statusChangedAt: at(1 * hour),
        assignedAt: null,
        resolvedAt: null,
        closedAt: null,
        returnedCount: 0,
        lastReturnReason: null,
        remindedAt: null,
        createdAt: at(1 * hour),
        updatedAt: at(1 * hour),
      },
      {
        title: 'VPN keeps disconnecting',
        description: 'The VPN drops every few minutes from the office network.',
        urgency: 'normal',
        reporterId: reporter,
        assigneeId: 'demo-user-engineer1',
        handlingNote: 'Checking the VPN gateway logs.',
        solution: null,
        status: 'processing',
        statusChangedAt: at(3 * hour),
        assignedAt: at(2 * hour),
        resolvedAt: null,
        closedAt: null,
        returnedCount: 0,
        lastReturnReason: null,
        remindedAt: null,
        createdAt: at(3 * hour),
        updatedAt: at(3 * hour),
      },
      {
        title: 'Shared drive permission denied',
        description: 'I cannot open the finance shared folder.',
        urgency: 'critical',
        reporterId: reporter,
        assigneeId: 'demo-user-engineer2',
        handlingNote: 'Waiting for the file server team to fix the ACL.',
        solution: null,
        status: 'processing',
        statusChangedAt: at(26 * hour),
        assignedAt: at(26 * hour),
        resolvedAt: null,
        closedAt: null,
        returnedCount: 0,
        lastReturnReason: null,
        remindedAt: null,
        createdAt: at(30 * hour),
        updatedAt: at(26 * hour),
      },
      {
        title: 'Second monitor flickers',
        description: 'The second monitor flickers when scrolling.',
        urgency: 'normal',
        reporterId: reporter,
        assigneeId: 'demo-user-engineer1',
        handlingNote: 'Reproduced with the spare cable.',
        solution: 'Replaced the DisplayPort cable.',
        status: 'resolved',
        statusChangedAt: at(4 * hour),
        assignedAt: at(10 * hour),
        resolvedAt: at(4 * hour),
        closedAt: null,
        returnedCount: 0,
        lastReturnReason: null,
        remindedAt: null,
        createdAt: at(12 * hour),
        updatedAt: at(4 * hour),
      },
    ];

    for (const ticket of tickets) {
      await query
        .insertInto('tickets')
        .values({
          ...ticket,
          attachmentIds: null,
        })
        .execute();
    }
  },
});

export default seed;
