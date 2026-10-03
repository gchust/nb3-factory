import { defineSeed } from '@nocobase/db';
import type { SeedDefinition } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Two isolated test accounts and the permission sets that separate them.
 *
 * `supervisor` may read and maintain every document. `colleague` may read only
 * the `public` documents: `server/providers/documents.ts` inspects this
 * assignment on every request, so the limit is enforced server-side rather than
 * by hiding UI.
 *
 * Test credentials (development only):
 *   supervisor / Supervisor123
 *   colleague  / Colleague123
 */
const seed: SeedDefinition = defineSeed({
  name: '20261003090002_document_assistant_accounts',
  async run({ query }) {
    const now = new Date();

    const accounts = [
      {
        username: 'supervisor',
        name: 'Document Supervisor',
        email: 'supervisor@example.com',
        password: 'Supervisor123',
        permissionSet: 'supervisor',
        title: JSON.stringify('Supervisor'),
      },
      {
        username: 'colleague',
        name: 'Regular Colleague',
        email: 'colleague@example.com',
        password: 'Colleague123',
        permissionSet: 'colleague',
        title: JSON.stringify('Colleague'),
      },
    ];

    for (const account of accounts) {
      const existingSet = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', account.permissionSet)
        .executeTakeFirst();
      if (!existingSet) {
        await query
          .insertInto('authorizationPermissionSets')
          .values({
            id: crypto.randomUUID(),
            key: account.permissionSet,
            title: account.title,
            // Access is decided in application code from the assignment, not
            // from a grant list, so the set carries no grants.
            grants: JSON.stringify([]),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }

      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username)
        .limit(1)
        .executeTakeFirst();

      let userId = user ? String(user.id) : undefined;
      if (!userId) {
        userId = crypto.randomUUID();
        await query
          .insertInto('user')
          .values({
            id: userId,
            name: account.name,
            username: account.username,
            email: account.email.toLowerCase(),
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
            password: await hashPassword(account.password),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }

      const assignmentId = `user:${userId}:${account.permissionSet}`;
      const existingAssignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (!existingAssignment) {
        await query
          .insertInto('authorizationPermissionSetAssignments')
          .values({
            id: assignmentId,
            subjectType: 'user',
            subjectId: userId,
            permissionSetKey: account.permissionSet,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }
  },
});

export default seed;
