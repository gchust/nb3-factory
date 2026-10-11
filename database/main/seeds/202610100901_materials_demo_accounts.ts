import { randomBytes, randomUUID, scryptSync } from 'node:crypto';

import { defineSeed } from '@nocobase/db';

/**
 * Two isolated test accounts and the two sample materials they own.
 *
 * 资料员甲 (`materials.owner`) owns both sample materials; 普通同事乙 (`materials.colleague`) owns none, so a signed-in
 * colleague finds an empty list and cannot read 甲's records or attachments. Both sign in with the password below,
 * which is also shown on the sign-in page so the credentials are discoverable.
 *
 * The seed is idempotent on the stable business keys (email and title) and is a no-op on a second run.
 */
const DEMO_PASSWORD = 'Materials#2026';

interface UserRow {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface AccountRow {
  readonly id: string;
  readonly accountId: string;
  readonly providerId: string;
  readonly userId: string;
  readonly password: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface MaterialRow {
  readonly id: number;
  readonly title: string;
  readonly ownerId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
const DEMO_ACCOUNTS = [
  {
    name: '资料员甲',
    username: 'materials.owner',
    email: 'materials-owner@example.com',
    ownsSampleMaterials: true,
  },
  {
    name: '普通同事乙',
    username: 'materials.colleague',
    email: 'materials-colleague@example.com',
    ownsSampleMaterials: false,
  },
] as const;
const SAMPLE_MATERIALS = ['朝阳项目立项资料', '海淀改造验收资料'] as const;

export default defineSeed({
  name: '202610100901_materials_demo_accounts',
  async run(context) {
    const users = context.repository<UserRow>('user');
    const accounts = context.repository<AccountRow>('account');
    const materials = context.repository<MaterialRow>('materials');
    const now = new Date();

    for (const demo of DEMO_ACCOUNTS) {
      const existing = await users.findOne({ filter: { email: demo.email } });
      const userId = existing ? existing.id : randomUUID();

      if (!existing) {
        await users.createOne({
          values: {
            id: userId,
            name: demo.name,
            username: demo.username,
            email: demo.email,
            emailVerified: false,
            createdAt: now,
            updatedAt: now,
          },
        });
        await accounts.createOne({
          values: {
            id: randomUUID(),
            accountId: userId,
            providerId: 'credential',
            userId,
            password: hashPassword(DEMO_PASSWORD),
            createdAt: now,
            updatedAt: now,
          },
        });
      } else if (existing.username !== demo.username) {
        // Bring an earlier install's account in line with the username this seed requires.
        await users.updateOne({
          filter: { id: userId },
          values: { username: demo.username, updatedAt: now },
        });
      }

      if (!demo.ownsSampleMaterials) continue;
      for (const title of SAMPLE_MATERIALS) {
        const material = await materials.findOne({
          filter: { title, ownerId: userId },
        });
        if (material) continue;
        await materials.createOne({
          values: { title, ownerId: userId, createdAt: now, updatedAt: now },
        });
      }
    }
  },
});

/**
 * Produce the `salt:hash` shape Better Auth's credential provider verifies: scrypt with N=16384, r=16, p=1 and a
 * 64-byte key, the salt being 16 random bytes rendered as hex.
 */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password.normalize('NFKC'), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${key.toString('hex')}`;
}
