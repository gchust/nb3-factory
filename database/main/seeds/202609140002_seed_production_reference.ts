import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Reference data the application needs to run (teams, products) and the sample work orders the
 * workshop starts from. Idempotent: every record is keyed by its business code, so a repeat run
 * neither duplicates nor overwrites data a user has since edited.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609140002_seed_production_reference',

  async run({ query }) {
    const now = new Date();

    const teams = [
      { code: 'TEAM-A', name: '一号班组' },
      { code: 'TEAM-B', name: '二号班组' },
      { code: 'TEAM-C', name: '三号班组' },
    ];
    const teamIds = new Map<string, number>();
    for (const team of teams) {
      const existing = await query
        .selectFrom('teams')
        .select(['id'])
        .where('code', '=', team.code)
        .executeTakeFirst();
      if (existing) {
        teamIds.set(team.code, Number(existing.id));
        continue;
      }
      const inserted = await query
        .insertInto('teams')
        .values({ ...team, createdAt: now, updatedAt: now })
        .execute();
      teamIds.set(team.code, Number(inserted.insertId));
    }

    const products = [
      {
        code: 'P-MOTOR-SHELL',
        name: '电机外壳',
        specification: '180mm 铝制',
        unit: '件',
        standardMinutes: 12.5,
      },
      {
        code: 'P-GEAR-SET',
        name: '齿轮组件',
        specification: '模数 2.0 / 20 齿',
        unit: '件',
        standardMinutes: 8,
      },
      {
        code: 'P-CONTROL-PANEL',
        name: '控制面板',
        specification: '7 寸触控',
        unit: '件',
        standardMinutes: 15,
      },
    ];
    const productIds = new Map<string, number>();
    for (const product of products) {
      const existing = await query
        .selectFrom('products')
        .select(['id'])
        .where('code', '=', product.code)
        .executeTakeFirst();
      if (existing) {
        productIds.set(product.code, Number(existing.id));
        continue;
      }
      const inserted = await query
        .insertInto('products')
        .values({ ...product, createdAt: now, updatedAt: now })
        .execute();
      productIds.set(product.code, Number(inserted.insertId));
    }

    const workOrders = [
      {
        code: 'WO-2026-0001',
        productCode: 'P-MOTOR-SHELL',
        teamCode: 'TEAM-A',
        plannedQuantity: 100,
        plannedStartDate: '2026-09-01',
        plannedEndDate: '2026-09-20',
        status: 'pending',
        processes: [
          { name: '下料', plannedQuantity: 100 },
          { name: '组装', plannedQuantity: 100 },
        ],
      },
      {
        code: 'WO-2026-0002',
        productCode: 'P-GEAR-SET',
        teamCode: 'TEAM-B',
        plannedQuantity: 200,
        plannedStartDate: '2026-09-02',
        plannedEndDate: '2026-09-25',
        status: 'in_production',
        processes: [
          { name: '粗加工', plannedQuantity: 200 },
          { name: '精加工', plannedQuantity: 200 },
        ],
      },
      {
        code: 'WO-2026-0003',
        productCode: 'P-CONTROL-PANEL',
        teamCode: 'TEAM-C',
        plannedQuantity: 50,
        plannedStartDate: '2026-09-05',
        plannedEndDate: '2026-09-28',
        status: 'pending',
        processes: [
          { name: '贴片', plannedQuantity: 50 },
          { name: '测试', plannedQuantity: 50 },
        ],
      },
    ];

    for (const order of workOrders) {
      const existing = await query
        .selectFrom('workOrders')
        .select(['id'])
        .where('code', '=', order.code)
        .executeTakeFirst();
      if (existing) continue;

      const inserted = await query
        .insertInto('workOrders')
        .values({
          code: order.code,
          productId: productIds.get(order.productCode) ?? 0,
          teamId: teamIds.get(order.teamCode) ?? 0,
          plannedQuantity: order.plannedQuantity,
          plannedStartDate: order.plannedStartDate,
          plannedEndDate: order.plannedEndDate,
          status: order.status,
          createdById: null,
          createdByName: '系统初始化',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const workOrderId = Number(inserted.insertId);

      let sequence = 1;
      for (const process of order.processes) {
        await query
          .insertInto('workOrderProcesses')
          .values({
            workOrderId,
            name: process.name,
            sequence,
            plannedQuantity: process.plannedQuantity,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        sequence += 1;
      }
    }
  },
});

export default seed;
