import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Demonstration data for the internal document library (资料库).
 *
 * Creates the two business roles as directly assignable permission sets (so the
 * administrator can adjust a person's working permissions from User
 * management), the two fictional accounts (资料员甲 / 阅读者乙), and the three
 * documents P / D / C. Everything is guarded so the seed can run again over an
 * installation that already has the data.
 */

interface SeedUser {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly permissionSet: 'curator' | 'reader';
}

const USERS: readonly SeedUser[] = [
  {
    id: 'material-demo-user-a',
    name: '资料员甲',
    username: 'jia',
    email: 'jia@example.com',
    permissionSet: 'curator',
  },
  {
    id: 'material-demo-user-b',
    name: '阅读者乙',
    username: 'yier',
    email: 'yier@example.com',
    permissionSet: 'reader',
  },
];

const PERMISSION_SETS: readonly { key: string; title: string }[] = [
  { key: 'curator', title: '资料员 (Curator)' },
  { key: 'reader', title: '阅读者 (Reader)' },
];

/** The password handed to both demo accounts, matching the initial administrator. */
const DEMO_PASSWORD = 'admin123';

interface SeedMaterial {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

const MATERIALS: readonly SeedMaterial[] = [
  {
    id: 'material-public-p',
    title: '公开资料 P',
    content:
      '这是公开资料 P 的正文。它已经发布且不保密，向所有具备资料阅读资格的同事开放。',
    published: true,
    confidential: false,
  },
  {
    id: 'material-draft-d',
    title: '私有草稿 D',
    content:
      '这是私有草稿 D 的正文。草稿默认只有负责人甲能查看，需要时可由管理员临时开放给乙。',
    published: false,
    confidential: false,
  },
  {
    id: 'material-confidential-c',
    title: '保密资料 C',
    content:
      '这是保密资料 C 的正文。保密资料不对阅读者开放，即使误给了普通共享资格也不会显示。',
    published: true,
    confidential: true,
  },
];

const OWNER_ID = USERS[0].id;

const seed: SeedDefinition = defineSeed({
  name: '202609100002_seed_material_demo',
  async run({ query }) {
    const now = new Date();

    // Working permissions the administrator assigns from User management.
    for (const permissionSet of PERMISSION_SETS) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: permissionSet.key,
          title: JSON.stringify(permissionSet.title),
          grants: JSON.stringify([]),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // Login-capable accounts. The credential lives in `account`, mirroring the
    // initial-administrator seed, because a seed may not reach the auth service.
    for (const user of USERS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('id', '=', user.id)
        .executeTakeFirst();
      if (!existing) {
        const passwordHash = await hashPassword(DEMO_PASSWORD);
        await query
          .insertInto('user')
          .values({
            id: user.id,
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
            accountId: user.id,
            providerId: 'credential',
            userId: user.id,
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }

      const assignmentId = `user:${user.id}:${user.permissionSet}`;
      const existingAssignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (!existingAssignment) {
        await query
          .insertInto('authorizationPermissionSetAssignments')
          .values({
            id: assignmentId,
            subjectType: 'user',
            subjectId: user.id,
            permissionSetKey: user.permissionSet,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }

    for (const material of MATERIALS) {
      const existing = await query
        .selectFrom('materials')
        .select('id')
        .where('id', '=', material.id)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('materials')
        .values({
          id: material.id,
          title: material.title,
          content: material.content,
          ownerId: OWNER_ID,
          published: material.published,
          confidential: material.confidential,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
