import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

export type SeedContractCategory = 'procurement' | 'sales' | 'service';

export interface ContractSeedRow {
  readonly name: string;
  readonly counterparty: string;
  readonly category: SeedContractCategory;
}

const SEED_TIMESTAMP = '2026-09-13T00:00:00.000';

/** Representative contracts across every category, so the list filter has data to show. */
export function contractSeedRows(): readonly ContractSeedRow[] {
  return [
    {
      name: '办公用品年度采购合同',
      counterparty: '杭州智汇办公设备有限公司',
      category: 'procurement',
    },
    {
      name: '服务器机架采购合同',
      counterparty: '宁波云启科技有限公司',
      category: 'procurement',
    },
    {
      name: '企业管理软件销售合同',
      counterparty: '上海恒信信息技术有限公司',
      category: 'sales',
    },
    {
      name: '数据中心运维服务合同',
      counterparty: '北京安泰技术服务有限公司',
      category: 'service',
    },
  ];
}

const run = async ({ query }: SeedContext): Promise<void> => {
  const existing = new Set(
    await query
      .selectFrom('contracts')
      .select(['name'])
      .execute()
      .then((rows) => rows.map((row) => row.name as string)),
  );

  for (const row of contractSeedRows()) {
    // Skip by name so a second run (or a user-created row with the same name)
    // never causes duplicates.
    if (existing.has(row.name)) continue;
    await query
      .insertInto('contracts')
      .values({
        name: row.name,
        counterparty: row.counterparty,
        category: row.category,
        attachmentId: null,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      })
      .execute();
  }
};

const seed: SeedDefinition = defineSeed({
  name: '202609130003_seed_contracts',
  run,
});

export default seed;
