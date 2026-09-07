import { randomBytes, scrypt } from 'node:crypto';
import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Preset accounts and role assignments required by the sales application:
 *
 * - sales.a@example.test / sales.b@example.test  (role: sales)
 * - manager@example.test                          (role: sales-manager)
 * - visitor@example.test                          (role: visitor)
 *
 * All preset accounts share the password `Password123!` so a QA agent can
 * sign in with any of them. The seed is idempotent: it looks up each user by
 * email and each role by key before inserting.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609070001_seed_sales_roles',
  async run({ query }) {
    const now = new Date();

    const roleKeys = ['sales', 'sales-manager', 'visitor'] as const;
    const roleNames: Record<(typeof roleKeys)[number], string> = {
      sales: '销售',
      'sales-manager': '销售主管',
      visitor: '访客',
    };

    const roleIdByKey = new Map<string, number>();
    for (const key of roleKeys) {
      const existing = await query
        .selectFrom('roles')
        .select(['id', 'key'])
        .where('key', '=', key)
        .executeTakeFirst();
      if (existing) {
        roleIdByKey.set(key, Number(existing.id));
        continue;
      }
      const inserted = await query
        .insertInto('roles')
        .values({
          key,
          name: roleNames[key],
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      roleIdByKey.set(key, Number(inserted.insertId));
    }

    const accounts: ReadonlyArray<{
      email: string;
      name: string;
      username: string;
      roleKey: (typeof roleKeys)[number];
    }> = [
      {
        email: 'sales.a@example.test',
        name: '销售A',
        username: 'sales.a',
        roleKey: 'sales',
      },
      {
        email: 'sales.b@example.test',
        name: '销售B',
        username: 'sales.b',
        roleKey: 'sales',
      },
      {
        email: 'manager@example.test',
        name: '销售主管',
        username: 'manager',
        roleKey: 'sales-manager',
      },
      {
        email: 'visitor@example.test',
        name: '访客',
        username: 'visitor',
        roleKey: 'visitor',
      },
    ];

    for (const account of accounts) {
      const existingUser = await query
        .selectFrom('user')
        .select('id')
        .where('email', '=', account.email)
        .executeTakeFirst();
      const userId = existingUser
        ? String(existingUser.id)
        : await createUser(query, account, now);

      const roleId = roleIdByKey.get(account.roleKey);
      if (roleId === undefined) {
        throw new Error(`Role ${account.roleKey} was not created.`);
      }

      const existingAssignment = await query
        .selectFrom('userRoles')
        .select('id')
        .where('userId', '=', userId)
        .where('roleId', '=', roleId)
        .executeTakeFirst();
      if (!existingAssignment) {
        await query
          .insertInto('userRoles')
          .values({
            userId,
            roleId,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }
  },
});

async function createUser(
  query: SeedContext['query'],
  account: { email: string; name: string; username: string },
  now: Date,
): Promise<string> {
  const userId = crypto.randomUUID();
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
      issuer: 'local:credential',
      accountId: userId,
      providerId: 'credential',
      userId,
      password: await hashPassword('Password123!'),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  return userId;
}

/**
 * Hashes a password in the same format better-auth uses (`salt:key`, scrypt
 * with N=16384, r=16, p=1, dkLen=64) so the preset accounts can sign in with
 * the credential provider. Implemented with node:crypto to avoid a runtime
 * dependency on the better-auth package from the seed.
 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
  return `${salt}:${key.toString('hex')}`;
}

export default seed;
