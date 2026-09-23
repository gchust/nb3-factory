import { defineSeed, type SeedDefinition } from '@nocobase/db';
import type { QueryAdapter } from '@nocobase/db';

/**
 * The smallest data set the CRM is useful with: two customers, three contacts and
 * three opportunities, one in each stage.
 *
 * Every write is "insert only when the identifying record is absent", so running the seed
 * again against an existing database adds nothing and never overwrites data a user edited.
 * Timestamps are fixed rather than `new Date()` so the same seed produces the same rows.
 */
// A `datetime` field is a naive V1 value, so the fixed timestamp carries no timezone suffix.
const SEEDED_AT = '2026-01-01T00:00:00.000';

interface SeedCustomer {
  readonly name: string;
  readonly industry: string;
}

interface SeedContact {
  readonly name: string;
  readonly contactInfo: string;
  readonly customer: string;
}

interface SeedOpportunity {
  readonly name: string;
  readonly customer: string;
  readonly amount: number;
  readonly stage: 'following' | 'won' | 'lost';
}

const CUSTOMERS: readonly SeedCustomer[] = [
  { name: '星河科技', industry: '软件服务' },
  { name: '蓝海贸易', industry: '国际贸易' },
];

const CONTACTS: readonly SeedContact[] = [
  { name: '张伟', contactInfo: '13800000001', customer: '星河科技' },
  { name: '李娜', contactInfo: 'lina@example.com', customer: '星河科技' },
  { name: '王强', contactInfo: '13900000002', customer: '蓝海贸易' },
];

const OPPORTUNITIES: readonly SeedOpportunity[] = [
  {
    name: '星河科技-年度续费',
    customer: '星河科技',
    amount: 120000,
    stage: 'won',
  },
  {
    name: '星河科技-新增模块',
    customer: '星河科技',
    amount: 80000,
    stage: 'following',
  },
  {
    name: '蓝海贸易-仓储系统',
    customer: '蓝海贸易',
    amount: 250000,
    stage: 'lost',
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609230002_seed_crm_data',

  async run({ query }) {
    const customerIds = new Map<string, number>();
    for (const customer of CUSTOMERS) {
      let id = await findCustomerId(query, customer.name);
      if (id === null) {
        id = await insertCustomer(query, customer);
      }
      customerIds.set(customer.name, id);
    }

    for (const contact of CONTACTS) {
      const customerId = customerIds.get(contact.customer);
      if (customerId === undefined) continue;
      if (await exists(query, 'contacts', contact.name, customerId)) continue;
      await query
        .insertInto('contacts')
        .values({
          name: contact.name,
          contactInfo: contact.contactInfo,
          customerId,
          createdAt: SEEDED_AT,
          updatedAt: SEEDED_AT,
        })
        .execute();
    }

    for (const opportunity of OPPORTUNITIES) {
      const customerId = customerIds.get(opportunity.customer);
      if (customerId === undefined) continue;
      if (await exists(query, 'opportunities', opportunity.name, customerId)) {
        continue;
      }
      await query
        .insertInto('opportunities')
        .values({
          name: opportunity.name,
          customerId,
          amount: opportunity.amount,
          stage: opportunity.stage,
          createdAt: SEEDED_AT,
          updatedAt: SEEDED_AT,
        })
        .execute();
    }
  },
});

async function findCustomerId(
  query: QueryAdapter,
  name: string,
): Promise<number | null> {
  const row = await query
    .selectFrom('customers')
    .select(['id'])
    .where('name', '=', name)
    .executeTakeFirst();
  return row ? Number(row.id) : null;
}

async function insertCustomer(
  query: QueryAdapter,
  customer: SeedCustomer,
): Promise<number> {
  const result = await query
    .insertInto('customers')
    .values({
      name: customer.name,
      industry: customer.industry,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    })
    .execute();
  return Number(result.insertId);
}

/** Child rows are identified by their name within a customer, which is what the seed fixes. */
async function exists(
  query: QueryAdapter,
  table: 'contacts' | 'opportunities',
  name: string,
  customerId: number,
): Promise<boolean> {
  const row = await query
    .selectFrom(table)
    .select(['id'])
    .where('name', '=', name)
    .where('customerId', '=', customerId)
    .executeTakeFirst();
  return row !== undefined;
}

export default seed;
