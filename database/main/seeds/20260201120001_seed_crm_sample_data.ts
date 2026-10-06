import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Sample data for the sales team: two customers, three contacts and three
 * opportunities, one per stage.
 *
 * Idempotent on purpose. Every row is keyed on the unique business key declared
 * by the migration (`customers.name`, `contacts.customerId+name`,
 * `opportunities.customerId+name`) and written with `upsertOne`, so running the
 * seed again updates the same rows instead of inserting duplicates. The
 * timestamps are fixed constants, so a repeated run is also a content no-op.
 */

interface SeedCustomer {
  readonly name: string;
  readonly industry: string;
}

interface SeedContact {
  readonly customer: string;
  readonly name: string;
  readonly phone: string;
  readonly email: string;
}

interface SeedOpportunity {
  readonly customer: string;
  readonly name: string;
  readonly amount: number;
  readonly stage: 'following' | 'won' | 'lost';
}

interface CustomerRecord {
  id: number;
  name: string;
  industry: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ContactRecord {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  customerId: number;
  createdAt: Date;
  updatedAt: Date;
}

interface OpportunityRecord {
  id: number;
  name: string;
  customerId: number;
  amount: number;
  stage: string;
  createdAt: Date;
  updatedAt: Date;
}

const CUSTOMERS: readonly SeedCustomer[] = [
  { name: '蓝海科技', industry: '信息技术' },
  { name: '远山制造', industry: '智能制造' },
];

const CONTACTS: readonly SeedContact[] = [
  {
    customer: '蓝海科技',
    name: '张伟',
    phone: '13800000001',
    email: 'zhangwei@lanhai.example.com',
  },
  {
    customer: '蓝海科技',
    name: '李娜',
    phone: '13800000002',
    email: 'lina@lanhai.example.com',
  },
  {
    customer: '远山制造',
    name: '王强',
    phone: '13800000003',
    email: 'wangqiang@yuanshan.example.com',
  },
];

const OPPORTUNITIES: readonly SeedOpportunity[] = [
  {
    customer: '蓝海科技',
    name: '数据平台续约',
    amount: 120000,
    stage: 'following',
  },
  { customer: '蓝海科技', name: '云迁移项目', amount: 80000, stage: 'won' },
  { customer: '远山制造', name: '产线改造方案', amount: 260000, stage: 'lost' },
];

const SEEDED_AT = new Date('2026-02-01T02:00:00.000Z');

const seed: SeedDefinition = defineSeed({
  name: '20260201120001_seed_crm_sample_data',
  async run(context) {
    const customers = context.repository<CustomerRecord>('customers');

    for (const customer of CUSTOMERS) {
      await customers.upsertOne({
        filter: { name: customer.name },
        create: {
          name: customer.name,
          industry: customer.industry,
          createdAt: SEEDED_AT,
          updatedAt: SEEDED_AT,
        },
        update: {
          industry: customer.industry,
          updatedAt: SEEDED_AT,
        },
      });
    }

    const contacts = context.repository<ContactRecord>('contacts');
    for (const contact of CONTACTS) {
      const customer = await customers.findOne({
        filter: { name: contact.customer },
      });
      if (!customer) continue;

      await contacts.upsertOne({
        filter: { customerId: customer.id, name: contact.name },
        create: {
          customerId: customer.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          createdAt: SEEDED_AT,
          updatedAt: SEEDED_AT,
        },
        update: {
          phone: contact.phone,
          email: contact.email,
          updatedAt: SEEDED_AT,
        },
      });
    }

    const opportunities =
      context.repository<OpportunityRecord>('opportunities');
    for (const opportunity of OPPORTUNITIES) {
      const customer = await customers.findOne({
        filter: { name: opportunity.customer },
      });
      if (!customer) continue;

      await opportunities.upsertOne({
        filter: { customerId: customer.id, name: opportunity.name },
        create: {
          customerId: customer.id,
          name: opportunity.name,
          amount: opportunity.amount,
          stage: opportunity.stage,
          createdAt: SEEDED_AT,
          updatedAt: SEEDED_AT,
        },
        update: {
          amount: opportunity.amount,
          stage: opportunity.stage,
          updatedAt: SEEDED_AT,
        },
      });
    }
  },
});

export default seed;
