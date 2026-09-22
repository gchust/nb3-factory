import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Example follow-up records so a fresh installation has something to show.
 *
 * The seed is idempotent: a record is identified by customer name plus follow-up date, so a repeat run leaves an
 * existing row untouched instead of inserting a duplicate.
 */
const EXAMPLE_VISITS = [
  {
    customerName: '华星制造',
    visitDate: '2026-08-28',
    conclusion: 'satisfied',
    engineerName: '李伟',
    notes: '设备运行正常，客户对响应速度满意。',
  },
  {
    customerName: '蓝海物流',
    visitDate: '2026-09-02',
    conclusion: 'neutral',
    engineerName: '王强',
    notes: '更换滤芯，需跟进备件到货情况。',
  },
  {
    customerName: '云谷科技',
    visitDate: '2026-09-05',
    conclusion: 'dissatisfied',
    engineerName: '张敏',
    notes: '现场等待时间较长，客户希望缩短上门周期。',
  },
  {
    customerName: '华星制造',
    visitDate: '2026-09-10',
    conclusion: 'satisfied',
    engineerName: '李伟',
    notes: '复检通过，客户确认验收。',
  },
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609220002_seed_field_visits',

  async run({ query }) {
    for (const visit of EXAMPLE_VISITS) {
      const existing = await query
        .selectFrom('fieldVisits')
        .select('id')
        .where('customerName', '=', visit.customerName)
        .where('visitDate', '=', visit.visitDate)
        .executeTakeFirst();

      if (existing) {
        continue;
      }

      // Fixed timestamp derived from the record's own date, so the seed stays reproducible.
      const recordedAt = new Date(`${visit.visitDate}T00:00:00.000Z`);
      await query
        .insertInto('fieldVisits')
        .values({
          ...visit,
          createdAt: recordedAt,
          updatedAt: recordedAt,
        })
        .execute();
    }
  },
});

export default seed;
