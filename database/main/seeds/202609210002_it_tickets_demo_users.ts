import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';
import { itTicketDemoUsers } from '../../seed-data/demo-users.ts';

/**
 * Creates the isolated demonstration accounts and assigns each of them the
 * permission set for its role.
 *
 * Idempotency is by logical identity: an existing username is reused rather
 * than duplicated, and an assignment row is only inserted when its subject has
 * none for that set. A one-time seed's execution history normally prevents a
 * rerun; the checks keep a partially applied seed safe.
 *
 * The account data is a real relative `...ts` import because a source checkout
 * loads seeds through Node's own resolver, which does not map `...js` onto a
 * TypeScript sibling; the build rewrites the specifier to `.js`.
 */
export default defineSeed({
  name: '202609210002_it_tickets_demo_users',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const demo of itTicketDemoUsers) {
      const username = demo.username.toLowerCase();
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', username)
        .executeTakeFirst();

      let userId = existing ? String(existing.id) : '';
      if (!userId) {
        userId = crypto.randomUUID();
        await query
          .insertInto('user')
          .values({
            id: userId,
            name: demo.name,
            username,
            email: demo.email.toLowerCase(),
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await query
          .insertInto('account')
          .values({
            id: crypto.randomUUID(),
            accountId: userId,
            providerId: 'credential',
            userId,
            password: await hashPassword(demo.password),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }

      const assignmentId = `user:${userId}:${demo.permissionSet}`;
      const existingAssignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (existingAssignment) continue;
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'user',
          subjectId: userId,
          permissionSetKey: demo.permissionSet,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
