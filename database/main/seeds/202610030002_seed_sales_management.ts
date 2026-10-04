import { defineSeed, type Repository } from '@nocobase/db';

interface CustomerRecord {
  id: number;
  name: string;
  industry: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ContactRecord {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  customerId: number;
  createdAt: string;
  updatedAt: string;
}

interface OpportunityRecord {
  id: number;
  name: string;
  customerId: number;
  amount: string | number;
  stage: string;
  createdAt: string;
  updatedAt: string;
}

// A fixed creation instant rather than `new Date()`: seed data has to be reproducible, and nothing about these
// records depends on when the application was installed.
const SEEDED_AT = '2026-10-03T00:00:00.000';

const CUSTOMERS: readonly { name: string; industry: string }[] = [
  { name: 'Northwind Precision Works', industry: 'Precision Manufacturing' },
  { name: 'Bluepeak Software', industry: 'Enterprise Software' },
];

const CONTACTS: readonly {
  customer: string;
  name: string;
  phone: string;
  email: string;
}[] = [
  {
    customer: 'Northwind Precision Works',
    name: 'Zhang Wei',
    phone: '+86 138 0000 1001',
    email: 'zhang.wei@northwind-precision.example',
  },
  {
    customer: 'Northwind Precision Works',
    name: 'Li Na',
    phone: '+86 138 0000 1002',
    email: 'li.na@northwind-precision.example',
  },
  {
    customer: 'Bluepeak Software',
    name: 'Marcus Lee',
    phone: '+86 138 0000 2001',
    email: 'marcus.lee@bluepeak.example',
  },
];

const OPPORTUNITIES: readonly {
  customer: string;
  name: string;
  amount: number;
  stage: string;
}[] = [
  {
    customer: 'Northwind Precision Works',
    name: 'Precision parts annual contract',
    amount: 480000,
    stage: 'following_up',
  },
  {
    customer: 'Northwind Precision Works',
    name: 'Production line expansion phase 2',
    amount: 1200000,
    stage: 'won',
  },
  {
    customer: 'Bluepeak Software',
    name: 'Cloud platform subscription',
    amount: 260000,
    stage: 'lost',
  },
];

// Idempotent by existence, not by upsert: a repeat run must never overwrite a value a user has edited. The seed is
// keyed on the stable business value the application itself uses to recognise a record — a customer's name, and a
// contact's or opportunity's name within its customer.
async function ensureCustomer(
  repository: Repository<CustomerRecord>,
  name: string,
  industry: string,
): Promise<number> {
  const existing = await repository.findOne({ filter: { name } });
  if (existing) {
    return existing.id;
  }
  const created = await repository.createOne({
    values: { name, industry, createdAt: SEEDED_AT, updatedAt: SEEDED_AT },
  });
  return created.record.id;
}

async function ensureContact(
  repository: Repository<ContactRecord>,
  customerId: number,
  contact: { name: string; phone: string; email: string },
): Promise<void> {
  const existing = await repository.findOne({
    filter: { customerId, name: contact.name },
  });
  if (existing) {
    return;
  }
  await repository.createOne({
    values: {
      customerId,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
  });
}

async function ensureOpportunity(
  repository: Repository<OpportunityRecord>,
  customerId: number,
  opportunity: { name: string; amount: number; stage: string },
): Promise<void> {
  const existing = await repository.findOne({
    filter: { customerId, name: opportunity.name },
  });
  if (existing) {
    return;
  }
  await repository.createOne({
    values: {
      customerId,
      name: opportunity.name,
      amount: opportunity.amount,
      stage: opportunity.stage,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
  });
}

const seed = defineSeed({
  name: '202610030002_seed_sales_management',

  async run(context) {
    const customers = context.repository<CustomerRecord>('customers');
    const customerIds = new Map<string, number>();
    for (const customer of CUSTOMERS) {
      customerIds.set(
        customer.name,
        await ensureCustomer(customers, customer.name, customer.industry),
      );
    }

    const contacts = context.repository<ContactRecord>('contacts');
    for (const contact of CONTACTS) {
      const customerId = customerIds.get(contact.customer);
      if (customerId === undefined) {
        throw new Error(
          `Seed contact references unknown customer "${contact.customer}".`,
        );
      }
      await ensureContact(contacts, customerId, contact);
    }

    const opportunities =
      context.repository<OpportunityRecord>('opportunities');
    for (const opportunity of OPPORTUNITIES) {
      const customerId = customerIds.get(opportunity.customer);
      if (customerId === undefined) {
        throw new Error(
          `Seed opportunity references unknown customer "${opportunity.customer}".`,
        );
      }
      await ensureOpportunity(opportunities, customerId, opportunity);
    }
  },
});

export default seed;
