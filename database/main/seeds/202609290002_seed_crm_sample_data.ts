import { defineSeed, type SeedContext } from '@nocobase/db';

/**
 * Required starting content for the CRM feature: the two customers, three
 * contacts and three opportunities an operator expects to find on first login.
 *
 * It is idempotent without adding constraints the product did not ask for:
 * every record is looked up by a stable business key and only created when it
 * is absent, so a repeat run is a no-op and a value the user has edited is
 * never overwritten.
 */
const FIXED_TIMESTAMP = '2026-09-01T08:00:00.000Z';

// Local row shapes: a seed stays self-contained, so it declares the columns it
// writes instead of importing a record type that keeps evolving.
interface CustomerRow {
  id: number;
  name: string;
  industry: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ContactRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  customerId: number;
  createdAt: string;
  updatedAt: string;
}

interface OpportunityRow {
  id: number;
  name: string;
  customerId: number;
  amount: string | number;
  stage: string;
  createdAt: string;
  updatedAt: string;
}

interface CustomerSeed {
  name: string;
  industry: string;
}

interface ContactSeed {
  name: string;
  customerName: string;
  phone: string | null;
  email: string | null;
}

interface OpportunitySeed {
  name: string;
  customerName: string;
  amount: number;
  stage: 'follow_up' | 'won' | 'lost';
}

const CUSTOMERS: readonly CustomerSeed[] = [
  { name: '星海科技', industry: '信息技术' },
  { name: '晨光贸易', industry: '批发零售' },
];

const CONTACTS: readonly ContactSeed[] = [
  {
    name: '张伟',
    customerName: '星海科技',
    phone: '13800000001',
    email: 'zhangwei@xinghai.example.com',
  },
  {
    name: '李娜',
    customerName: '星海科技',
    phone: '13800000002',
    email: 'lina@xinghai.example.com',
  },
  {
    name: '王强',
    customerName: '晨光贸易',
    phone: '13800000003',
    email: 'wangqiang@chenguang.example.com',
  },
];

const OPPORTUNITIES: readonly OpportunitySeed[] = [
  {
    name: '星海科技 ERP 升级',
    customerName: '星海科技',
    amount: 120000,
    stage: 'follow_up',
  },
  {
    name: '星海科技数据中台',
    customerName: '星海科技',
    amount: 80000,
    stage: 'won',
  },
  {
    name: '晨光贸易供应链系统',
    customerName: '晨光贸易',
    amount: 45000,
    stage: 'lost',
  },
];

async function ensureCustomer(
  context: SeedContext,
  seed: CustomerSeed,
): Promise<number> {
  const repository = context.repository<CustomerRow>('customers');
  const existing = await repository.findOne({
    filter: { name: seed.name },
  });

  if (existing) {
    return existing.id;
  }

  const created = await repository.createOne({
    values: {
      name: seed.name,
      industry: seed.industry,
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
  });

  return created.record.id;
}

export default defineSeed({
  name: '202609290002_seed_crm_sample_data',

  async run(context) {
    const customerIds = new Map<string, number>();

    for (const customer of CUSTOMERS) {
      customerIds.set(customer.name, await ensureCustomer(context, customer));
    }

    const contacts = context.repository<ContactRow>('contacts');

    for (const contact of CONTACTS) {
      const customerId = customerIds.get(contact.customerName);

      if (customerId === undefined) {
        throw new Error(`Unknown seed customer: ${contact.customerName}`);
      }

      const existing = await contacts.findOne({
        filter: { customerId, name: contact.name },
      });

      if (existing) {
        continue;
      }

      await contacts.createOne({
        values: {
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          customerId,
          createdAt: FIXED_TIMESTAMP,
          updatedAt: FIXED_TIMESTAMP,
        },
      });
    }

    const opportunities = context.repository<OpportunityRow>('opportunities');

    for (const opportunity of OPPORTUNITIES) {
      const customerId = customerIds.get(opportunity.customerName);

      if (customerId === undefined) {
        throw new Error(`Unknown seed customer: ${opportunity.customerName}`);
      }

      const existing = await opportunities.findOne({
        filter: { customerId, name: opportunity.name },
      });

      if (existing) {
        continue;
      }

      await opportunities.createOne({
        values: {
          name: opportunity.name,
          amount: opportunity.amount,
          stage: opportunity.stage,
          customerId,
          createdAt: FIXED_TIMESTAMP,
          updatedAt: FIXED_TIMESTAMP,
        },
      });
    }
  },
});
