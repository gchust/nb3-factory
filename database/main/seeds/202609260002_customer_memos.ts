import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Three fictional memos, written with fixed values so the seed is reproducible: a repeated run inserts nothing new
 * and never overwrites a memo a user has since edited.
 */
const SAMPLE_MEMOS = [
  {
    name: 'Acme Trading Co.',
    note: 'Annual plan renewal quote requested; follow up next week.',
  },
  {
    name: 'Blue Harbor Cafe',
    note: 'Prefers a phone call before 10 a.m.',
  },
  {
    name: 'Riverstone Clinic',
    note: null,
  },
] as const;

/** A fixed timestamp rather than the current time, so two runs produce identical rows. */
const SAMPLE_CREATED_AT = new Date('2026-01-15T09:00:00.000Z');

const seed: SeedDefinition = defineSeed({
  name: '202609260002_customer_memos',
  async run(context) {
    const memos = context.repository('customerMemos');

    for (const sample of SAMPLE_MEMOS) {
      // `name` carries no unique constraint, so the sample is looked up before inserting. A second run then leaves
      // both the sample and any later edit to it untouched.
      const existing = await memos.findOne({
        filter: { name: sample.name },
      });
      if (existing) {
        continue;
      }

      await memos.createOne({
        values: {
          name: sample.name,
          note: sample.note,
          createdAt: SAMPLE_CREATED_AT,
        },
      });
    }
  },
});

export default seed;
