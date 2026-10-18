import { defineSeed, type SeedDefinition } from '@nocobase/db';

/** The subset of a `todos` row this seed writes. */
interface TodoRow {
  id: number;
  title: string;
  dueAt: string | Date;
  completed: boolean;
  expired: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The three todos every installation starts with: one already past its due time, one far in the future, and one
 * finished. They are the fixture the `todos.check-expired` schedule is observed against, so they are required data
 * rather than optional sample data: with `sample: true` the seeder records itself as skipped when the database is
 * installed without `APP_SAMPLE_DATA`, and the running application then has nothing to mark or to leave alone.
 *
 * `expired` starts `false` on every row. Pre-setting the flag would leave nothing for the schedule to show; the
 * schedule's own run is the only thing that may flip it. The insert is skipped when a todo with the same title already
 * exists, so a repeated `pnpm nocobase db apply` never adds a duplicate.
 */
const seed: SeedDefinition = defineSeed({
  name: '202610070001_default_todos',

  async run(context) {
    const todos = context.repository<TodoRow>('todos');
    const samples: Pick<
      TodoRow,
      'title' | 'dueAt' | 'completed' | 'expired'
    >[] = [
      {
        title: '已过期待办',
        dueAt: new Date(Date.now() - DAY_MS),
        completed: false,
        expired: false,
      },
      {
        title: '未来待办',
        dueAt: new Date(Date.now() + 3650 * DAY_MS),
        completed: false,
        expired: false,
      },
      {
        title: '已完成待办',
        dueAt: new Date(Date.now() - DAY_MS),
        completed: true,
        expired: false,
      },
    ];

    for (const sample of samples) {
      if (await todos.exists({ filter: { title: sample.title } })) continue;
      await todos.createOne({ values: sample });
    }
  },
});

export default seed;
