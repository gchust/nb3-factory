import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Two fictional colleagues and the materials the first one maintains.
 *
 * The accounts exist so that isolation can be exercised: 甲 owns both materials and is the only account that may
 * read their attachments; 乙 is a signed-in peer who must not, and neither may an anonymous visitor. Each username
 * is at least three characters, which is the shortest the authentication plugin accepts, and the passwords match the
 * application's documented default so the accounts are usable without out-of-band setup.
 *
 * The seed deliberately ships no attachment bytes. Uploading the images and documents a material points at is the
 * flow under test — a seeded file would sidestep the upload, the separate save, and the ownership boundary those
 * exercise. The identifying values are fixed: both users carry their own id, username and email, and both materials
 * their own id and timestamps, so a re-run against the same database either finds the rows or reproduces exactly them.
 * Only the incidental bookkeeping a credential row needs — its own row id and the record timestamps — is generated.
 */
const OWNER = {
  id: 'aaaaaaaa-0001-4000-8000-000000000001',
  name: 'Jia (Materials Clerk)',
  username: 'jia',
  email: 'jia@example.com',
  password: 'admin123',
} as const;

const PEER = {
  id: 'bbbbbbbb-0002-4000-8000-000000000002',
  name: 'Yi (Colleague)',
  username: 'yi.peer',
  email: 'yi@example.com',
  password: 'admin123',
} as const;

const MATERIALS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Product launch materials',
    createdAt: new Date('2026-01-05T02:00:00.000Z'),
    updatedAt: new Date('2026-01-05T02:00:00.000Z'),
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Project acceptance documents',
    createdAt: new Date('2026-01-06T02:00:00.000Z'),
    updatedAt: new Date('2026-01-06T02:00:00.000Z'),
  },
] as const;

const seed = defineSeed({
  name: '202610120003_seed_materials_accounts',
  async run({ query }) {
    for (const account of [OWNER, PEER]) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      const now = new Date();
      const passwordHash = await hashPassword(account.password);
      await query
        .insertInto('user')
        .values({
          id: account.id,
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
          accountId: account.id,
          providerId: 'credential',
          userId: account.id,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    for (const material of MATERIALS) {
      const existing = await query
        .selectFrom('project_materials')
        .select('id')
        .where('id', '=', material.id)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('project_materials')
        .values({
          id: material.id,
          title: material.title,
          ownerId: OWNER.id,
          createdAt: material.createdAt,
          updatedAt: material.updatedAt,
        })
        .execute();
    }
  },
});

export default seed;
