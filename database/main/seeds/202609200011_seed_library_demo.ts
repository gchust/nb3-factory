import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

type DemoFileKind = 'png' | 'pdf' | 'text' | 'zip';

/**
 * Byte length, extension and content type of each generated sample.
 *
 * A seed must not import application server modules — a relative TypeScript import here fails when
 * the seed is loaded outside the bundler. The values are therefore stated literally, and
 * `tests/logic/library-demo-files.test.ts` asserts they still equal what the generator produces,
 * because the content route uses `size` as the response `Content-Length`.
 */
export const DEMO_FILE_META: Readonly<
  Record<
    DemoFileKind,
    { readonly ext: string; readonly mimeType: string; readonly size: number }
  >
> = {
  png: { ext: 'png', mimeType: 'image/png', size: 39442 },
  pdf: { ext: 'pdf', mimeType: 'application/pdf', size: 1414 },
  text: { ext: 'txt', mimeType: 'text/plain', size: 487 },
  zip: { ext: 'zip', mimeType: 'application/zip', size: 199 },
};

/** Password for the two demo members. They are demonstration accounts, not production users. */
const DEMO_PASSWORD = 'member123';
const DEMO_DISK = 'local';
const BASE_TIME = new Date('2026-09-01T02:00:00.000Z');

const DEMO_MEMBERS = [
  { username: 'limei', name: '李梅', email: 'limei@example.com' },
  { username: 'wangqiang', name: '王强', email: 'wangqiang@example.com' },
] as const;

interface FileSpec {
  readonly key: string;
  readonly filename: string;
  readonly kind: DemoFileKind;
  readonly role: 'cover' | 'attachment';
}

interface MaterialSpec {
  readonly title: string;
  readonly category: string;
  readonly summary: string;
  readonly owner: string;
  readonly borrowable: boolean;
  readonly totalCopies: number;
  readonly visibility: 'all' | 'restricted';
  readonly readers: readonly string[];
  readonly files: readonly FileSpec[];
}

const DEMO_MATERIALS: readonly MaterialSpec[] = [
  {
    title: '团队协作手册',
    category: '工作手册',
    summary: '团队日常协作流程、会议规范与沟通约定。',
    owner: '张敏',
    borrowable: true,
    totalCopies: 3,
    visibility: 'all',
    readers: [],
    files: [
      {
        key: 'library-demo/m1-cover.png',
        filename: '团队协作手册-封面.png',
        kind: 'png',
        role: 'cover',
      },
      {
        key: 'library-demo/m1-handbook.pdf',
        filename: '团队协作手册.pdf',
        kind: 'pdf',
        role: 'attachment',
      },
      {
        key: 'library-demo/m1-notes.txt',
        filename: '协作要点.txt',
        kind: 'text',
        role: 'attachment',
      },
      {
        key: 'library-demo/m1-diagram.png',
        filename: '协作流程图.png',
        kind: 'png',
        role: 'attachment',
      },
    ],
  },
  {
    title: '产品设计规范',
    category: '技术规范',
    summary: '界面与交互设计规范，含配色、间距与组件约定。',
    owner: '李娜',
    borrowable: true,
    totalCopies: 2,
    visibility: 'all',
    readers: [],
    files: [
      {
        key: 'library-demo/m2-cover.png',
        filename: '产品设计规范-封面.png',
        kind: 'png',
        role: 'cover',
      },
      {
        key: 'library-demo/m2-spec.pdf',
        filename: '产品设计规范.pdf',
        kind: 'pdf',
        role: 'attachment',
      },
    ],
  },
  {
    title: '新员工入职指南',
    category: '工作手册',
    summary: '入职第一周需要完成的准备与常见问题。',
    owner: '王强',
    borrowable: true,
    totalCopies: 2,
    visibility: 'all',
    readers: [],
    files: [
      {
        key: 'library-demo/m3-cover.png',
        filename: '新员工入职指南-封面.png',
        kind: 'png',
        role: 'cover',
      },
      {
        key: 'library-demo/m3-guide.txt',
        filename: '入职指南.txt',
        kind: 'text',
        role: 'attachment',
      },
    ],
  },
  {
    title: '季度财务报表模板',
    category: '财务',
    summary: '季度报表的填写口径与模板说明，仅指定成员可读。',
    owner: '陈静',
    borrowable: true,
    totalCopies: 1,
    visibility: 'restricted',
    readers: ['limei'],
    files: [
      {
        key: 'library-demo/m4-cover.png',
        filename: '季度财务报表模板-封面.png',
        kind: 'png',
        role: 'cover',
      },
      {
        key: 'library-demo/m4-template.txt',
        filename: '报表填写说明.txt',
        kind: 'text',
        role: 'attachment',
      },
    ],
  },
  {
    title: '内部审计底稿',
    category: '财务',
    summary: '上一轮内部审计的工作底稿归档记录，不可外借。',
    owner: '陈静',
    borrowable: false,
    totalCopies: 0,
    visibility: 'restricted',
    readers: ['wangqiang'],
    files: [
      {
        key: 'library-demo/m5-cover.png',
        filename: '内部审计底稿-封面.png',
        kind: 'png',
        role: 'cover',
      },
      {
        key: 'library-demo/m5-archive.zip',
        filename: '审计底稿归档.zip',
        kind: 'zip',
        role: 'attachment',
      },
    ],
  },
  {
    title: '信息安全应急预案',
    category: '安全',
    summary: '安全事件的分级、上报路径与处置步骤。',
    owner: '赵磊',
    borrowable: true,
    totalCopies: 2,
    visibility: 'all',
    readers: [],
    files: [
      {
        key: 'library-demo/m6-cover.png',
        filename: '信息安全应急预案-封面.png',
        kind: 'png',
        role: 'cover',
      },
      {
        key: 'library-demo/m6-plan.pdf',
        filename: '信息安全应急预案.pdf',
        kind: 'pdf',
        role: 'attachment',
      },
      {
        key: 'library-demo/m6-checklist.txt',
        filename: '应急处置清单.txt',
        kind: 'text',
        role: 'attachment',
      },
    ],
  },
];

