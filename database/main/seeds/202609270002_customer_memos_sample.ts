import { defineSeed } from '@nocobase/db';

interface CustomerMemoSample {
  readonly customerName: string;
  readonly note: string | null;
  readonly createdAt: string;
}

/**
 * Fictional starting data. The seed is keyed by customer name and skips a name
 * that is already present, so re-running it neither duplicates the samples nor
 * overwrites a memo someone edited. Timestamps are fixed rather than generated
 * so the seed produces the same rows on every installation.
 */
const sampleMemos: readonly CustomerMemoSample[] = [
  {
    customerName: '星河智能科技有限公司',
    note: '年度软件授权已续约，关注第二季度上线的数据看板。',
    createdAt: '2026-08-12T02:30:00.000Z',
  },
  {
    customerName: '青禾食品有限公司',
    note: '对账周期从月结改为周结，财务联系人王敏。',
    createdAt: '2026-08-20T06:05:00.000Z',
  },
  {
    customerName: '远山物流股份有限公司',
    note: '计划新增两个仓库，需要重新评估接口对接排期。',
    createdAt: '2026-09-01T09:40:00.000Z',
  },
];

export default defineSeed({
  name: '202609270002_customer_memos_sample',
  async run(context) {
    const memos = context.repository<CustomerMemoSample>('customerMemos');
    for (const memo of sampleMemos) {
      const exists = await memos.exists({
        filter: { customerName: memo.customerName },
      });
      if (!exists) {
        await memos.createOne({ values: memo });
      }
    }
  },
});
