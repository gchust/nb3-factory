import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

import {
  MATERIALS_COLLECTION,
  MATERIALS_CONTRIBUTOR_SET,
  MATERIALS_DEFAULT_ACCESS_RULE,
  MATERIALS_READER_SET,
  MATERIALS_RESTRICTION_RULE,
  materialsConfidentialRestriction,
  materialsContributorSet,
  materialsPublishedDefaultAccess,
  materialsReaderSet,
} from '../../../server/materials/authorization.ts';

/**
 * The three fictional materials of Issue #797 and the two accounts that read and
 * maintain them. `P` is open to readers, `D` is a draft nobody but its owner sees
 * until an administrator opens it, and `C` is confidential and never opens.
 */
const DEMO = {
  jia: {
    id: 'materials-user-jia',
    name: '资料员甲',
    username: 'jia',
    email: 'jia@example.com',
  },
  yi: {
    id: 'materials-user-yi',
    name: '阅读者乙',
    username: 'yi',
    email: 'yi@example.com',
  },
  password: 'Materials123!',
  materials: [
    {
      id: 'materials-material-p',
      title: '内部资料 P',
      body: '公开资料：任何登录用户都可以阅读，但只有资料员可以编辑。',
      published: true,
      confidential: false,
    },
    {
      id: 'materials-material-d',
      title: '草稿资料 D',
      body: '草稿：默认只有资料员本人可见，管理员临时授权后阅读者可查看。',
      published: false,
      confidential: false,
    },
    {
      id: 'materials-material-c',
      title: '保密资料 C',
      body: '保密资料：即使被共享给阅读者，阅读者也无法查看其内容。',
      published: false,
      confidential: true,
    },
  ],
} as const;

/**
 * Installation data, not sample data: the permission sets, the two rules and the
 * accounts are what makes the library behave as Issue #797 requires, so a fresh
 * `db apply` installs them without `sample` being enabled.
 *
 * Nothing here is re-applied on a later run. A Permission Set an administrator
 * edits afterwards is theirs; the seed only fills what is absent.
 */
const seed = defineSeed({
  name: '202610200001_materials_install',
  async run({ query }) {
    const now = new Date();
    const demoPassword = await hashPassword(DEMO.password);

    // 1. The two permission sets. `revision` keeps its column default on insert.
    for (const set of [materialsContributorSet, materialsReaderSet]) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: set.key,
          title: JSON.stringify(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // 2. The default access that opens published, non-confidential material to
    //    every signed-in identity.
    const existingDefault = await query
      .selectFrom('authorizationDefaultAccessRules')
      .select('key')
      .where('key', '=', MATERIALS_DEFAULT_ACCESS_RULE)
      .executeTakeFirst();
    if (!existingDefault) {
      await query
        .insertInto('authorizationDefaultAccessRules')
        .values({
          id: crypto.randomUUID(),
          key: materialsPublishedDefaultAccess.key,
          resourceType: materialsPublishedDefaultAccess.resource.type,
          resourceId: materialsPublishedDefaultAccess.resource.id,
          actions: JSON.stringify(materialsPublishedDefaultAccess.actions),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // 3. The restriction that keeps confidential material out of every reader's
    //    reach, and the assignment that makes it apply to every signed-in user.
    const existingRestriction = await query
      .selectFrom('authorizationRestrictionRules')
      .select('id')
      .where('key', '=', MATERIALS_RESTRICTION_RULE)
      .executeTakeFirst();
    if (!existingRestriction) {
      const restrictionId = crypto.randomUUID();
      await query
        .insertInto('authorizationRestrictionRules')
        .values({
          id: restrictionId,
          key: materialsConfidentialRestriction.key,
          title: JSON.stringify(materialsConfidentialRestriction.title),
          resourceType: materialsConfidentialRestriction.resource.type,
          resourceId: materialsConfidentialRestriction.resource.id,
          actions: JSON.stringify(materialsConfidentialRestriction.actions),
          reason: materialsConfidentialRestriction.reason ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('authorizationRestrictionRuleAssignments')
        .values(
          materialsConfidentialRestriction.subjects.map((subject) => ({
            id: crypto.randomUUID(),
            restrictionRuleId: restrictionId,
            subjectType: subject.type,
            subjectId: subject.id,
            createdAt: now,
          })),
        )
        .execute();
    }

    // 4. The two accounts. A disabled account is left disabled on a rerun, and a
    //    credential already present is never rewritten.
    for (const account of [DEMO.jia, DEMO.yi]) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('id', '=', account.id)
        .executeTakeFirst();
      if (existing) continue;
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
          password: demoPassword,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // 5. The assignment of each account to its set.
    for (const [userId, setKey] of [
      [DEMO.jia.id, MATERIALS_CONTRIBUTOR_SET],
      [DEMO.yi.id, MATERIALS_READER_SET],
    ] as const) {
      const assignmentId = `user:${userId}:${setKey}`;
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
          subjectId: userId,
          permissionSetKey: setKey,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // 6. The three materials, owned by 甲.
    for (const material of DEMO.materials) {
      const existing = await query
        .selectFrom(MATERIALS_COLLECTION)
        .select('id')
        .where('id', '=', material.id)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto(MATERIALS_COLLECTION)
        .values({
          id: material.id,
          title: material.title,
          body: material.body,
          ownerId: DEMO.jia.id,
          ownerName: DEMO.jia.name,
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
