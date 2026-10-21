import { defineSeed } from '@nocobase/db';

/**
 * Three fixed todos make the overdue behaviour visible immediately after installation: one past-due and incomplete
 * (the scheduler marks it expired), one past-due but completed (the scheduler leaves it alone), and one still in the
 * future (the scheduler leaves it alone as well).
 *
 * The ids and dates are fixed so re-running the seed cannot create a second copy. The upsert also makes a repeated
 * sample installation converge on the same three records.
 */
export default defineSeed({
  name: '202610070002_seed_todos',

  async run(context) {
    const todos = context.repository('todos');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    await todos.upsertOne({
      filter: { id: 'todo-overdue-incomplete' },
      create: {
        id: 'todo-overdue-incomplete',
        title: 'Prepare the production schedule',
        dueAt: new Date('2020-01-01T08:00:00.000Z'),
        completed: false,
        expired: false,
        createdAt,
        updatedAt: createdAt,
      },
      update: {
        title: 'Prepare the production schedule',
        dueAt: new Date('2020-01-01T08:00:00.000Z'),
        completed: false,
        expired: false,
        updatedAt: createdAt,
      },
    });

    await todos.upsertOne({
      filter: { id: 'todo-overdue-completed' },
      create: {
        id: 'todo-overdue-completed',
        title: 'Confirm the raw material stock',
        dueAt: new Date('2020-02-01T08:00:00.000Z'),
        completed: true,
        expired: false,
        createdAt,
        updatedAt: createdAt,
      },
      update: {
        title: 'Confirm the raw material stock',
        dueAt: new Date('2020-02-01T08:00:00.000Z'),
        completed: true,
        expired: false,
        updatedAt: createdAt,
      },
    });

    await todos.upsertOne({
      filter: { id: 'todo-future' },
      create: {
        id: 'todo-future',
        title: 'Inspect the new assembly line',
        dueAt: new Date('2099-01-01T08:00:00.000Z'),
        completed: false,
        expired: false,
        createdAt,
        updatedAt: createdAt,
      },
      update: {
        title: 'Inspect the new assembly line',
        dueAt: new Date('2099-01-01T08:00:00.000Z'),
        completed: false,
        expired: false,
        updatedAt: createdAt,
      },
    });
  },
});
