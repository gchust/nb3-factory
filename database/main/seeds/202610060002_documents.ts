import { defineSeed } from '@nocobase/db';

/**
 * The three documents the assistant answers from: two every signed-in colleague may read, one
 * supervisor-only. The body is the fact; the title is what the list and the citations show. Fixed
 * timestamps keep the seed reproducible, and an existing title is left untouched so a supervisor's
 * later edit is not overwritten on the next run.
 */
const documents = [
  {
    title: '蓝鹭设备报修电话',
    body: '蓝鹭设备报修电话为 400-000-7316。',
    accessLevel: 'staff',
  },
  {
    title: '蓝鹭设备常规巡检间隔',
    body: '蓝鹭设备常规巡检间隔为 45 天。',
    accessLevel: 'staff',
  },
  {
    title: '保密项目内部代号',
    body: '保密项目的内部代号为墨竹 729。',
    accessLevel: 'supervisor',
  },
];

export default defineSeed({
  name: '202610060002_documents',
  transaction: true,
  async run({ query }) {
    const now = new Date('2026-10-06T00:00:00.000Z');
    for (const document of documents) {
      const existing = await query
        .selectFrom('documents')
        .select('id')
        .where('title', '=', document.title)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('documents')
        .values({
          title: document.title,
          body: document.body,
          accessLevel: document.accessLevel,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
