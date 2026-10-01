import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Two isolated test accounts for the reference-material walkthrough: a
 * supervisor who may read and edit everything, and a colleague who may read
 * only the public materials. They are ordinary application users seeded once,
 * so a fresh installation already has both roles without hand configuration.
 */
const ACCOUNTS = [
  {
    username: 'supervisor',
    name: '主管',
    email: 'supervisor@example.com',
    password: 'supervisor123',
    permissionSet: 'materials-supervisor',
  },
  {
    username: 'colleague',
    name: '同事',
    email: 'colleague@example.com',
    password: 'colleague123',
    permissionSet: 'materials-colleague',
  },
];

const seed = defineSeed({
  name: '202610010103_seed_material_test_accounts',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const account of ACCOUNTS) {
      let userId: string | undefined;
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username)
        .executeTakeFirst();
      if (existing) {
        userId = String(existing.id);
      } else {
        userId = crypto.randomUUID();
        const passwordHash = await hashPassword(account.password);
        await query
          .insertInto('user')
          .values({
            id: userId,
            name: account.name,
            username: account.username,
            email: account.email,
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
            password: passwordHash,
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
      if (existingAssignment) continue;
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
  },
});

export default seed;
