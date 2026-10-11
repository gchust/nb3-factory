import { defineSeed } from '@nocobase/db';

/** The `todos` columns this seed writes, spelled out so the seed reads on its own. */
interface TodoRow {
  readonly id: number;
  readonly title: string;
  readonly dueAt: Date | string;
  readonly completed: boolean;
  readonly expired: boolean;
}

/**
 * The three rows this scaffolding task asks for: one already past its deadline, one still ahead, and one past its
 * deadline but finished. The schedule under test must mark only the first as expired.
 *
 * This is a regular seed rather than a sample one so a plain install (`pnpm nocobase db apply`) leaves the data in
 * place for a reviewer to look at. It is idempotent: a row is identified by its title and only created when missing,
 * so re-running it never duplicates a todo and never resets a flag the schedule already set.
 */
export default defineSeed({
  name: '202610070002_seed_todos',

  async run(context) {
    const todos = context.repository<TodoRow>('todos');
    const rows = [
      {
        title: '提交季度报告（已过期）',
        // An hour in the past, so the first scheduled run has something to mark.
        dueAt: new Date(Date.now() - 60 * 60 * 1000),
        completed: false,
        expired: false,
      },
      {
        title: '预约下周会议室（未到期）',
        dueAt: new Date(Date.now() + 60 * 60 * 1000),
        completed: false,
        expired: false,
      },
      {
        title: '归档上季度发票（已完成）',
        // Past due but already finished: the schedule must leave it alone.
        dueAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        completed: true,
        expired: false,
      },
    ];

    for (const row of rows) {
      const existing = await todos.findOne({ filter: { title: row.title } });
      if (!existing) {
        await todos.createOne({ values: row });
      }
    }
  },
});
