import { defineSeed, type SeedContext } from '@nocobase/db';

/**
 * The three records that exercise the overdue scan:
 *
 * - an unfinished todo whose deadline has already passed, which the scheduled
 *   task must mark expired;
 * - an unfinished todo whose deadline is in the future, which it must leave
 *   alone;
 * - a completed todo whose deadline has passed, which it must also leave alone
 *   because completion wins over a past deadline.
 *
 * The deadlines are fixed instants rather than "now minus a day" so the seed is
 * reproducible, and the keyed `upsertOne` makes a repeat run a no-op and never
 * clears an `expired` flag the scheduler has already set (`expired` is
 * deliberately absent from `update`).
 */
export default defineSeed({
  name: '20260927160001_seed_todos',

  async run(context: SeedContext) {
    const todos = context.repository('todos');

    const rows = [
      {
        title: '过期待办（未完成）',
        dueAt: '2020-01-01T00:00:00.000Z',
        completed: false,
      },
      {
        title: '未来待办（未完成）',
        dueAt: '2999-01-01T00:00:00.000Z',
        completed: false,
      },
      {
        title: '已完成待办（已过期但已完成）',
        dueAt: '2020-01-01T00:00:00.000Z',
        completed: true,
      },
    ];

    for (const row of rows) {
      await todos.upsertOne({
        filter: { title: row.title },
        create: { ...row, expired: false },
        update: { dueAt: row.dueAt, completed: row.completed },
      });
    }
  },
});
