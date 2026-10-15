import { defineSeed } from '@nocobase/db';

/** The columns this seed writes; the physical shape is owned by `202610100001_create_todos`. */
interface TodoRow {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Three todos that make one run of the "check overdue todos" schedule observable: one whose deadline has passed
 * (`expired` flips to true), one still in the future, and one already completed. Both of the latter must stay
 * untouched, so these rows are also the manual check.
 *
 * This is a required seed, not sample data: the three rows are the acceptance fixture for the overdue check, so a
 * database that has them is the only one the check can be observed on. It creates no structure, and its run is
 * idempotent by `title`, which is deliberately left without a unique constraint: a title is a business value the
 * people using `/todos` own, and seeding must not forbid them from entering one of these titles. Seed runs are
 * serialized under the seed lock, so the read-then-insert cannot race with another run.
 */
export default defineSeed({
  name: '202610100002_seed_todos',

  async run(context) {
    const todos = context.repository<TodoRow>('todos');
    const now = Date.now();
    // `dueAt` is an RFC 3339 instant: a deadline two days in the past, one a week out, and one already done.
    const rows = [
      {
        title: 'Submit the quarterly report',
        dueAt: new Date(now - 2 * DAY_MS).toISOString(),
        completed: false,
        expired: false,
      },
      {
        title: 'Prepare the release notes',
        dueAt: new Date(now + 7 * DAY_MS).toISOString(),
        completed: false,
        expired: false,
      },
      {
        title: 'Review the API documentation',
        dueAt: new Date(now + DAY_MS).toISOString(),
        completed: true,
        expired: false,
      },
    ];

    for (const row of rows) {
      const existing = await todos.findOne({ filter: { title: row.title } });
      if (existing) continue;
      await todos.createOne({ values: row });
    }
  },
});
