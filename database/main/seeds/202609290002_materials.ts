import { defineSeed } from '@nocobase/db';

interface MaterialSeed {
  readonly title: string;
  readonly content: string;
  readonly confidential: boolean;
}

/**
 * The three sample materials of the read-only Q&A assistant. Ordinary
 * colleagues are authorized to read the first two; the third is marked
 * `confidential` and stays readable only to the supervisor.
 */
export const materialsSeed: readonly MaterialSeed[] = [
  {
    title: '报修联系方式',
    content: '蓝鹭设备报修电话为 400-000-7316',
    confidential: false,
  },
  {
    title: '巡检周期',
    content: '蓝鹭设备常规巡检间隔为 45 天',
    confidential: false,
  },
  {
    title: '保密项目内部代号',
    content: '保密项目的内部代号为墨竹 729',
    confidential: true,
  },
];

const seed = defineSeed({
  name: '202609290002_materials',
  transaction: true,
  async run(context) {
    const materials = context.repository('materials');
    const now = new Date();
    for (const material of materialsSeed) {
      // Idempotent by title so re-running an interrupted installation does not
      // duplicate a material or overwrite an administrator's edit.
      const existing = await materials.findOne({
        filter: { title: material.title },
      });
      if (existing) continue;
      await materials.createOne({
        values: {
          title: material.title,
          content: material.content,
          confidential: material.confidential,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});

export default seed;
