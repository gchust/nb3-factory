import { defineSeed, type QueryAdapter } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * The document library's fixed starting data: the two library accounts (资料员甲 and 阅读者乙) and the three
 * materials the acceptance scenario names — 公开资料 P (published), 内部草稿 D (unpublished) and 机密资料 C
 * (published but confidential).
 *
 * These are required data, not a sample: the application is delivered with this library already populated, and the
 * scenario is defined in terms of these exact records. The seed only inserts a record that is absent, so running it
 * again after somebody edited a title, changed a role or shared a draft leaves that work untouched.
 *
 * Credentials (documented for whoever operates the application in `database/AGENTS.md`):
 *
 *   资料员甲  username `jia`  password `jia123456`
 *   阅读者乙  username `yiyi` password `yi123456`
 */
const seed = defineSeed({
  name: '202610200002_library_seed',

  async run({ query }) {
    const now = new Date();

    const jiaId = await ensureUser(query, {
      username: 'jia',
      name: '资料员甲',
      email: 'jia@example.com',
      password: 'jia123456',
      now,
    });
    const yiId = await ensureUser(query, {
      username: 'yiyi',
      name: '阅读者乙',
      email: 'yi@example.com',
      password: 'yi123456',
      now,
    });

    // 甲 keeps the library, 乙 only reads.
    await ensureRole(query, jiaId, 'editor', now);
    await ensureRole(query, yiId, 'reader', now);

    // P: published and not confidential, so every library member reads it.
    await ensureMaterial(query, {
      reference: 'material-p',
      title: '公开资料 P',
      body: '这是公开资料 P 的正文。所有资料库成员都可以阅读它。',
      ownerId: jiaId,
      published: true,
      confidential: false,
      now,
    });

    // D: an unpublished draft. Only its owner (and an administrator) sees it until it is shared.
    await ensureMaterial(query, {
      reference: 'material-d',
      title: '内部草稿 D',
      body: '这是内部草稿 D 的正文。默认只有资料员甲本人可以查看。',
      ownerId: jiaId,
      published: false,
      confidential: false,
      now,
    });

    // C: published but confidential. It stays hidden from everyone but its owner and administrators, even when an
    // administrator shares it — confidentiality outranks the share.
    await ensureMaterial(query, {
      reference: 'material-c',
      title: '机密资料 C',
      body: '这是机密资料 C 的正文。即使被临时共享，非管理员也无法查看。',
      ownerId: jiaId,
      published: true,
      confidential: true,
      now,
    });
  },
});

/** Creates the Better Auth user and credential account if the username is free, and returns the user id either way. */
async function ensureUser(
  query: QueryAdapter,
  input: {
    readonly username: string;
    readonly name: string;
    readonly email: string;
    readonly password: string;
    readonly now: Date;
  },
): Promise<string> {
  const existing = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', input.username)
    .executeTakeFirst();
  if (existing) return String(existing.id);

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);
  await query
    .insertInto('user')
    .values({
      id: userId,
      name: input.name,
      username: input.username,
      email: input.email,
      emailVerified: true,
      createdAt: input.now,
      updatedAt: input.now,
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
      createdAt: input.now,
      updatedAt: input.now,
    })
    .execute();
  return userId;
}

/** Gives a user a library work role without touching a role an administrator changed later. */
async function ensureRole(
  query: QueryAdapter,
  userId: string,
  role: 'editor' | 'reader',
  now: Date,
): Promise<void> {
  const existing = await query
    .selectFrom('libraryMemberRoles')
    .select('id')
    .where('userId', '=', userId)
    .executeTakeFirst();
  if (existing) return;
  await query
    .insertInto('libraryMemberRoles')
    .values({ userId, role, createdAt: now, updatedAt: now })
    .execute();
}

/** Inserts a material identified by its stable reference, leaving an existing row (and any edits) alone. */
async function ensureMaterial(
  query: QueryAdapter,
  input: {
    readonly reference: string;
    readonly title: string;
    readonly body: string;
    readonly ownerId: string;
    readonly published: boolean;
    readonly confidential: boolean;
    readonly now: Date;
  },
): Promise<void> {
  const existing = await query
    .selectFrom('materials')
    .select('id')
    .where('reference', '=', input.reference)
    .executeTakeFirst();
  if (existing) return;
  await query
    .insertInto('materials')
    .values({
      id: crypto.randomUUID(),
      reference: input.reference,
      title: input.title,
      body: input.body,
      ownerId: input.ownerId,
      published: input.published,
      confidential: input.confidential,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .execute();
}

export default seed;
