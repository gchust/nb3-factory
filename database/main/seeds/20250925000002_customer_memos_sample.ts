import { defineSeed, type SeedDefinition } from '@nocobase/db';

interface CustomerMemoRow {
  readonly customerName: string;
  readonly remark: string;
  readonly createdAt: string;
}

/**
 * Three fictional records so a fresh installation opens onto a usable list.
 *
 * Seeds never create structure, and this one never overwrites user edits: each
 * sample is inserted only when no record with the same customer name exists.
 */
const SAMPLES: readonly CustomerMemoRow[] = [
  {
    customerName: 'Acme Trading Co.',
    remark: 'Key account. Prefers email contact for quotes.',
    createdAt: '2025-09-01T09:00:00.000Z',
  },
  {
    customerName: 'Northwind Logistics',
    remark: 'Renewal discussion scheduled for next quarter.',
    createdAt: '2025-09-10T02:30:00.000Z',
  },
  {
    customerName: 'Globex Manufacturing',
    remark: 'Requested a quote for the new product line.',
    createdAt: '2025-09-18T07:15:00.000Z',
  },
];

const seed: SeedDefinition = defineSeed({
  name: '20250925000002_customer_memos_sample',
  async run(context) {
    const memos = context.repository<CustomerMemoRow>('customerMemos');

    for (const sample of SAMPLES) {
      const existing = await memos.findOne({
        filter: { customerName: sample.customerName },
      });

      if (!existing) {
        await memos.createOne({ values: { ...sample } });
      }
    }
  },
});

export default seed;
