import { hashPassword } from 'better-auth/crypto';
import { defineSeed } from '@nocobase/db';

/**
 * Fictional demonstration accounts and their initial IT responsibility.
 *
 * These fixtures are self-contained for the same reason the permission-set
 * seed is: the database task loader imports a seed with native ESM, which
 * does not rewrite a relative `.js` specifier to the `.ts` source. The two
 * keys below are the ones `202610010010_it_permission_sets` installs.
 */
const IT_EMPLOYEE_SET = 'it-employee';
const IT_HANDLER_SET = 'it-handler';

/**
 * Every account is created only when its username is absent, and an
 * assignment is inserted only when the exact subject/set pair is missing, so
 * re-running neither duplicates users nor restores an assignment an
 * administrator removed.
 */
export const DEMO_PASSWORD = 'Demo#12345';

interface DemoAccount {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly permissionSet: string;
}

const ACCOUNTS: readonly DemoAccount[] = [
  {
    username: 'zhangwei',
    name: 'Zhang Wei',
    email: 'zhangwei@example.com',
    permissionSet: IT_EMPLOYEE_SET,
  },
  {
    username: 'liuyang',
    name: 'Liu Yang',
    email: 'liuyang@example.com',
    permissionSet: IT_EMPLOYEE_SET,
  },
  {
    username: 'chenhao',
    name: 'Chen Hao',
    email: 'chenhao@example.com',
    permissionSet: IT_HANDLER_SET,
  },
];

export default defineSeed({
  name: '202610010020_it_demo_accounts',
  transaction: true,
  async run({ query }) {
    const now = new Date();

    for (const account of ACCOUNTS) {
      let user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username)
        .executeTakeFirst();

      if (!user) {
        const userId = crypto.randomUUID();
        const password = await hashPassword(DEMO_PASSWORD);
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
            password,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        user = { id: userId };
      }

      const subjectId = String(user.id);
      const assignmentId = `user:${subjectId}:${account.permissionSet}`;
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
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
