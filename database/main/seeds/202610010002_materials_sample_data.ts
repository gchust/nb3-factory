import { defineSeed } from '@nocobase/db';

/**
 * The three materials the system starts with.
 *
 * Two are readable by every colleague (the repair phone number and the
 * inspection interval); the third is the supervisor-only project codename.
 * Content is fixed so the installation, and every answer drawn from it, is
 * reproducible. Filed once: an administrator's later edits are never
 * overwritten by re-running this seed, and the seed's execution history is what
 * keeps it from running twice.
 */
const MATERIALS = [
  {
    title: '蓝鹭设备报修电话',
    body: '蓝鹭设备报修电话为 400-000-7316。',
    confidential: false,
  },
  {
    title: '蓝鹭设备常规巡检间隔',
    body: '蓝鹭设备常规巡检间隔为 45 天。',
    confidential: false,
  },
  {
    title: '保密项目内部代号',
    body: '保密项目的内部代号为墨竹 729。',
    confidential: true,
  },
] as const;

const FILED_AT = new Date('2026-10-01T00:00:00.000Z');

const seed = defineSeed({
  name: '202610010002_materials_sample_data',
  transaction: true,
  async run({ query }) {
    const existing = await query
      .selectFrom('materials')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existing) {
      return;
    }

    await query
      .insertInto('materials')
      .values(
        MATERIALS.map((material) => ({ ...material, createdAt: FILED_AT })),
      )
      .execute();
  },
});

export default seed;
