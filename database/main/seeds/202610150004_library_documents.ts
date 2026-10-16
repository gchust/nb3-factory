import { defineSeed, type SeedContext } from '@nocobase/db';

/**
 * The three demonstration documents, all owned by 资料员甲.
 *
 * P is published and not confidential: any qualified colleague may read it.
 * D is an unpublished draft: only its owner reaches it until an administrator
 * temporarily shares that single record.
 * C is published but confidential: an ordinary reader must never see it, even
 * after it is shared, which is what the reader's Restriction Rule enforces.
 *
 * The ids are fixed because the reader's confidentiality Restriction Rule, the
 * Sharing Rules an administrator creates at runtime and this application's own
 * tests all name them. They are required rather than sample data: this
 * application's installation path runs seeds but never sample data. The seed is
 * idempotent by id, so a re-run leaves a document an administrator edited alone.
 */

/** A published, non-confidential document every reader may open. */
export const PUBLIC_DOCUMENT = {
  id: 'd1000000-0000-4000-8000-00000000000a',
  title: '员工手册（公开）',
  body:
    '本手册面向全体员工，介绍考勤、休假、报销与办公设备使用的基本规定。\n\n' +
    '一、工作时间：周一至周五 9:00–18:00。\n' +
    '二、休假申请：请提前三个工作日在系统内提交。\n' +
    '三、报销：发票需在费用发生后 30 日内提交。',
  published: true,
  confidential: false,
} as const;

/** An unpublished draft only its owner can see. */
export const DRAFT_DOCUMENT = {
  id: 'd2000000-0000-4000-8000-00000000000b',
  title: '2026 年度计划（草稿）',
  body:
    '（草稿，尚未定稿）\n\n' +
    '2026 年计划围绕三条主线展开：完善内部资料管理、梳理岗位职责、优化协作流程。\n' +
    '本稿仅供参考，正式版本发布前请勿外传。',
  published: false,
  confidential: false,
} as const;

/** A published document marked confidential: readers must never see it. */
export const CONFIDENTIAL_DOCUMENT = {
  id: 'd3000000-0000-4000-8000-00000000000c',
  title: '高管薪酬方案（保密）',
  body:
    '（保密）\n\n' +
    '本文件包含高管薪酬结构、股权激励与绩效考核的敏感信息，仅限授权人员查阅。\n' +
    '任何情况下不得向普通阅读者开放。',
  published: true,
  confidential: true,
} as const;

const DOCUMENTS = [PUBLIC_DOCUMENT, DRAFT_DOCUMENT, CONFIDENTIAL_DOCUMENT];

const seed = defineSeed({
  name: '202610150004_library_documents',
  transaction: false,
  async run(context: SeedContext): Promise<void> {
    const owner = await context.query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'jia')
      .executeTakeFirst();
    if (!owner) return;

    const ownerId = String(owner.id);
    const now = new Date();
    for (const document of DOCUMENTS) {
      const existing = await context.query
        .selectFrom('documents')
        .select('id')
        .where('id', '=', document.id)
        .executeTakeFirst();
      if (existing) continue;

      await context.query
        .insertInto('documents')
        .values({
          id: document.id,
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