const DEMO_BORROWINGS: readonly {
  title: string;
  username: string;
  status: 'pending' | 'borrowed' | 'returned' | 'cancelled';
}[] = [
  { title: '团队协作手册', username: 'limei', status: 'pending' },
  { title: '产品设计规范', username: 'wangqiang', status: 'borrowed' },
  { title: '新员工入职指南', username: 'limei', status: 'returned' },
  { title: '信息安全应急预案', username: 'wangqiang', status: 'cancelled' },
];

const seed: SeedDefinition = defineSeed({
  name: '202609200011_seed_library_demo',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    for (const table of [
      'materials',
      'material_files',
      'material_readers',
      'material_borrowings',
    ]) {
      if (!(await client.schema.hasTable(table))) return;
    }

    const userIds = new Map<string, string>();
    const userNames = new Map<string, string>();
    for (const member of DEMO_MEMBERS) {
      userIds.set(member.username, await ensureMember(query, member));
      userNames.set(member.username, member.name);
    }

    const admin = await query
      .selectFrom('user')
      .select(['id', 'name'])
      .where('username', '=', 'nocobase')
      .executeTakeFirst();
    const uploader = {
      id: admin && typeof admin.id === 'string' ? admin.id : null,
      name: admin && typeof admin.name === 'string' ? admin.name : null,
    };

    const materialIds = new Map<string, number>();
    const createdMaterials: number[] = [];
    for (const spec of DEMO_MATERIALS) {
      const { id, created } = await ensureMaterial(query, spec);
      materialIds.set(spec.title, id);
      if (created) createdMaterials.push(id);
      await ensureMaterialFiles(query, id, spec, uploader);
      await ensureReaders(query, id, spec, userIds);
    }

    for (const borrowing of DEMO_BORROWINGS) {
      const materialId = materialIds.get(borrowing.title);
      const userId = userIds.get(borrowing.username);
      if (materialId === undefined || userId === undefined) continue;
      await ensureBorrowing(
        query,
        materialId,
        userId,
        userNames.get(borrowing.username) ?? null,
        borrowing.status,
      );
    }

    // Only materials this run created get their stock recomputed, so a re-run never overwrites edits.
    for (const materialId of createdMaterials) {
      await recomputeAvailability(query, materialId);
    }
  },
});

