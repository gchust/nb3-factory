import {
  defineSeed,
  type RepositoryRecord,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

type TodoFixture = RepositoryRecord & {
  readonly title: string;
  readonly dueAt: Date;
  readonly completed: boolean;
  readonly overdue: boolean;
};

/**
 * One todo of each state the overdue check cares about, so the Schedule can be verified by looking at what it changed:
 * a past-due open todo it must mark, a future open todo it must leave alone, and a past-due completed todo whose
 * `overdue` flag must stay false.
 *
 * The dates are fixed rather than relative to the run so the seed is reproducible: `dueAt` values are absolute, and the
 * past ones stay past. Titles double as the seed's identity, so re-running it neither duplicates rows nor overwrites a
 * todo the user has since edited.
 *
 * These rows are a required seed rather than a sample one (`sample: true`). The environment that verifies this
 * application installs it with `pnpm nocobase db apply` and never sets `APP_SAMPLE_DATA`, and a sample seed is
 * recorded as skipped and never run there; the walkthrough's three rows have to exist on that first install for the
 * todo page and the Schedule to be verifiable at all.
 */
const fixtureTodos: readonly TodoFixture[] = [
  {
    title: '过期待办（示例）',
    dueAt: new Date('2026-01-01T00:00:00.000Z'),
    completed: false,
    overdue: false,
  },
  {
    title: '未来待办（示例）',
    dueAt: new Date('2099-12-31T00:00:00.000Z'),
    completed: false,
    overdue: false,
  },
  {
    title: '已完成的过期待办（示例）',
    dueAt: new Date('2026-02-01T00:00:00.000Z'),
    completed: true,
    overdue: false,
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202610070001_todos',
  async run(context: SeedContext) {
    const todos = context.repository<TodoFixture>('todos');
    for (const todo of fixtureTodos) {
      const existing = await todos.findOne({ filter: { title: todo.title } });
      if (existing) {
        continue;
      }
      await todos.createOne({ values: todo });
    }
  },
});

export default seed;
