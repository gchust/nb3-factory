import {
  defineSeed,
  type RepositoryRecord,
  type SeedDefinition,
} from '@nocobase/db';

interface CustomerRow extends RepositoryRecord {
  id: number;
  name: string;
  industry: string | null;
}

interface ContactRow extends RepositoryRecord {
  id: number;
  name: string;
  contact: string | null;
  customerId: number;
}

interface OpportunityRow extends RepositoryRecord {
  id: number;
  name: string;
  customerId: number;
  amount: number;
  stage: 'following' | 'won' | 'lost';
}

interface SampleContact {
  readonly name: string;
  readonly contact: string;
}

interface SampleOpportunity {
  readonly name: string;
  readonly amount: number;
  readonly stage: 'following' | 'won' | 'lost';
}

interface SampleCustomer {
  readonly name: string;
  readonly industry: string;
  readonly contacts: readonly SampleContact[];
  readonly opportunities: readonly SampleOpportunity[];
}

const CUSTOMERS: readonly SampleCustomer[] = [
  {
    name: '华东制造',
    industry: '制造业',
    contacts: [
      { name: '张伟', contact: '13800000001' },
      { name: '王强', contact: 'qiang.wang@example.com' },
    ],
    opportunities: [
      { name: '产线升级项目', amount: 1200000, stage: 'following' },
      { name: '智能仓储项目', amount: 600000, stage: 'won' },
    ],
  },
  {
    name: '星辰科技',
    industry: '信息技术',
    contacts: [{ name: '李娜', contact: 'lina@starlight.example' }],
    opportunities: [
      { name: '数据中台项目', amount: 800000, stage: 'following' },
    ],
  },
];

/**
 * Two sample customers, three contacts and three opportunities.
 *
 * The seed is deliberately idempotent: each record is looked up by its natural key (a customer by name, a contact or
 * opportunity by name within its customer) and created only when it is missing. Running it twice — or against a
 * database that already holds the samples — adds nothing and overwrites nothing.
 */
const seed: SeedDefinition = defineSeed({
  name: '20261001120001_crm_sample_data',
  async run(context) {
    const customers = context.repository<CustomerRow>('customers');
    const contacts = context.repository<ContactRow>('contacts');
    const opportunities = context.repository<OpportunityRow>('opportunities');

    for (const sample of CUSTOMERS) {
      let customer = await customers.findOne({ filter: { name: sample.name } });
      if (!customer) {
        customer = (
          await customers.createOne({
            values: { name: sample.name, industry: sample.industry },
          })
        ).record;
      }

      for (const contact of sample.contacts) {
        const existing = await contacts.findOne({
          filter: { name: contact.name, customerId: customer.id },
        });
        if (!existing) {
          await contacts.createOne({
            values: {
              name: contact.name,
              contact: contact.contact,
              customerId: customer.id,
            },
          });
        }
      }

      for (const opportunity of sample.opportunities) {
        const existing = await opportunities.findOne({
          filter: { name: opportunity.name, customerId: customer.id },
        });
        if (!existing) {
          await opportunities.createOne({
            values: {
              name: opportunity.name,
              amount: opportunity.amount,
              stage: opportunity.stage,
              customerId: customer.id,
            },
          });
        }
      }
    }
  },
});

export default seed;
