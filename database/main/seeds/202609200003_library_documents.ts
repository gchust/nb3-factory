import { defineSeed } from '@nocobase/db';

/** 资料员甲 owns every fixture document. Must match the users seed. */
const EDITOR_USER_ID = '11111111-1111-4111-8111-111111111111';

/**
 * Three documents that make the library rules visible:
 *
 * - 公开资料 P  published && not confidential — every reader may open it.
 * - 私有草稿 D  draft && not confidential — owner-only until an administrator
 *               temporarily shares this one record.
 * - 保密资料 C  published && confidential — never a reader's, even shared.
 */
const seed = defineSeed({
  name: '202609200003_library_documents',
  async run({ query }) {
    const documents = [
      {
        title: '公开资料 P',
        content:
          '这是一份已发布且不保密的资料，所有具备阅读资格的同事都可以查看。',
        published: true,
        confidential: false,
        createdAt: new Date('2026-09-01T01:00:00.000Z'),
        updatedAt: new Date('2026-09-01T01:00:00.000Z'),
      },
      {
        title: '私有草稿 D',
        content: '这是一份尚未发布的草稿，默认只有负责人资料员甲本人可以查看。',
        published: false,
        confidential: false,
        createdAt: new Date('2026-09-01T02:00:00.000Z'),
        updatedAt: new Date('2026-09-01T02:00:00.000Z'),
      },
      {
        title: '保密资料 C',
        content:
          '这是一份保密资料，即使被误授予普通共享资格，阅读者乙也不能查看。',
        published: true,
        confidential: true,
        createdAt: new Date('2026-09-01T03:00:00.000Z'),
        updatedAt: new Date('2026-09-01T03:00:00.000Z'),
      },
    ];

    for (const document of documents) {
      const existing = await query
        .selectFrom('documents')
        .select('id')
        .where('title', '=', document.title)
        .where('ownerId', '=', EDITOR_USER_ID)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('documents')
        .values({ ownerId: EDITOR_USER_ID, ...document })
        .execute();
    }
  },
});

export default seed;
