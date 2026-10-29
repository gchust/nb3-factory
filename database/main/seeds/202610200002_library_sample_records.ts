import { hashPassword } from 'better-auth/crypto';
import { defineSeed } from '@nocobase/db';

/**
 * The starting content this application ships with: three fictional documents
 * and the two business accounts that exercise the library's permissions.
 *
 * It is sample data, not required data, so `sample: true` keeps it out of a
 * deployment that installs with `APP_SAMPLE_DATA=false`. The application's
 * configuration enables samples on a fresh install because these accounts and
 * documents are part of what the application is delivered with.
 */
const password = 'library123';

const people = [
  {
    key: 'jia',
    name: '资料员甲',
    username: 'jia',
    email: 'jia@example.com',
    permissionSet: 'library-maintainer',
  },
  {
    key: 'yi',
    name: '阅读者乙',
    username: 'yi_reader',
    email: 'yi@example.com',
    permissionSet: 'library-reader',
  },
] as const;

const documents = [
  {
    id: 'library-sample-public',
    title: '公开资料 P',
    body: '这是面向有资料阅读资格的同事发布的公开资料。',
    published: true,
    confidential: false,
  },
  {
    id: 'library-sample-draft',
    title: '私有草稿 D',
    body: '这是资料员甲的未发布草稿，默认只有甲本人可以查看。管理员可以临时将它开放给阅读者乙。',
    published: false,
    confidential: false,
  },
  {
    id: 'library-sample-confidential',
    title: '保密资料 C',
    body: '这是保密资料，即使管理员误将它共享给阅读者乙，也不会向乙显示正文。',
    published: true,
    confidential: true,
  },
] as const;

export default defineSeed({
  name: '202610200002_library_sample_records',
  sample: true,
  transaction: true,
  async run({ query }) {
    const now = new Date();
    const userIds: Record<string, string> = {};

    for (const person of people) {
      let user = await query
        .selectFrom('user')
        .select('id')
        .where('email', '=', person.email)
        .executeTakeFirst();
      if (!user) {
        const id = crypto.randomUUID();
        const passwordHash = await hashPassword(password);
        await query
          .insertInto('user')
          .values({
            id,
            name: person.name,
            username: person.username,
            email: person.email,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await query
          .insertInto('account')
          .values({
            id: crypto.randomUUID(),
            accountId: id,
            providerId: 'credential',
            userId: id,
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        user = { id };
      }
      const userId = String(user.id);
      userIds[person.key] = userId;

      const assignmentId = `user:${userId}:${person.permissionSet}`;
      const assignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (!assignment) {
        const permissionSet = await query
          .selectFrom('authorizationPermissionSets')
          .select('id')
          .where('key', '=', person.permissionSet)
          .executeTakeFirst();
        if (!permissionSet) {
          throw new Error(
            `The ${person.permissionSet} permission set has not been seeded.`,
          );
        }
        await query
          .insertInto('authorizationPermissionSetAssignments')
          .values({
            id: assignmentId,
            subjectType: 'user',
            subjectId: userId,
            permissionSetKey: person.permissionSet,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }

    const ownerId = userIds.jia;
    for (const document of documents) {
      const existing = await query
        .selectFrom('documents')
        .select('id')
        .where('id', '=', document.id)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('documents')
        .values({
          ...document,
          ownerId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
