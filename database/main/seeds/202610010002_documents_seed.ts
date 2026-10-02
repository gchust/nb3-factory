import { defineSeed } from '@nocobase/db';
import { selection } from '@nocobase/authorization/core';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import { hashPassword } from 'better-auth/crypto';

/**
 * Required installation data for the document assistant:
 *
 * - three fictional documents A, B and C. C is supervisor-only.
 * - two permission sets, shown as assignable roles on the Users page.
 * - two isolated test accounts, one per role, so the feature can be reviewed
 *   without touching the administrator account.
 *
 * Everything is idempotent and never overwrites data a person has since edited:
 * a document is inserted only when its id is absent, a set only when its key is
 * absent, an account only when its username is absent.
 *
 * The granted shapes below are written out literally because a seed is
 * installation history: it must keep meaning what it meant when it ran, even
 * after the application's resource declarations move on.
 */

const SUPERVISOR_SET = 'documents-supervisor';
const COLLEAGUE_SET = 'documents-colleague';

const COMPOSITE = 'documents.materials';
const SCOPE = 'materials';

const DOC_A = 'doc-a';
const DOC_B = 'doc-b';
const DOC_C = 'doc-c';

const documents = [
  {
    id: DOC_A,
    title: '蓝鹭设备报修电话 / Blue Heron repair line',
    content: '蓝鹭设备报修电话为 400-000-7316。',
  },
  {
    id: DOC_B,
    title: '蓝鹭设备巡检间隔 / Blue Heron inspection interval',
    content: '蓝鹭设备常规巡检间隔为 45 天。',
  },
  {
    id: DOC_C,
    title: '保密项目内部代号 / Confidential project codename',
    content: '保密项目的内部代号为墨竹 729。',
  },
];

const pageGrant = (id: string) => ({
  resource: { type: 'page', id },
  actions: [{ action: 'access' }],
});

const compositeGrant = (
  action: string,
  value: ReturnType<typeof selection.all>,
) => ({
  resource: { type: 'composite', id: COMPOSITE },
  actions: [
    { action, policy: { type: 'composite', scopes: { [SCOPE]: value } } },
  ],
});

const supervisorSet = definePermissionSet(SUPERVISOR_SET)
  .title('资料主管 / Documents supervisor')
  .grant(
    pageGrant('materials'),
    pageGrant('assistant'),
    compositeGrant('view', selection.all()),
    compositeGrant('manage', selection.all()),
  )
  .build();

const colleagueSet = definePermissionSet(COLLEAGUE_SET)
  .title('资料同事 / Documents colleague')
  .grant(
    pageGrant('materials'),
    pageGrant('assistant'),
    compositeGrant('view', selection.records([DOC_A, DOC_B])),
  )
  .build();

/**
 * Test accounts. The colleague is deliberately limited to documents A and B;
 * the supervisor manages all three.
 */
const testAccounts = [
  {
    username: 'supervisor',
    name: '资料主管 Supervisor',
    email: 'supervisor@example.com',
    password: 'Supervisor123!',
    permissionSet: SUPERVISOR_SET,
  },
  {
    username: 'colleague',
    name: '普通同事 Colleague',
    email: 'colleague@example.com',
    password: 'Colleague123!',
    permissionSet: COLLEAGUE_SET,
  },
];

const seed = defineSeed({
  name: '202610010002_documents_seed',
  transaction: true,
  async run({ query }) {
    const now = new Date();

    for (const document of documents) {
      const existing = await query
        .selectFrom('documents')
        .select('id')
        .where('id', '=', document.id)
        .limit(1)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('documents')
        .values({
          id: document.id,
          title: document.title,
          content: document.content,
        })
        .execute();
    }

    for (const set of [supervisorSet, colleagueSet]) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', set.key)
        .limit(1)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: set.key,
          // Stored as encoded JSON, the representation the Permission Set
          // store reads; a raw string makes startup fail to decode it.
          title: JSON.stringify(set.title ?? set.key),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    for (const account of testAccounts) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username)
        .limit(1)
        .executeTakeFirst();
      let userId = existing ? String(existing.id) : undefined;
      if (!userId) {
        userId = crypto.randomUUID();
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

      const assignmentId = `user:${userId}:${account.permissionSet}`;
      const existingAssignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .limit(1)
        .executeTakeFirst();
      if (existingAssignment) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'user',
          subjectId: userId,
          permissionSetKey: account.permissionSet,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
