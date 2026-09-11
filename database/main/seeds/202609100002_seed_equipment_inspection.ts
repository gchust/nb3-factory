import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Example equipment archive and inspection records (fabricated).
 *
 * File fields are intentionally left empty: the acceptance flow uploads real
 * files through the UI. Each run skips a device whose deviceNo already exists,
 * so the seed is safe to re-run; inspections are only created together with the
 * device they belong to.
 */

const DEVICES = [
  {
    deviceNo: 'DEV-CNC-001',
    name: '数控加工中心',
    location: '一号车间',
    status: 'running',
    owner: '张伟',
    remark: '每日开机前检查润滑系统，加工精度 ±0.01mm。',
  },
  {
    deviceNo: 'DEV-AIR-002',
    name: '螺杆空压机',
    location: '动力机房',
    status: 'maintenance',
    owner: '李强',
    remark: '2026 年 8 月起例行保养，更换机头轴承。',
  },
  {
    deviceNo: 'DEV-PRESS-003',
    name: '冲压机',
    location: '二号车间',
    status: 'stopped',
    owner: '王芳',
    remark: '因模具故障暂时停用，等待供应商维修。',
  },
  {
    deviceNo: 'DEV-FORK-004',
    name: '电动叉车',
    location: '仓储区',
    status: 'scrapped',
    owner: '刘洋',
    remark: '已达报废年限，等待走报废流程。',
  },
];

const INSPECTIONS: Readonly<Record<string, unknown>[]> = [
  {
    deviceNo: 'DEV-CNC-001',
    inspectedAt: new Date('2026-09-02T09:30:00.000Z'),
    inspector: '张伟',
    conclusion: 'normal',
  },
  {
    deviceNo: 'DEV-AIR-002',
    inspectedAt: new Date('2026-09-03T10:00:00.000Z'),
    inspector: '李强',
    conclusion: 'issue',
  },
  {
    deviceNo: 'DEV-PRESS-003',
    inspectedAt: new Date('2026-09-04T14:00:00.000Z'),
    inspector: '王芳',
    conclusion: 'normal',
  },
  {
    deviceNo: 'DEV-FORK-004',
    inspectedAt: new Date('2026-09-05T08:30:00.000Z'),
    inspector: '刘洋',
    conclusion: 'major',
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609100002_seed_equipment_inspection',

  async run({ query }) {
    const createdAt = new Date('2026-09-08T00:00:00.000Z');

    for (const device of DEVICES) {
      const existing = await query
        .selectFrom('equipment')
        .select('id')
        .where('deviceNo', '=', device.deviceNo)
        .executeTakeFirst();
      if (existing) continue;

      const insertion = await query
        .insertInto('equipment')
        .values({
          deviceNo: device.deviceNo,
          name: device.name,
          location: device.location,
          status: device.status,
          owner: device.owner,
          remark: device.remark,
          createdAt,
          updatedAt: createdAt,
        })
        .execute();

      const equipmentId = Number(insertion.insertId);
      if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0) continue;

      for (const inspection of INSPECTIONS) {
        if (inspection.deviceNo !== device.deviceNo) continue;
        await query
          .insertInto('inspectionRecords')
          .values({
            equipmentId,
            inspectedAt: inspection.inspectedAt,
            inspector: inspection.inspector,
            conclusion: inspection.conclusion,
            createdAt,
            updatedAt: createdAt,
          })
          .execute();
      }
    }
  },
});

export default seed;
