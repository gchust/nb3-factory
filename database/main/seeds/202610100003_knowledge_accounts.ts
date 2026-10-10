import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Two isolated accounts for exercising the document permissions, created with
 * the same table shapes Authentication's own default-admin seed uses.
 *
 *   knowledge.supervisor — may read every document and edit title/body
 *   knowledge.colleague   — may read only the public documents
 *
 * The credentials are deliberately well-known test values so the permission
 * story can be checked by hand and in tests. They are not derived from the
 * environment and hold no real user's data. Changing a password through the
 * application is not overwritten: the seed only inserts when absent.
 */
const accounts = [
  {
    username: 'knowledge.supervisor',
    email: 'knowledge.supervisor@example.invalid',
    password: 'KnowledgeSupervisor1!',
    name: '资料主管（测试）',
  },
  {
    username: 'knowledge.colleague',
    email: 'knowledge.colleague@example.invalid',
    password: 'KnowledgeColleague1!',
    name: '资料同事（测试）',
  },
] as const;

export default defineSeed({
  name: '202610100003_knowledge_accounts',
  async run({ query }) {
    for (const account of accounts) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      const now = new Date();
      const userId = crypto.randomUUID();
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
  },
});
