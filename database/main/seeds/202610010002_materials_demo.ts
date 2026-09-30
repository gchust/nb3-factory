import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

import { materialsPermissionSets } from '../../seed-data/permission-sets.ts';

const SEED_NAME = '202610010002_materials_demo';

interface DemoAccount {
  readonly id: string;
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly permissionSet: string;
}

/**
 * Two isolated accounts the requirement asks for: a service-team supervisor and
 * a regular colleague. The colleague is the account that must be unable to see
 * or ask about confidential material.
 */
const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    username: 'supervisor',
    name: '资料主管',
    email: 'materials.supervisor@example.com',
    password: 'supervisor123',
    permissionSet: 'materials-supervisor',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    username: 'colleague',
    name: '资料同事',
    email: 'materials.colleague@example.com',
    password: 'colleague123',
    permissionSet: 'materials-colleague',
  },
];

/**
 * Demo material records. `confidential: true` is the third material the
 * colleague must not read or retrieve through the assistant.
 */
const DEMO_MATERIALS: readonly {
  readonly title: string;
  readonly body: string;
  readonly confidential: boolean;
}[] = [
  {
    title: '蓝鹭设备报修方式',
    body: '蓝鹭设备报修电话为 400-000-7316，工作日 9:00 至 18:00 可直接拨打报修。',
    confidential: false,
  },
  {
    title: '蓝鹭设备巡检周期',
    body: '蓝鹭设备常规巡检间隔为 45 天，巡检记录需留档备查。',
    confidential: false,
  },
  {
    title: '保密项目内部代号',
    body: '保密项目的内部代号为墨竹 729，仅主管及以上人员可查阅。',
    confidential: true,
  },
];

const seed = defineSeed({
  name: SEED_NAME,
  transaction: true,
  async run({ query }) {
    // 1. Material records. Skipped when the collection already holds rows so a
    //    rerun never duplicates an administrator's data.
    const existingMaterial = await query
      .selectFrom('materials')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (!existingMaterial) {
      const now = new Date();
      await query
        .insertInto('materials')
        .values(
          DEMO_MATERIALS.map((material) => ({
            title: material.title,
            body: material.body,
            confidential: material.confidential,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .execute();
    }

    // 2. Demo accounts. Created individually so a missing one is repaired
    //    without touching an existing one.
    for (const account of DEMO_ACCOUNTS) {
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

    // 3. Permission sets. An existing definition is preserved: an administrator
    //    may have edited the grants after installation.
    for (const permissionSet of materialsPermissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      const now = new Date();
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: permissionSet.key,
          key: permissionSet.key,
          title: encodeAuthorizationTitle(permissionSet.title),
          grants: JSON.stringify(permissionSet.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // 4. Assign each demo account its job. Assignments are matched on their
    //    logical identity so a manual grant of another set is left alone.
    for (const account of DEMO_ACCOUNTS) {
      const assignmentId = `user:${account.id}:${account.permissionSet}`;
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      const now = new Date();
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'user',
          subjectId: account.id,
          permissionSetKey: account.permissionSet,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
