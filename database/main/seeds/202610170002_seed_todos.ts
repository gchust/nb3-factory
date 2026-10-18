import { randomUUID } from 'node:crypto';

import { defineSeed } from '@nocobase/db';

/**
 * Fixed instants, not `new Date()`: a seed that wrote the current time would make an installation depend on when it
 * ran, and the completed and future records would drift into and out of the sweep's reach. The year 2099 keeps the
 * future record out of reach for any realistic installation lifetime; the overdue record is firmly in the past.
 */
const FIXED_CREATED_AT = '2026-01-05T09:00:00.000Z';

/**
 * The three todos this demo is about, one for each state the scheduled sweep has to distinguish:
 *
 * - `提交月度报表` is past due and still open, so the next run of `todos.expire-due` marks it expired.
 * - `预约年度体检` is due in the future, so the sweep has to leave it alone.
 * - `整理会议纪要` is past due but already completed, so the sweep has to leave it alone as well.
 *
 * This is a required seed rather than `sample: true` on purpose: the deployment pipeline installs the application
 * without `APP_SAMPLE_DATA`, and these three records are the acceptance evidence a reviewer opens the page for. It is
 * still idempotent — a title that is already there is left untouched, including a `completed` or `expired` flag a user
 * or the sweep has changed since — and every identifying value is fixed, so a repeat install changes no row and the
 * three records never multiply.
 *
 * The overdue row starts *not* expired so a fresh installation still has one real transition for the scheduler to
 * make: opening the page before the first run shows a past-due open todo, and after it shows the expired badge.
 */
const TODOS = [
  {
    title: '提交月度报表',
    dueAt: '2020-01-02T02:00:00.000Z',
    completed: false,
    expired: false,
  },
  {
    title: '预约年度体检',
    dueAt: '2099-01-01T02:00:00.000Z',
    completed: false,
    expired: false,
  },
  {
    title: '整理会议纪要',
    dueAt: '2020-01-02T02:00:00.000Z',
    completed: true,
    expired: false,
  },
] as const;

const seed = defineSeed({
  name: '202610170002_seed_todos',

  // An arrow function, not method shorthand, and `repository` is called on the context rather than destructured:
  // `SeedContext.repository` is a method, so a detached reference trips `@typescript-eslint/unbound-method`.
  run: async (context) => {
    const todos = context.repository('todos');

    for (const todo of TODOS) {
      const exists = await todos.exists({ filter: { title: todo.title } });
      if (exists) continue;

      await todos.createOne({
        values: {
          id: randomUUID(),
          ...todo,
          createdAt: FIXED_CREATED_AT,
        },
      });
    }
  },
});

export default seed;
