import { defineSeed } from '@nocobase/db';

/**
 * The three demonstration materials, all owned by 资料员甲.
 *
 * Each one is deliberately a different case for the access model: 公开资料 P is published and non-confidential and is
 * what a reader sees; 私有草稿 D is unpublished and owner-only until an administrator temporarily shares it; 保密资料 C
 * is published but confidential, so without the reader's restriction rule it would match the reader's published scope —
 * making the restriction observable.
 */
const MATERIALS = [
  {
    title: '公开资料 P',
    content:
      '这是一篇已发布且不保密的资料，所有拥有资料阅读资格的同事都可以查看。',
    published: true,
    confidential: false,
  },
  {
    title: '私有草稿 D',
    content: '这是一篇尚未发布的草稿，默认只有负责人可以查看。',
    published: false,
    confidential: false,
  },
  {
    title: '保密资料 C',
    content: '这是一篇标记为保密的资料，即使已发布，阅读者也不能查看。',
    published: true,
    confidential: true,
  },
] as const;

export default defineSeed({
  name: '202609200004_library_materials',
  transaction: true,
  async run({ query }) {
    const owner = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'jia')
      .executeTakeFirst();
    if (!owner) return;

    const now = new Date();
    for (const material of MATERIALS) {
      const existing = await query
        .selectFrom('materials')
        .select('id')
        .where('ownerId', '=', String(owner.id))
        .where('title', '=', material.title)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('materials')
        .values({
          id: crypto.randomUUID(),
          title: material.title,
          content: material.content,
          ownerId: String(owner.id),
          published: material.published,
          confidential: material.confidential,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
