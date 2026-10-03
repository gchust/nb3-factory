import { defineSeed, type SeedContext } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * The two isolated reviewers of the project-materials feature, and two example
 * materials owned by the first one.
 *
 * They are ordinary accounts: no permission set is assigned, and neither is an
 * administrator. Sign in with either username and its password to see the
 * isolation the feature promises — the first keeps the materials, while the
 * second reaching the same material or attachment link is refused.
 *
 * | Username            | Password                | Role                           |
 * | ------------------- | ----------------------- | ------------------------------ |
 * | `materials.clerk`   | `Materials-Clerk-2026!` | 资料员甲, owns the materials  |
 * | `materials.peer`    | `Materials-Peer-2026!`  | 同事乙, must see nothing       |
 *
 * The two materials are fictitious and carry a title only; an attachment is
 * added through the upload field, which is the flow the acceptance exercise
 * drives. Writing stored bytes from a seed would have to guess the drive
 * layout, and a seed that guesses wrong leaves a material that cannot preview.
 */
const ACCOUNTS = [
  {
    username: 'materials.clerk',
    name: '资料员甲',
    email: 'materials.clerk@example.invalid',
    password: 'Materials-Clerk-2026!',
  },
  {
    username: 'materials.peer',
    name: '同事乙',
    email: 'materials.peer@example.invalid',
    password: 'Materials-Peer-2026!',
  },
] as const;

const MATERIAL_TITLES = ['现场勘察照片', '施工方案评审纪要'] as const;

type Query = SeedContext['query'];

async function ensureUser(
  query: Query,
  spec: (typeof ACCOUNTS)[number],
): Promise<string> {
  const username = spec.username.toLowerCase();
  const existing = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', username)
    .limit(1)
    .executeTakeFirst<{ id: string }>();
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  const now = new Date();
  await query
    .insertInto('user')
    .values({
      id,
      name: spec.name,
      username,
      email: spec.email.toLowerCase(),
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
      password: await hashPassword(spec.password),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  return id;
}

async function ensureMaterials(query: Query, ownerId: string): Promise<void> {
  const existing = await query
    .selectFrom('projectMaterials')
    .select('id')
    .where('ownerId', '=', ownerId)
    .execute<{ id: string }>();
  if (existing.length > 0) return;

  const now = new Date();
  for (const title of MATERIAL_TITLES) {
    await query
      .insertInto('projectMaterials')
      .values({
        id: crypto.randomUUID(),
        title,
        ownerId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }
}

export default defineSeed({
  name: '202609200002_seed_project_material_examples',
  async run({ query }) {
    // The root bootstrap account is created by the authentication plugin; this
    // seed adds only the two non-administrator reviewers.
    const clerkId = await ensureUser(query, ACCOUNTS[0]);
    await ensureUser(query, ACCOUNTS[1]);
    await ensureMaterials(query, clerkId);
  },
});
