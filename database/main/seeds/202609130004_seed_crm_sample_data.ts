import {
  defineSeed,
  type QueryAdapter,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Demonstration data for the Sales CRM.
 *
 * The company asked for example data, so a fresh database starts with a small,
 * realistic pipeline instead of empty lists. The records are owned by the
 * default administrator, which also makes the sales representative boundary
 * observable: a registered representative owns nothing here and must not see
 * any of it.
 *
 * Every value is spelled out rather than imported from the runtime domain, so
 * this seed keeps its meaning independently of later code changes. It is
 * idempotent: it does nothing once its first customer exists.
 */
const SAMPLE_COMPANY = 'Globex Corporation';

const seed: SeedDefinition = defineSeed({
  name: '202609130004_seed_crm_sample_data',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    // `hasTable` talks to the raw schema, where `crmCustomers` is stored as
    // `crm_customers`; the query adapter below uses the collection names.
    if (!(await client.schema.hasTable('crm_customers'))) return;

    const existing = await query
      .selectFrom('crmCustomers')
      .select('id')
      .where('name', '=', SAMPLE_COMPANY)
      .executeTakeFirst();
    if (existing) return;

    const user = await query
      .selectFrom('user')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (!user) return;
    const ownerId = String(user.id);

    const now = new Date();
    const globexId = await insertCustomer(query, ownerId, now, {
      name: SAMPLE_COMPANY,
      industry: 'Manufacturing',
      companySize: '201-500',
      source: 'expo',
      status: 'active',
      notes: 'Signed at the industrial automation expo; expansion planned.',
    });
    const initechId = await insertCustomer(query, ownerId, now, {
      name: 'Initech',
      industry: 'Software',
      companySize: '51-200',
      source: 'referral',
      status: 'potential',
      notes: 'Referred by an existing customer; evaluating a support renewal.',
    });

    await query
      .insertInto('crmContacts')
      .values([
        {
          customerId: globexId,
          name: 'Hank Scorpio',
          title: 'Chief Executive Officer',
          phone: '13800001001',
          email: 'hank@globex.example',
          isPrimary: true,
          ownerId,
          createdAt: now,
          updatedAt: now,
        },
        {
          customerId: globexId,
          name: 'Myrna Minkoff',
          title: 'Procurement Manager',
          phone: '13800001002',
          email: 'myrna@globex.example',
          isPrimary: false,
          ownerId,
          createdAt: now,
          updatedAt: now,
        },
        {
          customerId: initechId,
          name: 'Bill Lumbergh',
          title: 'VP Operations',
          phone: '13800002001',
          email: 'bill@initech.example',
          isPrimary: true,
          ownerId,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();

    await query
      .insertInto('crmOpportunities')
      .values([
        {
          name: 'Globex annual supply contract',
          customerId: globexId,
          amount: 180000,
          stage: 'won',
          expectedCloseDate: shiftDays(now, -12),
          ownerId,
          wonAmount: 172000,
          lostReason: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          name: 'Globex expansion package',
          customerId: globexId,
          amount: 95000,
          stage: 'quoted',
          expectedCloseDate: shiftDays(now, 30),
          ownerId,
          wonAmount: null,
          lostReason: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          name: 'Initech TPS upgrade',
          customerId: initechId,
          amount: 40000,
          stage: 'lead',
          expectedCloseDate: shiftDays(now, 45),
          ownerId,
          wonAmount: null,
          lostReason: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          name: 'Initech support renewal',
          customerId: initechId,
          amount: 20000,
          stage: 'lost',
          expectedCloseDate: shiftDays(now, -5),
          ownerId,
          wonAmount: null,
          lostReason: 'Renewed with the incumbent vendor.',
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();

    await query
      .insertInto('crmFollowUps')
      .values([
        {
          customerId: globexId,
          opportunityId: null,
          method: 'visit',
          summary: 'On-site review of the delivered production line.',
          nextStep: 'Prepare the expansion quotation.',
          followedAt: shiftDays(now, -10),
          ownerId,
          createdAt: now,
          updatedAt: now,
        },
        {
          customerId: initechId,
          opportunityId: null,
          method: 'email',
          summary: 'Sent the TPS upgrade overview and pricing sheet.',
          nextStep: 'Book a discovery call with operations.',
          followedAt: shiftDays(now, -3),
          ownerId,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();
  },
});

async function insertCustomer(
  query: QueryAdapter,
  ownerId: string,
  now: Date,
  value: {
    readonly name: string;
    readonly industry: string;
    readonly companySize: string;
    readonly source: string;
    readonly status: string;
    readonly notes: string;
  },
): Promise<number> {
  await query
    .insertInto('crmCustomers')
    .values({ ...value, ownerId, createdAt: now, updatedAt: now })
    .execute();
  const row = await query
    .selectFrom('crmCustomers')
    .select('id')
    .where('name', '=', value.name)
    .executeTakeFirst();
  if (!row) throw new Error(`Sample customer "${value.name}" was not stored.`);
  return Number(row.id);
}

function shiftDays(from: Date, days: number): Date {
  const next = new Date(from);
  next.setDate(next.getDate() + days);
  return next;
}

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
