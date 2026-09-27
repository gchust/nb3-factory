import { randomUUID } from 'node:crypto';

import { defineSeed } from '@nocobase/db';

/**
 * The three documents the requirement names: P (published, non-confidential),
 * D (draft, non-confidential) and C (confidential). All three belong to the
 * manager, so the reader owns nothing and every record they can reach came from
 * a grant.
 *
 * Re-running is a no-op; each document is recognized by its title.
 */
const DOCUMENTS = [
  {
    title: '内部资料 P · 公开须知',
    body: '这是所有成员都可以阅读的公开资料，内容为内部资料库的使用须知。',
    published: true,
    confidential: false,
  },
  {
    title: '内部资料 D · 草稿方案',
    body: '这是一份尚未公开的草稿方案。默认只有资料员可以查看，管理员可以临时开放给指定读者。',
    published: false,
    confidential: false,
  },
  {
    title: '内部资料 C · 保密纪要',
    body: '这是保密级别的会议纪要。即使被临时开放给某位读者，保密内容也不会因此暴露。',
    published: false,
    confidential: true,
  },
] as const;

const seed = defineSeed({
  name: '202609280003_library_create_documents',
  transaction: true,
  async run({ query }) {
    const owner = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'manager.a')
      .executeTakeFirst();
    if (!owner) {
      return;
    }
    const ownerId = String(owner.id);
    const now = new Date();
    for (const document of DOCUMENTS) {
      const existing = await query
        .selectFrom('documents')
        .select('id')
        .where('title', '=', document.title)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('documents')
        .values({
          id: randomUUID(),
          title: document.title,
          body: document.body,
          ownerId,
          published: document.published,
          confidential: document.confidential,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
