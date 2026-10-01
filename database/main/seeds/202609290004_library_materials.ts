import { defineSeed } from '@nocobase/db';

/**
 * The three demonstration documents, all owned by 资料员甲.
 *
 * Each one is deliberately a different case for the access model: 公开文档 is published and non-confidential and is
 * what a reader sees; 私有草稿 is unpublished and owner-only until an administrator temporarily shares it; 保密文档 is
 * published but confidential, so without the reader's restriction rule it would match the reader's published scope —
 * making the restriction observable.
 */
const DOCUMENTS = [
  {
    title: '公开文档',
    body: '这是一篇已发布且不保密的文档，所有拥有阅读权限的人都可以查看。',
    published: true,
    confidential: false,
  },
  {
    title: '私有草稿',
    body: '这是一篇尚未发布的草稿，默认只有负责人可以查看。',
    published: false,
    confidential: false,
  },
  {
    title: '保密文档',
    body: '这是一篇标记为保密的文档，即使已发布，阅读者也不能查看。',
    published: true,
    confidential: true,
  },
] as const;

export default defineSeed({
  name: '202609290004_library_materials',
  transaction: true,
  async run({ query }) {
    const owner = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'jia')
      .executeTakeFirst();
    if (!owner) return;

    const now = new Date();
    for (const document of DOCUMENTS) {
      const existing = await query
        .selectFrom('materials')
        .select('id')
        .where('ownerId', '=', String(owner.id))
        .where('title', '=', document.title)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('materials')
        .values({
          id: crypto.randomUUID(),
          title: document.title,
          body: document.body,
          ownerId: String(owner.id),
          published: document.published,
          confidential: document.confidential,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
