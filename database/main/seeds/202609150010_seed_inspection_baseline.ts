import { defineSeed, type SeedDefinition } from '@nocobase/db';

// Required baseline data: without devices and plans an inspector cannot file a
// record. Fixed values only, so a repeat run is a no-op.
const DEVICES = [
  {
    code: 'DEV-001',
    name: '一号车间空压机',
    location: 'A 区 1 号车间',
    type: '空压机',
    status: 'in_use',
  },
  {
    code: 'DEV-002',
    name: '二号车间数控机床',
    location: 'B 区 2 号车间',
    type: '机床',
    status: 'in_use',
  },
  {
    code: 'DEV-003',
    name: '配电室高压柜',
    location: 'C 区配电室',
    type: '电气设备',
    status: 'repair',
  },
  {
    code: 'DEV-004',
    name: '成品仓库叉车',
    location: '成品仓库',
    type: '搬运设备',
    status: 'stopped',
  },
  {
    code: 'DEV-005',
    name: '锅炉房循环泵',
    location: 'D 区锅炉房',
    type: '泵类',
    status: 'in_use',
  },
] as const;

const PLANS = [
  {
    name: '空压机日巡检',
    cycle: 'daily',
    team: '甲班',
    startDate: '2026-08-01T00:00:00.000Z',
    status: 'active',
  },
  {
    name: '机床周巡检',
    cycle: 'weekly',
    team: '甲班',
    startDate: '2026-08-05T00:00:00.000Z',
    status: 'active',
  },
  {
    name: '电气设备月巡检',
    cycle: 'monthly',
    team: '乙班',
    startDate: '2026-07-15T00:00:00.000Z',
    status: 'ended',
  },
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609150010_seed_inspection_baseline',

  async run({ query }) {
    const now = new Date('2026-09-15T00:00:00.000Z');

    for (const device of DEVICES) {
      const existing = await query
        .selectFrom('inspectionDevices')
        .select('id')
        .where('code', '=', device.code)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('inspectionDevices')
        .values({ ...device, createdAt: now, updatedAt: now })
        .execute();
    }

    for (const plan of PLANS) {
      const existing = await query
        .selectFrom('inspectionPlans')
        .select('id')
        .where('name', '=', plan.name)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('inspectionPlans')
        .values({ ...plan, createdAt: now, updatedAt: now })
        .execute();
    }
  },
});

export default seed;
