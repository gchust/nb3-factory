import { defineSeed, type QueryAdapter } from '@nocobase/db';

/**
 * The three fictional materials that make the feature's behaviour visible: a published one every reader may see
 * (公开资料 P), a draft only its owner sees until an administrator opens it (私有草稿 D), and a confidential one no
 * reader ever sees (保密资料 C).
 *
 * They belong to 资料员甲. A row that already exists — matched by owner and title — is left untouched, so a body an
 * administrator later edits is never reset.
 */
const seed = defineSeed({
  name: '202610070020_materials_sample_records',
  transaction: true,
  async run({ query }) {
    const owner = await ownerId(query);
    if (!owner) {
      return;
    }
    const now = new Date();
    const records = [
      {
        title: '公开资料 P',
        body: '这是一份已经发布且不保密的公开资料，具备阅读资格的同事都可以查看。',
        published: true,
        confidential: false,
      },
      {
        title: '私有草稿 D',
        body: '这是一份尚未发布的草稿，默认只有负责人甲可以查看；管理员可以临时开放给指定的阅读者。',
        published: false,
        confidential: false,
      },
      {
        title: '保密资料 C',
        body: '这是一份保密资料，仅负责人甲可以查看；即使管理员误将共享资格授予他人，阅读者也看不到正文。',
        published: true,
        confidential: true,
      },
    ] as const;
    for (const material of records) {
      const existing = await query
        .selectFrom('materials')
        .select('id')
        .where('ownerId', '=', owner)
        .where('title', '=', material.title)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('materials')
        .values({
          title: material.title,
          body: material.body,
          ownerId: owner,
          published: material.published,
          confidential: material.confidential,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

/** The seed reads through a raw query builder, so an id comes back untyped; only a string or number is usable. */
function idOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

async function ownerId(query: QueryAdapter): Promise<string | undefined> {
  const row = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', 'material_jia')
    .limit(1)
    .executeTakeFirst();
  return idOf(row?.id);
}

export default seed;
