import { defineSeed, type QueryAdapter } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Installation data for "项目资料与私有附件".
 *
 * Two isolated test accounts (甲 and 乙) and two fictional materials owned by
 * 甲. The accounts are written here because the requirement asks the
 * application to prepare them; the browser test needs a second identity that
 * is not the administrator to prove the private attachment boundary.
 *
 * Every insert is guarded by a lookup on a stable natural key, so the same
 * seed is safe to run against a fresh database, against a database that
 * already carries the admin user (the normal case), and a second time after
 * its history record is gone. Accounts insert their `user` and `account` rows
 * with the same shape the authentication plugin's default-admin seed uses,
 * because a credential account is what the sign-in endpoint reads.
 *
 * The attachments themselves are deliberately not seeded: the review samples
 * (PNG, DOCX, corrupt PNG) are supplied by the deterministic test preparation
 * and are only meaningful once uploaded through the real UI.
 */
const TEST_ACCOUNTS = [
  {
    name: '甲',
    // Three characters minimum: the authentication plugin rejects shorter
    // usernames before it ever checks the password.
    username: 'jia01',
    email: 'jia@example.com',
    // Kept identical to the default administrator password so the prepared
    // account is usable by whoever picks the database up next.
    password: 'admin123',
  },
  {
    name: '乙',
    username: 'yi01',
    email: 'yi@example.com',
    password: 'admin123',
  },
] as const;

const DEMO_MATERIALS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: '施工现场照片记录（示例）',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    title: '项目验收文档（示例）',
  },
] as const;

/** Returns the existing user id for the username, creating the account if absent. */
async function ensureAccount(
  query: QueryAdapter,
  account: (typeof TEST_ACCOUNTS)[number],
): Promise<string> {
  const existing = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', account.username)
    .executeTakeFirst();
  const existingId: unknown = existing?.id;
  if (typeof existingId === 'string' && existingId) return existingId;

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
  return userId;
}

const seed = defineSeed({
  name: '202609280001_seed_project_materials',
  async run(context) {
    const ownerId = await ensureAccount(context.query, TEST_ACCOUNTS[0]);
    await ensureAccount(context.query, TEST_ACCOUNTS[1]);

    const materials = context.repository<{
      id: string;
      title: string;
      ownerId: string;
      createdAt: Date | string;
      updatedAt: Date | string;
    }>('projectMaterials');

    for (const material of DEMO_MATERIALS) {
      if (await materials.exists({ filter: { id: material.id } })) continue;
      const now = new Date();
      await materials.createOne({
        values: {
          id: material.id,
          title: material.title,
          ownerId,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});

export default seed;
