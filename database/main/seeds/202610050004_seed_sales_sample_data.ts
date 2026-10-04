import { defineSeed, type Repository } from '@nocobase/db';

/**
 * Sample data for the sales feature: two customers, three contacts and three
 * opportunities.
 *
 * Every record is looked up by its identifying fields before it is created, so
 * running this seed again — after a reset, or by hand — adds nothing and never
 * overwrites an edited record. Timestamps are fixed rather than taken from the
 * clock so two runs against two databases produce the same rows.
 */
const SEEDED_AT = '2026-01-05T00:00:00.000Z';

interface CustomerRecord {
  id: number;
  name: string;
  industry: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface ContactRecord {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  customerId: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface OpportunityRecord {
  id: number;
  name: string;
  customerId: number;
  amount: number;
  stage: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

async function ensureCustomer(
  repository: Repository<CustomerRecord>,
  input: { name: string; industry: string },
): Promise<CustomerRecord> {
  const existing = await repository.findOne({ filter: { name: input.name } });
  if (existing) return existing;
  const { record } = await repository.createOne({
    values: { ...input, createdAt: SEEDED_AT, updatedAt: SEEDED_AT },
  });
  return record;
}

async function ensureContact(
  repository: Repository<ContactRecord>,
  input: {
    name: string;
    phone: string;
    email: string;
    customerId: number;
  },
): Promise<void> {
  const existing = await repository.findOne({
    filter: { name: input.name, customerId: input.customerId },
  });
  if (existing) return;
  await repository.createOne({
    values: { ...input, createdAt: SEEDED_AT, updatedAt: SEEDED_AT },
  });
}

async function ensureOpportunity(
  repository: Repository<OpportunityRecord>,
  input: {
    name: string;
    customerId: number;
    amount: number;
    stage: string;
  },
): Promise<void> {
  const existing = await repository.findOne({
    filter: { name: input.name, customerId: input.customerId },
  });
  if (existing) return;
  await repository.createOne({
    values: { ...input, createdAt: SEEDED_AT, updatedAt: SEEDED_AT },
  });
}

const seed = defineSeed({
  name: '202610050004_seed_sales_sample_data',
  async run(context) {
    const customers = context.repository<CustomerRecord>('customers');
    const contacts = context.repository<ContactRecord>('contacts');
    const opportunities =
      context.repository<OpportunityRecord>('opportunities');

    const starlight = await ensureCustomer(customers, {
      name: '星辰科技',
      industry: '软件服务',
    });
    const mountain = await ensureCustomer(customers, {
      name: '远山贸易',
      industry: '进出口贸易',
    });

    await ensureContact(contacts, {
      name: '张伟',
      phone: '13800000001',
      email: 'zhangwei@starlight.example.com',
      customerId: starlight.id,
    });
    await ensureContact(contacts, {
      name: '李娜',
      phone: '13800000002',
      email: 'lina@starlight.example.com',
      customerId: starlight.id,
    });
    await ensureContact(contacts, {
      name: '王强',
      phone: '13800000003',
      email: 'wangqiang@mountain.example.com',
      customerId: mountain.id,
    });

    await ensureOpportunity(opportunities, {
      name: '企业版年度订阅',
      customerId: starlight.id,
      amount: 120000,
      stage: 'following',
    });
    await ensureOpportunity(opportunities, {
      name: '数据平台扩容',
      customerId: starlight.id,
      amount: 80000,
      stage: 'won',
    });
    await ensureOpportunity(opportunities, {
      name: '供应链系统',
      customerId: mountain.id,
      amount: 50000,
      stage: 'lost',
    });
  },
});

export default seed;
