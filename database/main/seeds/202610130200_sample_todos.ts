import { defineSeed } from '@nocobase/db';

/** The one row a seed manages here, as this seed writes it; spelled out rather than imported from a model. */
interface TodoRow {
  readonly title: string;
  readonly dueAt: Date;
  readonly completed: boolean;
  readonly overdue: boolean;
}

/**
 * Three todos that make the overdue marking observable: one past due and open (the schedule must flag it), one far in
 * the future and open (it must stay untouched), and one past due but completed (it must stay untouched as well).
 *
 * Sample data, so it loads only when the database is installed with `APP_SAMPLE_DATA=true`; `pnpm nocobase db sample`
 * loads it afterwards in development. It is idempotent and keyed on the unique `title`: an existing row is left exactly
 * as it is, so a person editing these rows never has their change overwritten by a later run.
 */
const seed = defineSeed({
  name: '202610130200_sample_todos',
  sample: true,

  run: async (context) => {
    const todos = context.repository<TodoRow>('todoItems');

    const rows: readonly TodoRow[] = [
      {
        title: 'Overdue todo',
        dueAt: new Date('2020-01-01T00:00:00.000Z'),
        completed: false,
        overdue: false,
      },
      {
        title: 'Future todo',
        dueAt: new Date('2099-12-31T23:59:59.000Z'),
        completed: false,
        overdue: false,
      },
      {
        title: 'Completed todo',
        dueAt: new Date('2020-06-01T00:00:00.000Z'),
        completed: true,
        overdue: false,
      },
    ];

    for (const values of rows) {
      const existing = await todos.findOne({ filter: { title: values.title } });
      if (!existing) {
        await todos.createOne({ values });
      }
    }
  },
});

export default seed;
