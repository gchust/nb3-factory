import { defineSeed, type SeedContext } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * The data the library demonstration needs: two people with the two jobs, and the three documents that show the
 * reading rules. It is written as an ordinary idempotent seed rather than sample data on purpose: the application's
 * verification and preview runs apply seeds with `pnpm nocobase db apply`, which does not set `APP_SAMPLE_DATA`,
 * so a `sample: true` seed would be recorded as skipped and the two test accounts and the three documents the task
 * names would not exist. Every statement checks for the row first, so a second run changes nothing and an
 * administrator's edits are never overwritten.
 *
 * 甲 (`doc_jia`) is the document manager and owns all three documents. 乙 (`doc_yi`) is the reader. The documents are:
 *
 * - 公开资料 P: published and not confidential, so any reader may see it.
 * - 私有草稿 D: a draft, so only its owner sees it until an administrator shares it.
 * - 保密资料 C: confidential, so nobody but its owner may ever see it, share or no share.
 *
 * Both accounts start with the password `Library123`.
 */
const MANAGER = 'library-manager';
const READER = 'library-reader';

const PASSWORD = 'Library123';

interface SeedUser {
  username: string;
  name: string;
  email: string;
  permissionSet: string;
}

const USERS: readonly SeedUser[] = [
  {
    username: 'doc_jia',
    name: '资料员甲',
    email: 'jia@example.com',
    permissionSet: MANAGER,
  },
  {
    username: 'doc_yi',
    name: '阅读者乙',
    email: 'yi@example.com',
    permissionSet: READER,
  },
];

interface SeedDocument {
  title: string;
  body: string;
  published: boolean;
  confidential: boolean;
}

const DOCUMENTS: readonly SeedDocument[] = [
  {
    title: '公开资料 P',
    body: '这是一份已发布的公开资料，所有具备阅读权限的人都可以查看。',
    published: true,
    confidential: false,
  },
  {
    title: '私有草稿 D',
    body: '这是一份尚未发布的草稿，默认只有负责人可以查看；管理员可以临时共享给指定人员，并可随时撤销。',
    published: false,
    confidential: false,
  },
  {
    title: '保密资料 C',
    body: '这是一份保密资料，除负责人外任何人都不可见，也不能被共享。',
    published: false,
    confidential: true,
  },
];

const seed = defineSeed({
  name: '202610100002_library_seed_data',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    const ownerId = await ensureUser(query, USERS[0], now);

    for (const user of USERS) {
      const userId =
        user.username === USERS[0].username
          ? ownerId
          : await ensureUser(query, user, now);
      await ensureAssignment(query, userId, user.permissionSet, now);
    }

    for (const document of DOCUMENTS) {
      const existing = await query
        .selectFrom('documents')
        .select('id')
        .where('title', '=', document.title)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('documents')
        .values({
          id: crypto.randomUUID(),
          title: document.title,
          body: document.body,
          published: document.published,
          confidential: document.confidential,
          ownerId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

/** Creates the account with its credential when it is not there, and answers its id either way. */
async function ensureUser(
  query: SeedContext['query'],
  user: SeedUser,
  now: Date,
): Promise<string> {
  const existing = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', user.username)
    .executeTakeFirst();
  if (existing) return String(existing.id);

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(PASSWORD);
  await query
    .insertInto('user')
    .values({
      id: userId,
      name: user.name,
      username: user.username,
      email: user.email,
      emailVerified: true,
      kind: 'person',
      description: `示例账号，初始密码 ${PASSWORD}`,
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

/** Assigns one Permission Set to one person, once. */
async function ensureAssignment(
  query: SeedContext['query'],
  userId: string,
  permissionSetKey: string,
  now: Date,
): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('subjectType', '=', 'user')
    .where('subjectId', '=', userId)
    .where('permissionSetKey', '=', permissionSetKey)
    .executeTakeFirst();
  if (existing) return;
  await query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id: crypto.randomUUID(),
      subjectType: 'user',
      subjectId: userId,
      permissionSetKey,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

export default seed;
