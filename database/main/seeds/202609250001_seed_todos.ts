import { defineSeed, type SeedDefinition } from '@nocobase/db';

const HOUR_MS = 60 * 60 * 1000;

interface SeedTodo {
  readonly title: string;
  readonly dueOffsetMs: number;
  readonly completed: boolean;
}

/**
 * The three records the scheduled task is verified against.
 *
 * Exactly one is past due and incomplete, so a correct run expires one record
 * and no test can pass by expiring everything; one is future-dated and one is
 * past due but completed, which are the two cases a correct run must leave
 * alone.
 */
const seedTodos: readonly SeedTodo[] = [
  {
    title: 'Submit the overdue inspection summary',
    dueOffsetMs: -2 * HOUR_MS,
    completed: false,
  },
  {
    title: 'Prepare tomorrow morning briefing',
    dueOffsetMs: 24 * HOUR_MS,
    completed: false,
  },
  {
    title: 'Archive last week notes',
    dueOffsetMs: -3 * HOUR_MS,
    completed: true,
  },
];

/**
 * Installation data, not structure. Idempotent per record so a re-run on an
 * already seeded database adds nothing and a repeated scheduled run can never
 * produce a duplicate todo.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609250001_seed_todos',
  async run(context) {
    const todos = context.repository('todos');
    const now = Date.now();

    for (const todo of seedTodos) {
      const exists = await todos.exists({ filter: { title: todo.title } });
      if (exists) continue;

      await todos.createOne({
        values: {
          title: todo.title,
          dueAt: new Date(now + todo.dueOffsetMs),
          completed: todo.completed,
          expired: false,
          createdAt: new Date(now),
        },
      });
    }
  },
});

export default seed;
