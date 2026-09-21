import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * A couple of example memos so the page is not empty on first use.
 *
 * The seed is idempotent per record: each sample is inserted only when no memo
 * already carries that customer name, so a repeat run does not duplicate rows
 * and a memo the user edited under the same name is left untouched.
 */
const samples = [
  {
    customerName: '北山贸易有限公司',
    note: '合同续签时间在十月，届时联系采购负责人。',
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
  },
  {
    customerName: '晨曦科技',
    note: '反馈对账流程需要更详细的导出字段。',
    createdAt: new Date('2026-09-05T09:30:00.000Z'),
  },
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609210002_seed_customer_memos',

  async run({ query }) {
    for (const sample of samples) {
      const existing = await query
        .selectFrom('customerMemos')
        .select('id')
        .where('customerName', '=', sample.customerName)
        .executeTakeFirst();

      if (existing) {
        continue;
      }

      await query
        .insertInto('customerMemos')
        .values({
          customerName: sample.customerName,
          note: sample.note,
          createdAt: sample.createdAt,
        })
        .execute();
    }
  },
});

export default seed;
