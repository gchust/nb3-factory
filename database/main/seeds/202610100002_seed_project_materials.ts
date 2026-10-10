import { defineSeed, type SeedContext } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Two isolated demo accounts and two fictional materials owned by the first one.
 *
 * The accounts exist so an application reviewer can sign in as 甲 (`jia`) and as
 * an unrelated colleague 乙 (`yi`) without touching the super admin, and check
 * that 甲's private materials and attachments are invisible to 乙.
 *
 * Only titles are seeded: the File plugin stores attachment bytes on the drive,
 * which a seed cannot write, so attachments are added through the normal upload
 * flow. The seed is idempotent — each account is keyed on its username and each
 * material on its owner plus title — so applying it twice changes nothing.
 */
const DEMO_PASSWORD = 'Demo123456';

const demoUsers = [
  {
    username: 'jia',
    name: '甲 (Project Maintainer)',
    email: 'jia@example.com',
  },
  { username: 'yi', name: '乙 (Colleague)', email: 'yi@example.com' },
] as const;

const demoMaterials = [
  { ownerUsername: 'jia', title: 'Apollo 项目启动资料' },
  { ownerUsername: 'jia', title: 'Apollo 需求评审纪要' },
] as const;

type Query = SeedContext['query'];

async function ensureUser(
  query: Query,
  user: (typeof demoUsers)[number],
): Promise<string> {
  const existing = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', user.username)
    .executeTakeFirst<{ id: string }>();
  if (existing) return existing.id;

  const now = new Date();
  const userId = crypto.randomUUID();
  const password = await hashPassword(DEMO_PASSWORD);
  await query
    .insertInto('user')
    .values({
      id: userId,
      name: user.name,
      username: user.username,
      email: user.email,
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
  return userId;
}

export default defineSeed({
  name: '202610100002_seed_project_materials',
  async run({ query }) {
    const ownerIds = new Map<string, string>();
    for (const user of demoUsers) {
      ownerIds.set(user.username, await ensureUser(query, user));
    }

    const now = new Date();
    for (const material of demoMaterials) {
      const ownerId = ownerIds.get(material.ownerUsername);
      if (!ownerId) continue;
      const existing = await query
        .selectFrom('projectMaterials')
        .select('id')
        .where('ownerId', '=', ownerId)
        .where('title', '=', material.title)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('projectMaterials')
        .values({
          title: material.title,
          ownerId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
