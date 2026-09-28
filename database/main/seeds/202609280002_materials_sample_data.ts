import { defineSeed } from '@nocobase/db';

/**
 * The three fictional materials the read-only assistant answers from.
 *
 * `audience: 'manager'` on the third one is what makes it invisible to a
 * colleague — on the materials page and through the assistant alike. Kept
 * idempotent by slug: a material that already exists is left alone, so a
 * manager's later edit is not overwritten by a repeated seed run.
 */
const seed = defineSeed({
  name: '202609280002_materials_sample_data',
  async run(context) {
    const materials = context.repository('materials');
    const now = new Date();
    const samples = [
      {
        slug: 'blue-heron-repair-hotline',
        title: '蓝鹭设备报修电话',
        body: '蓝鹭设备报修电话为 400-000-7316。工作时间内可直接拨打，非工作时间请留言，值班人员会回拨。',
        audience: 'all',
      },
      {
        slug: 'blue-heron-inspection-interval',
        title: '蓝鹭设备常规巡检间隔',
        body: '蓝鹭设备常规巡检间隔为 45 天。巡检完成后需在设备台账中登记巡检日期。',
        audience: 'all',
      },
      {
        slug: 'classified-project-codename',
        title: '保密项目内部代号',
        body: '保密项目的内部代号为墨竹 729。该代号仅限管理层内部沟通使用，不得对外披露。',
        audience: 'manager',
      },
    ] as const;

    for (const sample of samples) {
      const existing = await materials.findOne({
        filter: { slug: sample.slug },
      });

      if (existing) {
        continue;
      }

      await materials.createOne({
        values: {
          slug: sample.slug,
          title: sample.title,
          body: sample.body,
          audience: sample.audience,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});

export default seed;
