import { defineSeed } from '@nocobase/db';
import type { SeedDefinition } from '@nocobase/db';

/**
 * The three documents the assistant answers from.
 *
 * A and B are `public` (readable by every signed-in user); C is `supervisor`
 * (readable only by a user assigned the `supervisor` permission set). The
 * records are stable and fixed so new answers and citations always agree with
 * what the supervisor maintains.
 */
const seed: SeedDefinition = defineSeed({
  name: '20261003090001_documents_seed',
  async run({ query }) {
    const documents = [
      {
        id: 'doc-repair-phone',
        title: '蓝鹭设备报修电话',
        content: '蓝鹭设备报修电话为 400-000-7316。',
        accessLevel: 'public',
      },
      {
        id: 'doc-inspection-interval',
        title: '蓝鹭设备常规巡检间隔',
        content: '蓝鹭设备常规巡检间隔为 45 天。',
        accessLevel: 'public',
      },
      {
        id: 'doc-secret-project',
        title: '保密项目内部代号',
        content: '保密项目的内部代号为墨竹 729。',
        accessLevel: 'supervisor',
      },
    ];

    const now = new Date();
    for (const document of documents) {
      const existing = await query
        .selectFrom('documents')
        .select('id')
        .where('id', '=', document.id)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('documents')
        .values({
          id: document.id,
          title: document.title,
          content: document.content,
          accessLevel: document.accessLevel,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
