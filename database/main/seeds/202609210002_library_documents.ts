import { defineSeed } from '@nocobase/db';

/**
 * Installs the three sample documents, one per visibility rule:
 *
 * - P — published and non-confidential: open to every signed-in colleague.
 * - D — a draft: visible only to its owner until an administrator shares it.
 * - C — published but confidential: blocked for the reader by the
 *   confidentiality restriction even if a sharing rule names it.
 *
 * All three are owned by the editor account created by the previous seed, so
 * this one runs after it. Ids are fixed so the documents are recognizable and
 * a re-run is a no-op.
 *
 * The document data is declared inside this seed rather than imported from a
 * shared module on purpose: seeds are run both from source (under Node's
 * native TypeScript loader, which resolves only the specifiers that literally
 * exist on disk) and from the compiled output, and a seed is a snapshot that
 * must not change meaning when another file does. Keep it self-contained.
 */

interface LibraryDocumentSeed {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
}

const ownerId = '10000000-0000-4000-8000-000000000001';
const ownerName = '资料员甲';

const LIBRARY_DOCUMENTS: readonly LibraryDocumentSeed[] = [
  {
    id: '10000000-0000-4000-8000-0000000000a1',
    title: '公开资料：产品手册',
    content:
      '这是一份已发布且非保密的资料，所有具备资料库访问权限的同事都可以阅读。',
    ownerId,
    ownerName,
    published: true,
    confidential: false,
    createdAt: '2026-09-01T01:00:00.000Z',
  },
  {
    id: '10000000-0000-4000-8000-0000000000d2',
    title: '草稿：下季度工作计划',
    content:
      '这是一份尚未发布的草稿，默认只有资料员甲本人可见。管理员可以临时把这一篇共享给阅读者乙。',
    ownerId,
    ownerName,
    published: false,
    confidential: false,
    createdAt: '2026-09-01T02:00:00.000Z',
  },
  {
    id: '10000000-0000-4000-8000-0000000000c3',
    title: '保密资料：薪酬与预算明细',
    content:
      '这是一份保密资料。即使被误共享，阅读者乙也无法看到；资料员甲和管理员仍可正常访问。',
    ownerId,
    ownerName,
    published: true,
    confidential: true,
    createdAt: '2026-09-01T03:00:00.000Z',
  },
];

const seed = defineSeed({
  name: '202609210002_library_documents',
  async run({ query }) {
    for (const document of LIBRARY_DOCUMENTS) {
      const existing = await query
        .selectFrom('libraryDocuments')
        .select('id')
        .where('id', '=', document.id)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('libraryDocuments')
        .values({
          id: document.id,
          title: document.title,
          content: document.content,
          ownerId: document.ownerId,
          ownerName: document.ownerName,
          published: document.published,
          confidential: document.confidential,
          createdAt: new Date(document.createdAt),
          updatedAt: new Date(document.createdAt),
        })
        .execute();
    }
  },
});

export default seed;
