import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Demonstration accounts for the delivery workflow. Every account is created
 * only when its username is absent, so the seed is safe to run repeatedly and
 * never overwrites a password an administrator has since changed.
 *
 * The shared password is a demo credential for fictional users, not a secret.
 */
const DEMO_PASSWORD = 'Demo@12345';

const DEMO_USERS: readonly { username: string; name: string }[] = [
  { username: 'zhangwei', name: '张伟' },
  { username: 'lina', name: '李娜' },
  { username: 'wangfang', name: '王芳' },
  { username: 'liuyang', name: '刘洋' },
  { username: 'zhaolei', name: '赵磊' },
  { username: 'sunqi', name: '孙琪' },
  { username: 'chenjing', name: '陈静' },
  { username: 'zhoumin', name: '周敏' },
];

const seed: SeedDefinition = defineSeed({
  name: '202609190001_seed_delivery_demo_users',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('user'))) return;
    if (!(await client.schema.hasTable('account'))) return;

    for (const user of DEMO_USERS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', user.username)
        .executeTakeFirst();
      if (existing) continue;

      const now = new Date();
      const userId = randomUUID();
      await query
        .insertInto('user')
        .values({
          id: userId,
          name: user.name,
          username: user.username,
          email: `${user.username}@example.com`,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: randomUUID(),
          issuer: 'local:credential',
          accountId: userId,
          providerId: 'credential',
          userId,
          password: await hashPassword(DEMO_PASSWORD),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
