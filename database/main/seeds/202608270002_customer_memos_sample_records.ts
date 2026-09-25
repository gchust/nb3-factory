import { defineSeed } from '@nocobase/db';

// Three fictional memoranda so the list is not empty on a fresh installation.
// Each is inserted only when a memo with the same name is absent, which keeps
// the seed safe to run again against a database that already has data.
const sampleMemos = [
  {
    id: '6f1c2a90-1d2e-4f3a-8b4c-5d6e7f809101',
    name: '星海科技',
    notes: '年度续约客户，负责人：林晓。下次回访时间：九月中旬。',
    createdAt: new Date('2026-07-01T09:00:00.000Z'),
  },
  {
    id: '7a2d3b01-2e3f-4a4b-9c5d-6e7f80911212',
    name: '云梯网络',
    notes: '已开通试用账号，等待对方技术团队反馈接入结果。',
    createdAt: new Date('2026-07-08T02:30:00.000Z'),
  },
  {
    id: '8b3e4c12-3f40-4b5c-8d6e-7f8091222323',
    name: '晨曦制造',
    notes: '希望在下季度安排一次工厂参观，需提前确认日程。',
    createdAt: new Date('2026-07-15T06:15:00.000Z'),
  },
] as const;

const seed = defineSeed({
  name: '202608270002_customer_memos_sample_records',
  async run({ query }) {
    for (const sample of sampleMemos) {
      const existing = await query
        .selectFrom('customerMemos')
        .select('id')
        .where('name', '=', sample.name)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('customerMemos')
        .values({
          id: sample.id,
          name: sample.name,
          notes: sample.notes,
          createdAt: sample.createdAt,
          updatedAt: sample.createdAt,
        })
        .execute();
    }
  },
});

export default seed;
