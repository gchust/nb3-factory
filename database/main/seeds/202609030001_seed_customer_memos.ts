import { defineSeed } from '@nocobase/db';

/**
 * The three example customer memos the application starts with.
 *
 * Customer names are not unique in this application — two customers may share a
 * name — so the seed cannot key idempotency on a unique constraint the way an
 * `upsertOne` would require. Instead each record is created only when a memo
 * with the same name does not already exist, which makes a repeated seed run a
 * no-op without forcing a uniqueness rule the business does not have.
 */
const seed = defineSeed({
  name: '202609030001_seed_customer_memos',

  async run(context) {
    const memos = context.repository('customerMemos');

    const samples = [
      {
        name: '星河精密制造有限公司',
        notes: '长期合作客户，主要采购高精度轴承组件。',
      },
      {
        name: '云帆供应链管理有限公司',
        notes: '账期 30 天，需在季度末前完成对账。',
      },
      {
        name: '青禾食品科技有限公司',
        notes: '新客户，首次订单金额较小，建议重点跟进。',
      },
    ];

    for (const sample of samples) {
      const existing = await memos.findOne({
        filter: { name: sample.name },
      });
      if (existing) continue;

      await memos.createOne({
        values: {
          name: sample.name,
          notes: sample.notes,
          createdAt: new Date(),
        },
      });
    }
  },
});

export default seed;
