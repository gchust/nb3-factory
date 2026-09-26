import { defineSeed, type SeedDefinition } from '@nocobase/db';

interface EquipmentSeed {
  readonly assetNo: string;
  readonly name: string;
  readonly category: string;
  readonly notes: string;
}

/**
 * Five devices covering every ledger state the sample data is meant to show:
 * available, lent out normally, and one lent out past its due date.
 */
const EQUIPMENT: readonly EquipmentSeed[] = [
  {
    assetNo: 'EQ-2026-001',
    name: 'ThinkPad X1 笔记本电脑',
    category: '电脑设备',
    notes: '采购于 2026 年初，配 65W 电源适配器。',
  },
  {
    assetNo: 'EQ-2026-002',
    name: 'Epson CB-X06 投影仪',
    category: '会议设备',
    notes: '含 HDMI 线与便携收纳包。',
  },
  {
    assetNo: 'EQ-2026-003',
    name: 'HP M403dn 打印机',
    category: '办公设备',
    notes: '支持双面打印，使用前请确认纸张充足。',
  },
  {
    assetNo: 'EQ-2026-004',
    name: 'Dell U2723QE 显示器',
    category: '电脑设备',
    notes: '27 英寸 4K，含 USB-C 与 DP 线。',
  },
  {
    assetNo: 'EQ-2026-005',
    name: 'Canon EOS R6 相机',
    category: '摄影器材',
    notes: '含 24-105mm 镜头、两块电池与相机包。',
  },
];

/** Fixed so a repeated run writes the same identifying and audit values. */
const SEED_TIMESTAMP = '2026-09-26T00:00:00.000Z';

/**
 * Equipment ledger sample data. Seeded by `assetNo`, so a repeat run — or a
 * manual re-run without seed history — leaves an existing row untouched
 * instead of duplicating it or overwriting a user's edits.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609260003_seed_equipment_samples',
  async run(context) {
    const equipment = context.repository('equipment');

    for (const item of EQUIPMENT) {
      const existing = await equipment.findOne({
        filter: { assetNo: item.assetNo },
      });
      if (existing) {
        continue;
      }

      await equipment.createOne({
        values: {
          assetNo: item.assetNo,
          name: item.name,
          category: item.category,
          notes: item.notes,
          createdAt: SEED_TIMESTAMP,
          updatedAt: SEED_TIMESTAMP,
        },
      });
    }
  },
});

export default seed;
