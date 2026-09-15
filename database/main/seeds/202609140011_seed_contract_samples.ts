import {
  defineSeed,
  type QueryAdapter,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Example contracts so the ledger, the expiry filter and the statistics page are not empty on a fresh install.
 *
 * Scans are intentionally not seeded: they require a real stored object behind them and the upload control is the
 * only supported way to create one. The seed is idempotent on `contractNo` and never rewrites a row a user has
 * edited.
 */
interface SampleContract {
  readonly contractNo: string;
  readonly name: string;
  readonly counterparty: string;
  readonly type: string;
  readonly signedDate: string;
  readonly effectiveDate: string;
  readonly expiryDate: string;
  readonly amount: number;
  readonly status: string;
  readonly versions: readonly {
    readonly versionNo: string;
    readonly description: string;
    readonly uploadedAt: string;
  }[];
}

const SAMPLES: readonly SampleContract[] = [
  {
    contractNo: 'HT-2026-0001',
    name: '华北区设备销售合同',
    counterparty: '华北科技有限公司',
    type: 'sale',
    signedDate: '2026-01-10',
    effectiveDate: '2026-01-15',
    expiryDate: '2026-12-31',
    amount: 1200000,
    status: 'active',
    versions: [
      {
        versionNo: 'V1.0',
        description: '双方首次签署版本',
        uploadedAt: '2026-01-10',
      },
      {
        versionNo: 'V1.1',
        description: '补充付款条款',
        uploadedAt: '2026-02-02',
      },
    ],
  },
  {
    contractNo: 'HT-2026-0002',
    name: '电子元器件采购合同',
    counterparty: '恒信电子有限公司',
    type: 'purchase',
    signedDate: '2026-02-01',
    effectiveDate: '2026-02-10',
    expiryDate: '2027-01-31',
    amount: 860000,
    status: 'active',
    versions: [
      {
        versionNo: 'V1.0',
        description: '标准采购条款',
        uploadedAt: '2026-02-01',
      },
    ],
  },
  {
    contractNo: 'HT-2026-0003',
    name: '云平台运维服务合同',
    counterparty: '云智服务有限公司',
    type: 'service',
    signedDate: '2026-03-05',
    effectiveDate: '2026-03-10',
    expiryDate: '2027-03-09',
    amount: 320000,
    status: 'draft',
    versions: [],
  },
  {
    contractNo: 'HT-2026-0004',
    name: '城东办公场地租赁合同',
    counterparty: '城东物业管理有限公司',
    type: 'lease',
    signedDate: '2026-04-01',
    effectiveDate: '2026-04-01',
    expiryDate: '2026-10-05',
    amount: 150000,
    status: 'active',
    versions: [
      {
        versionNo: 'V1.0',
        description: '租赁主合同',
        uploadedAt: '2026-04-01',
      },
    ],
  },
  {
    contractNo: 'HT-2026-0005',
    name: '远洋贸易销售框架合同',
    counterparty: '远洋贸易股份有限公司',
    type: 'sale',
    signedDate: '2025-06-01',
    effectiveDate: '2025-06-05',
    expiryDate: '2026-05-31',
    amount: 540000,
    status: 'terminated',
    versions: [],
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609140011_seed_contract_samples',

  async run({ query, connection }) {
    const owner = await resolveOwner(query, connection);
    const now = new Date();

    for (const sample of SAMPLES) {
      const existing = await query
        .selectFrom('contracts')
        .select(['id'])
        .where('contractNo', '=', sample.contractNo)
        .executeTakeFirst();
      if (existing) continue;

      const contractId = crypto.randomUUID();
      await query
        .insertInto('contracts')
        .values({
          id: contractId,
          contractNo: sample.contractNo,
          name: sample.name,
          counterparty: sample.counterparty,
          type: sample.type,
          signedDate: sample.signedDate,
          effectiveDate: sample.effectiveDate,
          expiryDate: sample.expiryDate,
          amount: sample.amount,
          ownerId: owner.id,
          ownerName: owner.name,
          createdById: owner.id,
          status: sample.status,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      for (const version of sample.versions) {
        await query
          .insertInto('contractVersions')
          .values({
            id: crypto.randomUUID(),
            contractId,
            versionNo: version.versionNo,
            description: version.description,
            uploadedAt: new Date(`${version.uploadedAt}T00:00:00.000Z`),
            uploadedById: owner.id,
            uploadedByName: owner.name,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }
  },
});

async function resolveOwner(
  query: QueryAdapter,
  connection: { client<T = unknown>(): Promise<T> },
): Promise<{ id: string; name: string }> {
  const client = await connection.client<{
    readonly schema: { hasTable(table: string): Promise<boolean> };
  }>();
  if (!(await client.schema.hasTable('user'))) {
    return { id: 'sample-owner', name: '示例负责人' };
  }
  const row = await query
    .selectFrom('user')
    .select(['id', 'name'])
    .where('username', '=', 'nocobase')
    .executeTakeFirst();
  if (row && typeof row.id === 'string') {
    return {
      id: row.id,
      name: typeof row.name === 'string' ? row.name : 'nocobase',
    };
  }
  return { id: 'sample-owner', name: '示例负责人' };
}

export default seed;
