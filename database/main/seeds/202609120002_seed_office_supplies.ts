import { defineSeed, type SeedDefinition, type Row } from '@nocobase/db';

const SUPPLY_CODES = [
  'BG-001',
  'BG-002',
  'BG-003',
  'BG-004',
  'BG-005',
  'BG-006',
  'BG-007',
] as const;

/**
 * Fictional example data for the office supplies module: seven supplies across
 * the categories the product describes (办公文具, 清洁用品, 电子配件), one of
 * them (BG-005 订书机) with zero stock, and three supplies with existing
 * requisition history (BG-001 twice, BG-003 once, BG-004 once).
 *
 * The seed is all-or-nothing: it runs only when none of the seeded codes
 * exists, so a repeat run (or a partially edited table) never duplicates rows
 * and never overwrites records a user has changed.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609120002_seed_office_supplies',
  transaction: true,

  async run({ query }) {
    const existing = await query
      .selectFrom('officeSupplies')
      .select('code')
      .where('code', 'in', [...SUPPLY_CODES])
      .limit(1)
      .executeTakeFirst();
    if (existing) return;

    const now = new Date('2026-09-10T00:00:00.000Z');
    const supplyValues = [
      {
        code: 'BG-001',
        name: '中性笔',
        category: '办公文具',
        quantity: 20,
        unit: '支',
        remark: '黑色 0.5mm 子弹头',
      },
      {
        code: 'BG-002',
        name: 'A4 复印纸',
        category: '办公文具',
        quantity: 40,
        unit: '包',
        remark: '70g，每包 500 张',
      },
      {
        code: 'BG-003',
        name: '洗手液',
        category: '清洁用品',
        quantity: 5,
        unit: '瓶',
        remark: '500ml 泡沫洗手液',
      },
      {
        code: 'BG-004',
        name: '键盘',
        category: '电子配件',
        quantity: 8,
        unit: '个',
        remark: '有线 USB 键盘',
      },
      {
        code: 'BG-005',
        name: '订书机',
        category: '办公文具',
        quantity: 0,
        unit: '个',
        remark: '已用罄，需要补货',
      },
      {
        code: 'BG-006',
        name: '垃圾袋',
        category: '清洁用品',
        quantity: 30,
        unit: '卷',
        remark: '45×55cm 加厚款',
      },
      {
        code: 'BG-007',
        name: '无线鼠标',
        category: '电子配件',
        quantity: 3,
        unit: '个',
        remark: '2.4G 无线，需装电池',
      },
    ].map((supply) => ({ ...supply, createdAt: now }));

    await query.insertInto('officeSupplies').values(supplyValues).execute();

    const seededSupplies = await query
      .selectFrom('officeSupplies')
      .select(['id', 'code'])
      .where('code', 'in', [...SUPPLY_CODES])
      .execute();
    const codesById = new Map<string, number>(
      seededSupplies.map((row) => [String(row.code), Number(row.id)]),
    );

    const requisitionValues = [
      {
        code: 'BG-001',
        requisitioner: '张伟',
        quantity: 2,
        requisitionedAt: new Date('2026-09-01T09:30:00.000Z'),
        remark: '部门日常办公用',
      },
      {
        code: 'BG-001',
        requisitioner: '李娜',
        quantity: 1,
        requisitionedAt: new Date('2026-09-05T14:20:00.000Z'),
        remark: '会议纪要记录用',
      },
      {
        code: 'BG-003',
        requisitioner: '王芳',
        quantity: 1,
        requisitionedAt: new Date('2026-09-08T10:00:00.000Z'),
        remark: '洗手间补充',
      },
      {
        code: 'BG-004',
        requisitioner: '张伟',
        quantity: 1,
        requisitionedAt: new Date('2026-09-03T16:45:00.000Z'),
        remark: '新员工入职配发',
      },
    ];

    const rows: Row[] = requisitionValues
      .map((requisition) => {
        const supplyId = codesById.get(requisition.code);
        if (supplyId === undefined) {
          throw new Error(`Seeded supply code not found: ${requisition.code}`);
        }
        return {
          supplyId,
          requisitionedAt: requisition.requisitionedAt,
          requisitioner: requisition.requisitioner,
          quantity: requisition.quantity,
          remark: requisition.remark,
          createdAt: now,
        };
      })
      .sort((a, b) => Number(a.supplyId) - Number(b.supplyId));

    await query.insertInto('supplyRequisitions').values(rows).execute();
  },
});

export default seed;
