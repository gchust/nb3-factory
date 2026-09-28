import { defineSeed, type Repository, type SeedDefinition } from '@nocobase/db';

type CustomerRow = {
  id: number;
  name: string;
  industry: string | null;
  createdAt: string;
  updatedAt: string;
};

type ContactRow = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  customerId: number;
  createdAt: string;
  updatedAt: string;
};

type OpportunityRow = {
  id: number;
  name: string;
  customerId: number;
  amount: string;
  stage: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Returns the existing record matching `filter`, or creates it.
 *
 * Idempotency is keyed on the row's natural identity rather than its generated
 * primary key: the database assigns `id`, so a repeated run looks the row up by
 * what makes it that row and leaves it alone when it is already there. Values
 * are inserted once and never rewritten, so a re-run cannot clobber an edit.
 * Timestamps are fixed rather than "now" so a row's identity never depends on
 * when the seed happened to run.
 */
type ScalarRow = Record<string, string | number | null>;

async function ensure<T extends ScalarRow & { id: number }>(
  repository: Repository<T>,
  filter: Partial<T>,
  values: Omit<T, 'id'>,
): Promise<T> {
  const existing = await repository.findOne({ filter });
  if (existing) {
    return existing;
  }
  const { record } = await repository.createOne({
    values: values as Parameters<Repository<T>['createOne']>[0]['values'],
  });
  return record;
}

const seed: SeedDefinition = defineSeed({
  name: '202610010002_crm_demo_records',

  run: async (context) => {
    const createdAt = '2026-01-01T00:00:00.000Z';
    const updatedAt = '2026-01-01T00:00:00.000Z';

    const star = await ensure<CustomerRow>(
      context.repository<CustomerRow>('customers'),
      { name: '星辰科技' },
      { name: '星辰科技', industry: '软件与信息服务', createdAt, updatedAt },
    );
    const blue = await ensure<CustomerRow>(
      context.repository<CustomerRow>('customers'),
      { name: '蓝海贸易' },
      { name: '蓝海贸易', industry: '进出口贸易', createdAt, updatedAt },
    );

    await ensure<ContactRow>(
      context.repository<ContactRow>('contacts'),
      { customerId: star.id, name: '张伟' },
      {
        name: '张伟',
        phone: '13800000001',
        email: 'zhangwei@example.com',
        customerId: star.id,
        createdAt,
        updatedAt,
      },
    );
    await ensure<ContactRow>(
      context.repository<ContactRow>('contacts'),
      { customerId: star.id, name: '李娜' },
      {
        name: '李娜',
        phone: '13800000002',
        email: 'lina@example.com',
        customerId: star.id,
        createdAt,
        updatedAt,
      },
    );
    await ensure<ContactRow>(
      context.repository<ContactRow>('contacts'),
      { customerId: blue.id, name: '王强' },
      {
        name: '王强',
        phone: '13800000003',
        email: 'wangqiang@example.com',
        customerId: blue.id,
        createdAt,
        updatedAt,
      },
    );

    await ensure<OpportunityRow>(
      context.repository<OpportunityRow>('opportunities'),
      { customerId: star.id, name: '企业版续约' },
      {
        name: '企业版续约',
        customerId: star.id,
        amount: '120000.00',
        stage: 'won',
        createdAt,
        updatedAt,
      },
    );
    await ensure<OpportunityRow>(
      context.repository<OpportunityRow>('opportunities'),
      { customerId: star.id, name: '数据平台升级' },
      {
        name: '数据平台升级',
        customerId: star.id,
        amount: '80000.00',
        stage: 'following',
        createdAt,
        updatedAt,
      },
    );
    await ensure<OpportunityRow>(
      context.repository<OpportunityRow>('opportunities'),
      { customerId: blue.id, name: '年度采购合同' },
      {
        name: '年度采购合同',
        customerId: blue.id,
        amount: '50000.00',
        stage: 'lost',
        createdAt,
        updatedAt,
      },
    );
  },
});

export default seed;
