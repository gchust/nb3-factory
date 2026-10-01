import { defineSeed } from '@nocobase/db';

/**
 * The three reference materials the service team is given at install time.
 * `visibility` is read by the `materials.public` record access: `public`
 * reaches every signed-in colleague, `supervisor` only a supervisor.
 */
const MATERIALS = [
  {
    title: '蓝鹭设备报修电话',
    body: '蓝鹭设备报修电话为 400-000-7316。',
    visibility: 'public',
  },
  {
    title: '蓝鹭设备常规巡检间隔',
    body: '蓝鹭设备常规巡检间隔为 45 天。',
    visibility: 'public',
  },
  {
    title: '保密项目内部代号',
    body: '保密项目的内部代号为墨竹 729。',
    visibility: 'supervisor',
  },
];

const seed = defineSeed({
  name: '202610010101_seed_materials',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const material of MATERIALS) {
      const existing = await query
        .selectFrom('materials')
        .select('id')
        .where('title', '=', material.title)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('materials')
        .values({
          title: material.title,
          body: material.body,
          visibility: material.visibility,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
