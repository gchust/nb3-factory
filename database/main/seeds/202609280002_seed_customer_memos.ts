import { defineSeed, type SeedDefinition } from '@nocobase/db';

interface SampleMemo {
  readonly name: string;
  readonly note: string;
  readonly createdAt: string;
}

/**
 * Fictional sample records so the list page has something to show on a fresh install.
 *
 * Idempotent by customer name: running the seed again only inserts what is missing and never overwrites what a user
 * may have edited.
 */
const SAMPLE_MEMOS: readonly SampleMemo[] = [
  {
    name: 'Northwind Traders',
    note: 'Renewal discussion scheduled for next quarter. They asked about volume pricing.',
    createdAt: '2026-09-02T09:15:00.000Z',
  },
  {
    name: 'Blue Harbor Cafe',
    note: 'Interested in the loyalty add-on. Follow up after their busy season.',
    createdAt: '2026-09-05T14:30:00.000Z',
  },
  {
    name: 'Acme Robotics',
    note: 'New operations lead introduced herself; go through her for future demos.',
    createdAt: '2026-09-09T11:00:00.000Z',
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609280002_seed_customer_memos',

  run: async (context) => {
    const memos = context.repository('customerMemos');
    for (const memo of SAMPLE_MEMOS) {
      const exists = await memos.exists({ filter: { name: memo.name } });
      if (!exists) {
        await memos.createOne({
          values: {
            name: memo.name,
            note: memo.note,
            createdAt: memo.createdAt,
          },
        });
      }
    }
  },
});

export default seed;