async function ensureMember(
  query: QueryAdapterLike,
  member: { username: string; name: string; email: string },
): Promise<string> {
  const existing = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', member.username)
    .executeTakeFirst();
  if (existing) return String(existing.id);

  const now = new Date();
  const userId = crypto.randomUUID();
  await query
    .insertInto('user')
    .values({
      id: userId,
      name: member.name,
      username: member.username,
      email: member.email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('account')
    .values({
      id: crypto.randomUUID(),
      issuer: 'local:credential',
      accountId: userId,
      providerId: 'credential',
      userId,
      password: await hashPassword(DEMO_PASSWORD),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  return userId;
}

async function ensureMaterial(
  query: QueryAdapterLike,
  spec: MaterialSpec,
): Promise<{ id: number; created: boolean }> {
  const existing = await query
    .selectFrom('materials')
    .select('id')
    .where('title', '=', spec.title)
    .executeTakeFirst();
  if (existing) return { id: Number(existing.id), created: false };

  const result = await query
    .insertInto('materials')
    .values({
      title: spec.title,
      category: spec.category,
      summary: spec.summary,
      owner: spec.owner,
      borrowable: spec.borrowable,
      totalCopies: spec.totalCopies,
      availableCopies: spec.totalCopies,
      visibility: spec.visibility,
      coverFileId: null,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    })
    .execute();
  return { id: Number(result.insertId), created: true };
}

async function ensureMaterialFiles(
  query: QueryAdapterLike,
  materialId: number,
  spec: MaterialSpec,
  uploader: { id: string | null; name: string | null },
): Promise<void> {
  let coverFileId: string | null = null;
  for (const file of spec.files) {
    const meta = DEMO_FILE_META[file.kind];
    const existing = await query
      .selectFrom('materialFiles')
      .select('id')
      .where('key', '=', file.key)
      .executeTakeFirst();
    let fileId: string;
    if (existing) {
      fileId = String(existing.id);
    } else {
      fileId = crypto.randomUUID();
      await query
        .insertInto('materialFiles')
        .values({
          id: fileId,
          disk: DEMO_DISK,
          key: file.key,
          filename: file.filename,
          ext: meta.ext,
          mimeType: meta.mimeType,
          size: meta.size,
          createdAt: BASE_TIME,
          updatedAt: BASE_TIME,
          materialId,
          role: file.role,
          uploaderId: uploader.id,
          uploaderName: uploader.name,
        })
        .execute();
    }
    if (file.role === 'cover') coverFileId = fileId;
  }
  if (coverFileId) {
    await query
      .updateTable('materials')
      .set({ coverFileId, updatedAt: BASE_TIME })
      .where('id', '=', materialId)
      .execute();
  }
}

async function ensureReaders(
  query: QueryAdapterLike,
  materialId: number,
  spec: MaterialSpec,
  userIds: ReadonlyMap<string, string>,
): Promise<void> {
  for (const username of spec.readers) {
    const userId = userIds.get(username);
    if (!userId) continue;
    const existing = await query
      .selectFrom('materialReaders')
      .select('id')
      .where('materialId', '=', materialId)
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (existing) continue;
    await query
      .insertInto('materialReaders')
      .values({ materialId, userId, createdAt: BASE_TIME })
      .execute();
  }
}

async function ensureBorrowing(
  query: QueryAdapterLike,
  materialId: number,
  userId: string,
  borrowerName: string | null,
  status: 'pending' | 'borrowed' | 'returned' | 'cancelled',
): Promise<void> {
  const existing = await query
    .selectFrom('materialBorrowings')
    .select(['id', 'borrowerName'])
    .where('materialId', '=', materialId)
    .where('userId', '=', userId)
    .where('status', '=', status)
    .executeTakeFirst();
  if (existing) {
    // Older seed runs stored no name, which made the borrower show as a raw id.
    if (!existing.borrowerName && borrowerName) {
      await query
        .updateTable('materialBorrowings')
        .set({ borrowerName, updatedAt: BASE_TIME })
        .where('id', '=', existing.id)
        .execute();
    }
    return;
  }

  await query
    .insertInto('materialBorrowings')
    .values({
      materialId,
      userId,
      borrowerName,
      status,
      requestedAt: BASE_TIME,
      borrowedAt:
        status === 'pending' || status === 'cancelled' ? null : BASE_TIME,
      returnedAt: status === 'returned' ? BASE_TIME : null,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    })
    .execute();
}

async function recomputeAvailability(
  query: QueryAdapterLike,
  materialId: number,
): Promise<void> {
  const material = await query
    .selectFrom('materials')
    .select('totalCopies')
    .where('id', '=', materialId)
    .executeTakeFirst();
  if (!material) return;
  const borrowed = await query
    .selectFrom('materialBorrowings')
    .select('id')
    .where('materialId', '=', materialId)
    .where('status', '=', 'borrowed')
    .execute();
  const available = Math.max(0, Number(material.totalCopies) - borrowed.length);
  await query
    .updateTable('materials')
    .set({ availableCopies: available })
    .where('id', '=', materialId)
    .execute();
}

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

/** The subset of the seed's query adapter these helpers use. */
type QueryAdapterLike = Parameters<SeedDefinition['run']>[0]['query'];

export default seed;
