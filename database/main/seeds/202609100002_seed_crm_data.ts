import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Installation data for the simple CRM feature: exactly two customers, three
 * contacts and three opportunities.
 *
 * Every write goes through `upsertOne` keyed on a unique business value (a
 * customer by name, a contact or opportunity by customer and name), so running
 * the seed again updates the same rows instead of duplicating them. `createdAt`
 * is fixed so a fresh database always receives the same records.
 */

interface CustomerRecord {
  id: number;
  name: string;
  industry: string | null;
  createdAt: Date;
}

interface ContactRecord {
  id: number;
  name: string;
  contactInfo: string | null;
  customerId: number;
  createdAt: Date;
}

interface OpportunityRecord {
  id: number;
  name: string;
  customerId: number;
  amount: number;
  stage: string;
  createdAt: Date;
}

const CREATED_AT = new Date('2026-09-01T00:00:00.000Z');

const CUSTOMERS = [
  { name: '阿尔法制造', industry: '制造业' },
  { name: '蓝海贸易', industry: '贸易' },
] as const;

const CONTACTS = [
  { customerName: '阿尔法制造', name: '张伟', contactInfo: '13800000001' },
  { customerName: '阿尔法制造', name: '李娜', contactInfo: 'lina@example.com' },
  {
    customerName: '蓝海贸易',
    name: '王强',
    contactInfo: 'wangqiang@example.com',
  },
] as const;

const OPPORTUNITIES = [
  {
    customerName: '阿尔法制造',
    name: '智能产线改造',
    amount: 480000,
    stage: 'following',
  },
  {
    customerName: '阿尔法制造',
    name: '备件采购',
    amount: 86000,
    stage: 'won',
  },
  {
    customerName: '蓝海贸易',
    name: '出口订单',
    amount: 210000,
    stage: 'lost',
  },
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609100002_seed_crm_data',
  async run(context) {
    const customers = context.repository<CustomerRecord>('customers');
    const contacts = context.repository<ContactRecord>('contacts');
    const opportunities =
      context.repository<OpportunityRecord>('opportunities');

    const customerIds = new Map<string, number>();
    for (const customer of CUSTOMERS) {
      const { record } = await customers.upsertOne({
        filter: { name: customer.name },
        create: {
          name: customer.name,
          industry: customer.industry,
          createdAt: CREATED_AT,
        },
        update: { industry: customer.industry },
      });
      customerIds.set(customer.name, record.id);
    }

    const requireCustomerId = (name: string): number => {
      const id = customerIds.get(name);
      if (id === undefined) {
        throw new Error(`Seed customer "${name}" was not created.`);
      }
      return id;
    };

    for (const contact of CONTACTS) {
      const customerId = requireCustomerId(contact.customerName);
      await contacts.upsertOne({
        filter: { customerId, name: contact.name },
        create: {
          customerId,
          name: contact.name,
          contactInfo: contact.contactInfo,
          createdAt: CREATED_AT,
        },
        update: { contactInfo: contact.contactInfo },
      });
    }

    for (const opportunity of OPPORTUNITIES) {
      const customerId = requireCustomerId(opportunity.customerName);
      await opportunities.upsertOne({
        filter: { customerId, name: opportunity.name },
        create: {
          customerId,
          name: opportunity.name,
          amount: opportunity.amount,
          stage: opportunity.stage,
          createdAt: CREATED_AT,
        },
        update: { amount: opportunity.amount, stage: opportunity.stage },
      });
    }
  },
});

export default seed;
