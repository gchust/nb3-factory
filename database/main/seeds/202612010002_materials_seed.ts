import { defineSeed } from '@nocobase/db';

/**
 * The three materials the application ships with.
 *
 * A and B are readable by every colleague; C is `restricted`, so only a supervisor can read it. The title is the
 * natural business key here — a repeated run of this seed is a no-op because the record already exists, not because
 * of a synthetic code column.
 */
const materials = [
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
    visibility: 'restricted',
  },
];

export default defineSeed({
  name: '202612010002_materials_seed',

  async run(context) {
    const repo = context.repository('materials');
    const now = new Date();

    for (const material of materials) {
      const existing = await repo.findOne({
        filter: { title: material.title },
      });
      if (existing) {
        continue;
      }
      await repo.createOne({
        values: { ...material, createdAt: now, updatedAt: now },
      });
    }
  },
});
