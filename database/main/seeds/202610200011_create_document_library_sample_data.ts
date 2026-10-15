import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * The library's two demonstration accounts and three documents, so a new install has something to open: 资料员甲
 * maintains documents, 阅读者乙 only reads them.
 *
 * The documents deliberately cover the three visibility cases — a published public one every colleague reads, an
 * unpublished draft only its owner (or whoever an administrator shares it with) reads, and a published confidential
 * one that stays with its owner no matter what is shared. Required on every install, so not declared `sample: true`.
 */
const EDITOR_SET = 'document-editor';
const READER_SET = 'document-reader';
const OWNER_NAME = '资料员甲';

interface SeedUser {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly permissionSet: string;
}

const USERS: readonly SeedUser[] = [
  {
    username: 'editor',
    name: OWNER_NAME,
    email: 'editor@example.com',
    permissionSet: EDITOR_SET,
  },
  {
    username: 'reader',
    name: '阅读者乙',
    email: 'reader@example.com',
    permissionSet: READER_SET,
  },
];

const seed = defineSeed({
  name: '202610200011_create_document_library_sample_data',
  async run({ query }) {
    const now = new Date();
    const userIds = new Map<string, string>();

    for (const user of USERS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', user.username)
        .executeTakeFirst();
      if (existing) {
        userIds.set(user.username, String(existing.id));
        continue;
      }
      const userId = crypto.randomUUID();
      const passwordHash = await hashPassword('admin123');
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
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      userIds.set(user.username, userId);
    }

    for (const user of USERS) {
      const userId = userIds.get(user.username);
      if (!userId) {
        continue;
      }
      const assignmentId = `user:${userId}:${user.permissionSet}`;
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'user',
          subjectId: userId,
          permissionSetKey: user.permissionSet,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const ownerId = userIds.get('editor');
    if (!ownerId) {
      return;
    }
    const existingDocuments = await query
      .selectFrom('documents')
      .select('id')
      .where('ownerId', '=', ownerId)
      .executeTakeFirst();
    if (existingDocuments) {
      return;
    }

    await query
      .insertInto('documents')
      .values([
        {
          id: crypto.randomUUID(),
          title: '公司规章制度',
          body: '这是已发布的公开资料，所有同事都可以阅读。',
          ownerId,
          ownerName: OWNER_NAME,
          published: true,
          confidential: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: crypto.randomUUID(),
          title: '下季度工作计划（草稿）',
          body: '这是尚未发布的草稿，只有负责人本人可以查看。',
          ownerId,
          ownerName: OWNER_NAME,
          published: false,
          confidential: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: crypto.randomUUID(),
          title: '薪酬结构说明（保密）',
          body: '这是保密资料，即使共享给其他同事，对方也无法查看内容。',
          ownerId,
          ownerName: OWNER_NAME,
          published: true,
          confidential: true,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();
  },
});

export default seed;
