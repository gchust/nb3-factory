import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

import {
  DEMO_BASE_TIME,
  DEMO_PASSWORD,
  DEMO_TICKETS,
  DEMO_USERS,
} from '../../seed-data/it-repair-demo.ts';

/**
 * Provisions the two employee accounts, the handler account and three sample
 * tickets the Issue asks for, and assigns each account its Permission Set.
 *
 * Idempotent: users are keyed by username, tickets by submitter and title, and
 * assignments by their derived id, so a re-run against an existing database
 * inserts nothing.
 */
const seed = defineSeed({
  name: '202609300003_it_repair_demo_data',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const userIds = new Map<string, string>();

    for (const user of DEMO_USERS) {
      const existingUser = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', user.username)
        .executeTakeFirst();
      let userId: string;
      if (existingUser) {
        userId = String(existingUser.id);
      } else {
        await query
          .insertInto('user')
          .values({
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email.toLowerCase(),
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        const created = await query
          .selectFrom('user')
          .select('id')
          .where('username', '=', user.username)
          .executeTakeFirstOrThrow();
        userId = String(created.id);
      }
      userIds.set(user.username, userId);

      const accountId = `account:${userId}`;
      const account = await query
        .selectFrom('account')
        .select('id')
        .where('id', '=', accountId)
        .executeTakeFirst();
      if (!account) {
        await query
          .insertInto('account')
          .values({
            id: accountId,
            accountId: userId,
            providerId: 'credential',
            userId,
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }

      const assignmentId = `user:${userId}:${user.permissionSet}`;
      const assignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (!assignment) {
        await query
          .insertInto('authorizationPermissionSetAssignments')
          .values({
            id: assignmentId,
            subjectType: 'user',
            subjectId: userId,
            permissionSetKey: user.permissionSet,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }

    let index = 0;
    for (const ticket of DEMO_TICKETS) {
      const submittedById = userIds.get(ticket.submittedBy);
      if (!submittedById) continue;
      const existing = await query
        .selectFrom('repairTickets')
        .select('id')
        .where('submittedById', '=', submittedById)
        .where('title', '=', ticket.title)
        .executeTakeFirst();
      if (existing) {
        index += 1;
        continue;
      }
      const submittedByName =
        DEMO_USERS.find((user) => user.username === ticket.submittedBy)?.name ??
        ticket.submittedBy;
      const handledById = ticket.handledBy
        ? userIds.get(ticket.handledBy)
        : undefined;
      const handledByName = ticket.handledBy
        ? DEMO_USERS.find((user) => user.username === ticket.handledBy)?.name
        : undefined;
      await query
        .insertInto('repairTickets')
        .values({
          title: ticket.title,
          category: ticket.category,
          description: ticket.description,
          status: ticket.status,
          resolution: ticket.resolution ?? null,
          submittedById,
          submittedByName,
          handlerId: handledById ?? null,
          handlerName: handledByName ?? null,
          processingAt:
            ticket.status === 'pending' ? null : offsetHours(index, 2),
          completedAt:
            ticket.status === 'completed' ? offsetHours(index, 3) : null,
          createdAt: offsetHours(index, 0),
          updatedAt: offsetHours(index, ticket.status === 'completed' ? 3 : 1),
        })
        .execute();
      index += 1;
    }
  },
});

function offsetHours(index: number, hours: number): Date {
  return new Date(DEMO_BASE_TIME.getTime() + (index * 4 + hours) * 3_600_000);
}

export default seed;
