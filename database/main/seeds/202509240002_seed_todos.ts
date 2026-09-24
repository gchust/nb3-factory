import { defineSeed } from '@nocobase/db';

/**
 * Three fixed records the scheduled check can be verified against: one already
 * past its deadline and open, one still in the future, and one completed even
 * though its time has passed.
 *
 * Keyed on the unique `title`, so a second run inserts nothing. The update
 * only re-asserts the fixed deadline: business state (`completed`, `overdue`)
 * is never reset, so a repeat run cannot undo what the scheduled task set.
 * Timestamps are literal so the data is reproducible on every machine.
 */
export default defineSeed({
  name: '202509240002_seed_todos',

  async run(context) {
    const todos = context.repository('todos');

    await todos.upsertOne({
      filter: { title: 'Overdue todo / 已过期待办' },
      create: {
        completed: false,
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        dueAt: new Date('2020-01-01T00:00:00.000Z'),
        overdue: false,
        title: 'Overdue todo / 已过期待办',
      },
      update: { dueAt: new Date('2020-01-01T00:00:00.000Z') },
    });

    await todos.upsertOne({
      filter: { title: 'Future todo / 未到期待办' },
      create: {
        completed: false,
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        dueAt: new Date('2099-12-31T23:59:59.000Z'),
        overdue: false,
        title: 'Future todo / 未到期待办',
      },
      update: { dueAt: new Date('2099-12-31T23:59:59.000Z') },
    });

    await todos.upsertOne({
      filter: { title: 'Completed todo / 已完成待办' },
      create: {
        completed: true,
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        dueAt: new Date('2020-01-01T00:00:00.000Z'),
        overdue: false,
        title: 'Completed todo / 已完成待办',
      },
      update: { dueAt: new Date('2020-01-01T00:00:00.000Z') },
    });
  },
});
