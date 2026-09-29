import {
  defineSeed,
  type Repository,
  type RepositoryFilter,
  type RepositoryRecord,
} from '@nocobase/db';

type Repo = Repository<RepositoryRecord>;

async function findOne(
  repository: Repo,
  filter: RepositoryFilter<RepositoryRecord>,
): Promise<RepositoryRecord | undefined> {
  return repository.findOne({ filter });
}

async function createOnce(
  repository: Repo,
  filter: RepositoryFilter<RepositoryRecord>,
  values: RepositoryRecord,
): Promise<RepositoryRecord> {
  const existing = await findOne(repository, filter);
  if (existing) {
    return existing;
  }

  const { record } = await repository.createOne({ values });
  return record;
}

/**
 * Initial CRM sample data for a fresh installation.
 *
 * Every insert is guarded by an existence check, so running the seed again
 * leaves existing records untouched instead of duplicating them.
 */
const seed = defineSeed({
  name: '202609290002_seed_crm_data',
  transaction: true,
  async run(context) {
    const now = new Date();
    const customers = context.repository('customers');
    const contacts = context.repository('contacts');
    const opportunities = context.repository('opportunities');

    const aurora = await createOnce(
      customers,
      { name: 'Aurora Robotics' },
      {
        name: 'Aurora Robotics',
        industry: 'Industrial Automation',
        createdAt: now,
        updatedAt: now,
      },
    );

    const harborview = await createOnce(
      customers,
      { name: 'Harborview Logistics' },
      {
        name: 'Harborview Logistics',
        industry: 'Transportation & Logistics',
        createdAt: now,
        updatedAt: now,
      },
    );

    await createOnce(
      contacts,
      { name: 'Mia Chen', customerId: Number(aurora.id) },
      {
        name: 'Mia Chen',
        phone: '+86 138 0000 1024',
        email: 'mia.chen@aurora-robotics.example',
        customerId: Number(aurora.id),
        createdAt: now,
        updatedAt: now,
      },
    );

    await createOnce(
      contacts,
      { name: 'Daniel Park', customerId: Number(aurora.id) },
      {
        name: 'Daniel Park',
        phone: '+86 139 0000 2048',
        email: 'daniel.park@aurora-robotics.example',
        customerId: Number(aurora.id),
        createdAt: now,
        updatedAt: now,
      },
    );

    await createOnce(
      contacts,
      { name: 'Sofia Martins', customerId: Number(harborview.id) },
      {
        name: 'Sofia Martins',
        phone: '+351 912 000 300',
        email: 'sofia.martins@harborview.example',
        customerId: Number(harborview.id),
        createdAt: now,
        updatedAt: now,
      },
    );

    await createOnce(
      opportunities,
      { name: 'Production line retrofit', customerId: Number(aurora.id) },
      {
        name: 'Production line retrofit',
        customerId: Number(aurora.id),
        amount: 480000,
        stage: 'following',
        createdAt: now,
        updatedAt: now,
      },
    );

    await createOnce(
      opportunities,
      { name: 'Annual service retainer', customerId: Number(aurora.id) },
      {
        name: 'Annual service retainer',
        customerId: Number(aurora.id),
        amount: 120000,
        stage: 'won',
        createdAt: now,
        updatedAt: now,
      },
    );

    await createOnce(
      opportunities,
      { name: 'Fleet tracking rollout', customerId: Number(harborview.id) },
      {
        name: 'Fleet tracking rollout',
        customerId: Number(harborview.id),
        amount: 265000,
        stage: 'following',
        createdAt: now,
        updatedAt: now,
      },
    );
  },
});

export default seed;
