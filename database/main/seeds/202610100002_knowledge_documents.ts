import { defineSeed } from '@nocobase/db';

// The seed loader imports this file directly with Node, not through the
// bundler, so a relative import of application source names the file that is
// actually on disk (`.ts`); the compiler rewrites it to `.js` for the build.
import { DOCUMENT_VISIBILITY } from '../../../server/knowledge-resources.ts';

/**
 * The three documents the internal-document assistant answers from.
 *
 * Two are public and one is supervisor-only; that third one is the whole point
 * of the feature's permission story — the assistant must not quote it to a
 * colleague even though it lives in the same table.
 *
 * The seed is idempotent on the unique title and never overwrites a row that
 * already exists, because a supervisor may have edited the body through the
 * application. The timestamps are fixed so a fresh install is reproducible;
 * they are not identifying data.
 */
const SEEDED_AT = new Date('2026-01-01T00:00:00.000Z');

const documents = [
  {
    title: '蓝鹭设备报修电话',
    body:
      '蓝鹭设备的报修电话为 400-000-7316。\n' +
      '设备出现故障时，请先拨打该电话登记故障信息，再等待值班工程师回访处理。',
    visibility: DOCUMENT_VISIBILITY.public,
  },
  {
    title: '蓝鹭设备常规巡检间隔',
    body:
      '蓝鹭设备的常规巡检间隔为 45 天。\n' +
      '请按 45 天的周期安排巡检，并在巡检记录中登记巡检时间与结果。',
    visibility: DOCUMENT_VISIBILITY.public,
  },
  {
    title: '保密项目内部代号',
    body:
      '保密项目的内部代号为墨竹 729。\n' +
      '该代号属于内部保密信息，仅限项目负责人及被授权人员查阅。',
    visibility: DOCUMENT_VISIBILITY.restricted,
  },
] as const;

export default defineSeed({
  name: '202610100002_knowledge_documents',
  async run(context) {
    const knowledgeDocuments = context.repository('knowledgeDocuments');
    for (const document of documents) {
      const existing = await knowledgeDocuments.findOne({
        filter: { title: document.title },
      });
      if (existing) {
        continue;
      }
      await knowledgeDocuments.createOne({
        values: {
          ...document,
          createdAt: SEEDED_AT,
          updatedAt: SEEDED_AT,
        },
      });
    }
  },
});
