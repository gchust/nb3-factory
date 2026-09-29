import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Sample CRM data for a first look at the application: two customers, three
 * contacts and three opportunities.
 *
 * The seed is idempotent: every record is looked up by its business key (the
 * customer name, or the contact and opportunity name inside their customer)
 * and only created when it is missing, so re-running it after a partial
 * failure adds nothing twice. Timestamps are fixed so the sample stays
 * reproducible instead of depending on when the seed ran.
 */
const SEEDED_AT = '2026-01-01T00:00:00.000Z';

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
  amount: number;
  stage: 'nurturing' | 'won' | 'lost';
  createdAt: string;
  updatedAt: string;
}

const CUSTOMERS: readonly { name: string; industry: string }[] = [
  { name: 'Acme Manufacturing', industry: 'Manufacturing' },
  { name: 'Northwind Trading', industry: 'Wholesale' },
];

const CONTACTS: readonly {
  name: string;
  phone: string;
  email: string;
  customer: string;
}[] = [
  {
    name: 'Alice Chen',
    phone: '+1 415 555 0132',
    email: 'alice.chen@acme.example.com',
    customer: 'Acme Manufacturing',
  },
  {
    name: 'David Park',
    phone: '+1 415 555 0177',
    email: 'david.park@acme.example.com',
    customer: 'Acme Manufacturing',
  },
  {
    name: 'Maria Lopez',
    phone: '+1 206 555 0148',
    email: 'maria.lopez@northwind.example.com',
    customer: 'Northwind Trading',
  },
];

const OPPORTUNITIES: readonly {
  name: string;
  amount: number;
  stage: OpportunityRecord['stage'];
  customer: string;
}[] = [
  {
    name: 'Annual supply contract',
    amount: 120000,
    stage: 'nurturing',
    customer: 'Acme Manufacturing',
  },
  {
    name: 'Packaging line upgrade',
    amount: 85000,
    stage: 'won',
    customer: 'Acme Manufacturing',
  },
  {
    name: 'Warehouse software rollout',
    amount: 45000,
    stage: 'lost',
    customer: 'Northwind Trading',
  },
];

async function ensureCustomer(
  context: SeedContext,
  data: { name: string; industry: string },
): Promise<number> {
  const repository = context.repository<CustomerRecord>('crmCustomers');
  const existing = await repository.findOne({ filter: { name: data.name } });
  if (existing) {
    return existing.id;
  }
  const created = await repository.createOne({
    values: { ...data, createdAt: SEEDED_AT, updatedAt: SEEDED_AT },
  });
  return created.record.id;
}

const seed: SeedDefinition = defineSeed({
  name: '20260928000002_seed_crm_sample_data',
  async run(context) {
    const customerIds = new Map<string, number>();
    for (const customer of CUSTOMERS) {
      customerIds.set(customer.name, await ensureCustomer(context, customer));
    }

    for (const contact of CONTACTS) {
      const customerId = customerIds.get(contact.customer);
      if (customerId === undefined) {
        throw new Error(`Unknown seed customer: ${contact.customer}`);
      }
      const repository = context.repository<ContactRecord>('crmContacts');
      const existing = await repository.findOne({
        filter: { customerId, name: contact.name },
      });
      if (!existing) {
        await repository.createOne({
          values: {
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
            customerId,
            createdAt: SEEDED_AT,
            updatedAt: SEEDED_AT,
          },
        });
      }
    }

    for (const opportunity of OPPORTUNITIES) {
      const customerId = customerIds.get(opportunity.customer);
      if (customerId === undefined) {
        throw new Error(`Unknown seed customer: ${opportunity.customer}`);
      }
      const repository =
        context.repository<OpportunityRecord>('crmOpportunities');
      const existing = await repository.findOne({
        filter: { customerId, name: opportunity.name },
      });
      if (!existing) {
        await repository.createOne({
          values: {
            name: opportunity.name,
            amount: opportunity.amount,
            stage: opportunity.stage,
            customerId,
            createdAt: SEEDED_AT,
            updatedAt: SEEDED_AT,
          },
        });
      }
    }
  },
});

export default seed;
