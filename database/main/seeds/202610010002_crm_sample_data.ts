import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * The sample desk the sales team starts from: two customers, three contacts and three opportunities.
 *
 * Installation data only — it creates no structure. Every record carries a fixed id, and the seed skips a record whose
 * id already exists, so re-running it (after a failed batch, or against a database that received it twice) adds
 * nothing a second time instead of duplicating the desk.
 */
const customers = [
  {
    id: '3f2a1c40-0c3e-4e5f-9a1b-2c7d8e9f0a01',
    name: '星海科技',
    industry: '软件与信息服务',
  },
  {
    id: '3f2a1c40-0c3e-4e5f-9a1b-2c7d8e9f0a02',
    name: '远山贸易',
    industry: '国际贸易',
  },
] as const;

const contacts = [
  {
    id: '5b7d2e60-1d4a-4f60-8b2c-3d8e9f0a1b01',
    name: '张伟',
    contact: '13800000001',
    customerId: customers[0].id,
  },
  {
    id: '5b7d2e60-1d4a-4f60-8b2c-3d8e9f0a1b02',
    name: '李娜',
    contact: 'lina@xinghai.example.com',
    customerId: customers[0].id,
  },
  {
    id: '5b7d2e60-1d4a-4f60-8b2c-3d8e9f0a1b03',
    name: '王强',
    contact: 'wangqiang@yuanshan.example.com',
    customerId: customers[1].id,
  },
] as const;

const opportunities = [
  {
    id: '7c9e3f80-2e5b-4a71-9c3d-4e9f0a1b2c01',
    name: '星海科技 CRM 系统升级',
    amount: 120000,
    stage: 'following',
    customerId: customers[0].id,
  },
  {
    id: '7c9e3f80-2e5b-4a71-9c3d-4e9f0a1b2c02',
    name: '星海科技 数据中台二期',
    amount: 30000,
    stage: 'won',
    customerId: customers[0].id,
  },
  {
    id: '7c9e3f80-2e5b-4a71-9c3d-4e9f0a1b2c03',
    name: '远山贸易 供应链协同平台',
    amount: 80000,
    stage: 'following',
    customerId: customers[1].id,
  },
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202610010002_crm_sample_data',
  async run(context) {
    const startedAt = Date.now();
    // Read off the context rather than destructuring it: the context's methods are called on it, and an unbound
    // reference to one is a lint error everywhere in this application.
    const customerRepository = context.repository('customers');
    const contactRepository = context.repository('contacts');
    const opportunityRepository = context.repository('opportunities');
    /**
     * One minute apart, in declaration order. Every record would otherwise share the same timestamp, and a list
     * ordered by it would come back in whatever order the database happened to return.
     */
    const recordedAt = (index: number): Date =>
      new Date(startedAt - index * 60_000);

    for (const [index, customer] of customers.entries()) {
      const existing = await customerRepository.findOne({
        filter: { id: customer.id },
      });
      if (existing) continue;
      const timestamp = recordedAt(index);
      await customerRepository.createOne({
        values: { ...customer, createdAt: timestamp, updatedAt: timestamp },
      });
    }

    for (const [index, contact] of contacts.entries()) {
      const existing = await contactRepository.findOne({
        filter: { id: contact.id },
      });
      if (existing) continue;
      const timestamp = recordedAt(index);
      await contactRepository.createOne({
        values: { ...contact, createdAt: timestamp, updatedAt: timestamp },
      });
    }

    for (const [index, opportunity] of opportunities.entries()) {
      const existing = await opportunityRepository.findOne({
        filter: { id: opportunity.id },
      });
      if (existing) continue;
      const timestamp = recordedAt(index);
      await opportunityRepository.createOne({
        values: { ...opportunity, createdAt: timestamp, updatedAt: timestamp },
      });
    }
  },
});

export default seed;
