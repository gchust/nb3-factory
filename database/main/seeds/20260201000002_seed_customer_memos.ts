import { defineSeed, type SeedDefinition } from '@nocobase/db';

interface CustomerMemoSeed {
  readonly customerName: string;
  readonly notes: string | null;
  readonly createdAt: string;
}

/**
 * Three fictional examples so a fresh installation has something to browse. The created times are fixed rather than
 * taken from the clock, so every install shows the same list in the same order and a repeated run changes nothing.
 */
const RECORDS: readonly CustomerMemoSeed[] = [
  {
    customerName: 'Acme Trading Co.',
    notes: 'Prefers email. Renewal discussion planned for next quarter.',
    createdAt: '2025-11-03T09:15:00.000Z',
  },
  {
    customerName: 'Blue Oak Cafe',
    notes: null,
    createdAt: '2025-12-18T14:40:00.000Z',
  },
  {
    customerName: 'Cedar & Pine Studio',
    notes: 'Asked for a walkthrough of the new catalog before ordering.',
    createdAt: '2026-01-22T11:05:00.000Z',
  },
];

const seed: SeedDefinition = defineSeed({
  name: '20260201000002_seed_customer_memos',
  async run(context) {
    // Read the method off the context object rather than destructuring it: a detached method loses its `this`.
    const memos = context.repository<CustomerMemoSeed>('customerMemos');
    for (const record of RECORDS) {
      // `customerName` is not unique, so idempotency is a read-then-write keyed on the seeded name rather than an
      // upsert on a unique condition.
      const existing = await memos.findOne({
        filter: (filter) =>
          filter.string('customerName').eq(record.customerName),
      });
      if (existing) continue;
      await memos.createOne({ values: record });
    }
  },
});

export default seed;
