import { defineSeed } from '@nocobase/db';
import { demoAccounts } from '../../seed-data/it-tickets-demo.ts';

/**
 * Assigns each demonstration account its repair-request permission set.
 *
 * The assignment is what makes the sample accounts show a different part of
 * the feature: the two employees only reach their own requests, the handler
 * reaches the whole queue. An administrator assigns the same sets to a real
 * colleague from the Users page, so nothing here is the only route to access.
 */
const seed = defineSeed({
  name: '202609240004_it_tickets_demo_assignments',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const account of demoAccounts) {
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username.toLowerCase())
        .executeTakeFirst();
      if (!user) {
        continue;
      }
      const subjectId = String(user.id);
      const id = `user:${subjectId}:${account.permissionSet}`;
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id,
          subjectType: 'user',
          subjectId,
          permissionSetKey: account.permissionSet,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
