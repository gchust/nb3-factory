import {
  defineSeed,
  type CreateMutationValues,
  type Repository,
  type RepositoryFilter,
} from '@nocobase/db';

/**
 * The sales sample data a fresh install starts from: two customers, three contacts and three opportunities.
 *
 * Idempotent and repeated-run safe: every write is keyed on the values that identify the row, so running the seed
 * again leaves the database as it is instead of duplicating the sample. Seeding only ever writes rows — the tables
 * themselves are the migration's job.
 *
 * The record shapes are declared here rather than imported: a seed is history, and a Collection definition that keeps
 * evolving must not silently change what an already-executed seed means.
 */
interface CustomerRecord {
  id: number;
  name: string;
  industry: string | null;
}

interface ContactRecord {
  id: number;
  name: string;
  contactInfo: string | null;
  customerId: number;
}

interface OpportunityRecord {
  id: number;
  name: string | null;
  customerId: number;
  amount: number | null;
  stage: 'following' | 'won' | 'lost';
}

type ScalarMap = Readonly<Record<string, string | number | boolean | null>>;

export default defineSeed({
  name: '202601010002_sales_sample_data',

  async run(context) {
    // Read it off the context rather than destructuring: the method must keep its receiver.
    const repository = context.repository.bind(context);
    const customers = repository<CustomerRecord>('customers');
    const contacts = repository<ContactRecord>('contacts');
    const opportunities = repository<OpportunityRecord>('opportunities');

    // A customer has a unique name, so it is upserted on it: a second run updates the row rather than adding another.
    const acme = await customers.upsertOne({
      filter: { name: 'Acme Corporation' },
      create: { name: 'Acme Corporation', industry: 'Manufacturing' },
      update: { industry: 'Manufacturing' },
    });
    const globex = await customers.upsertOne({
      filter: { name: 'Globex Industries' },
      create: { name: 'Globex Industries', industry: 'Technology' },
      update: { industry: 'Technology' },
    });

    // Contacts and opportunities carry no unique key of their own, so they are matched on the fields that identify
    // one in practice: the customer and the name.
    await ensure(
      contacts,
      { customerId: globex.record.id, name: 'Jane Doe' },
      {
        name: 'Jane Doe',
        customerId: globex.record.id,
        contactInfo: 'jane.doe@globex.example',
      },
    );
    await ensure(
      contacts,
      { customerId: globex.record.id, name: 'John Smith' },
      {
        name: 'John Smith',
        customerId: globex.record.id,
        contactInfo: '+1 555 0142',
      },
    );
    await ensure(
      contacts,
      { customerId: acme.record.id, name: 'Alice Brown' },
      {
        name: 'Alice Brown',
        customerId: acme.record.id,
        contactInfo: 'alice.brown@acme.example',
      },
    );

    await ensure(
      opportunities,
      { customerId: acme.record.id, name: 'Acme renewal' },
      {
        name: 'Acme renewal',
        customerId: acme.record.id,
        amount: 120000,
        stage: 'following',
      },
    );
    await ensure(
      opportunities,
      { customerId: acme.record.id, name: 'Acme expansion' },
      {
        name: 'Acme expansion',
        customerId: acme.record.id,
        amount: 48000,
        stage: 'won',
      },
    );
    await ensure(
      opportunities,
      { customerId: globex.record.id, name: 'Globex pilot' },
      {
        name: 'Globex pilot',
        customerId: globex.record.id,
        amount: 26000,
        stage: 'lost',
      },
    );
  },
});

/** Creates a row only when nothing matches, so a repeated seed run does not duplicate it. */
async function ensure<TRecord extends object>(
  repository: Repository<TRecord>,
  filter: ScalarMap,
  values: CreateMutationValues<Partial<TRecord>>,
): Promise<void> {
  if (
    await repository.exists({ filter: filter as RepositoryFilter<TRecord> })
  ) {
    return;
  }
  await repository.createOne({ values });
}
