import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * A few example memos so the page is not empty on a fresh installation.
 *
 * The seed is idempotent: it inserts a memo only when no row with the same
 * customer name and content exists, so running it twice (for example after its
 * history row was removed) leaves the data unchanged.
 */
interface MemoSeed {
  readonly customerName: string;
  readonly content: string;
  readonly createdAt: Date;
}

const memoSeeds: readonly MemoSeed[] = [
  {
    customerName: '北京华信科技有限公司',
    content: '已确认续约意向，下季度跟进合同细节。',
    createdAt: new Date('2026-09-10T01:30:00.000Z'),
  },
  {
    customerName: '上海远景贸易有限公司',
    content: '关注应收账款回收情况，月底前核对账单。',
    createdAt: new Date('2026-09-12T06:15:00.000Z'),
  },
  {
    customerName: '广州星辰软件有限公司',
    content: '等待客户反馈试用结果，暂无新进展。',
    createdAt: new Date('2026-09-15T08:45:00.000Z'),
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609230002_seed_customer_memos',
  async run({ query }) {
    for (const memo of memoSeeds) {
      const existing = await query
        .selectFrom('customerMemos')
        .select('id')
        .where('customerName', '=', memo.customerName)
        .where('content', '=', memo.content)
        .executeTakeFirst();

      if (existing) {
        continue;
      }

      await query
        .insertInto('customerMemos')
        .values({
          customerName: memo.customerName,
          content: memo.content,
          createdAt: memo.createdAt,
        })
        .execute();
    }
  },
});

export default seed;
