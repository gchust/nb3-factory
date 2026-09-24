import { defineSeed } from '@nocobase/db';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The three records the feature is demonstrated against: one whose deadline has
 * passed, one still in the future, and one already completed (with a past
 * deadline, so the scheduled task has to leave it alone).
 *
 * Idempotent through `sourceKey`: re-running the seed updates the same three
 * rows instead of inserting duplicates. Deadlines are relative to run time, so
 * a fresh install always has a genuinely overdue record.
 */
export default defineSeed({
  name: '202609240002_seed_todos',

  async run(context) {
    const now = Date.now();
    const nowDate = new Date(now);

    const todos = [
      {
        sourceKey: 'seed-overdue',
        title: 'Submit the quarterly report',
        dueAt: new Date(now - 2 * DAY_MS),
        completed: false,
        expired: false,
      },
      {
        sourceKey: 'seed-future',
        title: 'Prepare next sprint backlog',
        dueAt: new Date(now + 2 * DAY_MS),
        completed: false,
        expired: false,
      },
      {
        sourceKey: 'seed-completed',
        title: 'Archive last year documents',
        dueAt: new Date(now - 3 * DAY_MS),
        completed: true,
        expired: false,
      },
    ];

    for (const todo of todos) {
      await context.repository('todos').upsertOne({
        filter: { sourceKey: todo.sourceKey },
        create: { ...todo, createdAt: nowDate, updatedAt: nowDate },
        update: {
          title: todo.title,
          dueAt: todo.dueAt,
          completed: todo.completed,
          // Re-running the seed resets the demonstration to its starting state,
          // so the next scheduled run has the overdue record to mark again.
          expired: todo.expired,
          updatedAt: nowDate,
        },
      });
    }
  },
});
