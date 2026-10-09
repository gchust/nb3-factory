import { defineSeed } from '@nocobase/db';

interface SampleDocument {
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

/**
 * The three documents this version is demonstrated with, all owned by 资料员甲:
 * P is published and non-confidential, D is an unpublished draft, and C is
 * confidential. Nothing else is seeded.
 */
const SAMPLE_DOCUMENTS: readonly SampleDocument[] = [
  {
    title: '公开资料 P',
    body: '这是一份已经发布、且不保密的公开资料。有资料阅读资格的同事都能看到它。',
    published: true,
    confidential: false,
  },
  {
    title: '私有草稿 D',
    body: '这是一份尚未发布的草稿，默认只有负责人资料员甲能查看。管理员可以临时把它开放给某个人。',
    published: false,
    confidential: false,
  },
  {
    title: '保密资料 C',
    body: '这是一份保密资料。即使误给了普通共享资格，阅读者乙也不应该看到它；负责人资料员甲的访问不受影响。',
    published: true,
    confidential: true,
  },
];

/** Creates P, D and C for the librarian account, idempotently. */
const seed = defineSeed({
  name: '202610100020_library_create_sample_documents',
  async run({ query }) {
    const owner = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'librarian')
      .executeTakeFirst();
    if (!owner) {
      return;
    }
    for (const document of SAMPLE_DOCUMENTS) {
      const existing = await query
        .selectFrom('libraryDocuments')
        .select('id')
        .where('title', '=', document.title)
        .where('ownerId', '=', String(owner.id))
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      const now = new Date();
      await query
        .insertInto('libraryDocuments')
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

export default seed;
