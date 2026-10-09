import { defineSeed } from '@nocobase/db';

/**
 * The three internal materials the assistant answers from.
 *
 * The records are keyed on their unique `title`, and a repeat run only inserts
 * what is missing. That keeps the seed idempotent without overwriting a row a
 * supervisor has since edited — the assistant is expected to reflect the live
 * material, not the version that shipped with the application.
 */
type MaterialSeed = {
  readonly title: string;
  readonly body: string;
  readonly confidential: boolean;
};

const materials: readonly MaterialSeed[] = [
  {
    title: '蓝鹭设备报修电话',
    body: '蓝鹭设备的报修电话为 400-000-7316。',
    confidential: false,
  },
  {
    title: '蓝鹭设备常规巡检间隔',
    body: '蓝鹭设备的常规巡检间隔为 45 天。',
    confidential: false,
  },
  {
    title: '保密项目内部代号',
    body: '保密项目的内部代号为墨竹 729。',
    confidential: true,
  },
];

export default defineSeed({
  name: '202610010002_seed_materials',

  async run(context) {
    const materialsRepository = context.repository('materials');

    for (const material of materials) {
      const existing = await materialsRepository.findOne({
        filter: { title: material.title },
      });

      if (!existing) {
        await materialsRepository.createOne({ values: material });
      }
    }
  },
});
