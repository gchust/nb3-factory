import { defineSeed } from '@nocobase/db';

/**
 * First-run demonstration data for the sales team: two customers, three
 * contacts and three opportunities. The seed looks each record up by its
 * stable business key before inserting, so re-running it changes nothing.
 */
const SEEDED_AT = '2026-01-05T09:00:00.000Z';

interface MinimalRepository {
  findOne(options: {
    filter: Record<string, unknown>;
  }): Promise<Record<string, unknown> | undefined>;
  createOne(options: {
    values: Record<string, unknown>;
  }): Promise<{ record: Record<string, unknown> }>;
}

async function ensure(
  repository: MinimalRepository,
  filter: Record<string, unknown>,
  values: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const existing = await repository.findOne({ filter });
  if (existing) {
    return existing;
  }
  const created = await repository.createOne({ values });
  return created.record;
}

export default defineSeed({
  name: '202609280010_sales_demo_data',

  async run(context) {
    // `context.repository` is a method of the seed context; calling it through a
    // wrapper keeps the receiver bound and satisfies `unbound-method`.
    const repository = (collection: string) => context.repository(collection);
    const customers = repository('customers') as unknown as MinimalRepository;
    const contacts = repository('contacts') as unknown as MinimalRepository;
    const opportunities = repository(
      'opportunities',
    ) as unknown as MinimalRepository;

    const acme = await ensure(
      customers,
      { name: 'Acme Manufacturing' },
      {
        name: 'Acme Manufacturing',
        industry: 'Manufacturing',
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
      },
    );
    const northwind = await ensure(
      customers,
      { name: 'Northwind Retail' },
      {
        name: 'Northwind Retail',
        industry: 'Retail',
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
      },
    );

    await ensure(
      contacts,
      { name: 'Alice Chen', customerId: acme.id },
      {
        name: 'Alice Chen',
        phone: '+1 415 555 0134',
        email: 'alice.chen@acme.example',
        customerId: acme.id,
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
      },
    );
    await ensure(
      contacts,
      { name: 'David Park', customerId: acme.id },
      {
        name: 'David Park',
        phone: '+1 415 555 0198',
        email: 'david.park@acme.example',
        customerId: acme.id,
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
      },
    );
    await ensure(
      contacts,
      { name: 'Emma Wu', customerId: northwind.id },
      {
        name: 'Emma Wu',
        phone: '+1 206 555 0177',
        email: 'emma.wu@northwind.example',
        customerId: northwind.id,
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
      },
    );

    await ensure(
      opportunities,
      { name: 'Acme plant upgrade', customerId: acme.id },
      {
        name: 'Acme plant upgrade',
        customerId: acme.id,
        amount: 120000,
        stage: 'following',
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
      },
    );
    await ensure(
      opportunities,
      { name: 'Acme annual support', customerId: acme.id },
      {
        name: 'Acme annual support',
        customerId: acme.id,
        amount: 30000,
        stage: 'won',
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
      },
    );
    await ensure(
      opportunities,
      { name: 'Northwind POS rollout', customerId: northwind.id },
      {
        name: 'Northwind POS rollout',
        customerId: northwind.id,
        amount: 80000,
        stage: 'following',
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
      },
    );
  },
});
