import { defineSeed, type SeedDefinition } from '@nocobase/db';

// Example expense claims so the list is not empty on a fresh install.
// Idempotent: a claim with the same reason and expense date is left untouched,
// so a repeat run adds nothing and never overwrites user-entered data.
const EXAMPLE_CLAIMS = [
  { reason: '团队午餐', amount: 128.5, expenseDate: '2026-08-20' },
  { reason: '差旅打车', amount: 356, expenseDate: '2026-09-02' },
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609130002_seed_expense_claims',

  async run({ query }) {
    for (const example of EXAMPLE_CLAIMS) {
      const existing = await query
        .selectFrom('expenseClaims')
        .select('id')
        .where('reason', '=', example.reason)
        .where('expenseDate', '=', example.expenseDate)
        .executeTakeFirst();
      if (existing) continue;

      const now = new Date('2026-09-03T00:00:00.000Z');
      await query
        .insertInto('expenseClaims')
        .values({
          reason: example.reason,
          amount: example.amount,
          expenseDate: example.expenseDate,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
