import { defineSeed } from '@nocobase/db';

interface SampleTodo {
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: string;
}

// Three fictional examples so a new list is not empty. They are installation data, not fixtures: the seed is written
// once and stays in the database, so every timestamp is fixed and the titles are the stable business key the seed uses
// to stay idempotent.
const SAMPLE_TODOS: readonly SampleTodo[] = [
  {
    title: 'Review the Q4 roadmap',
    completed: true,
    createdAt: '2026-09-22T02:15:00.000Z',
  },
  {
    title: 'Reply to the design review email',
    completed: false,
    createdAt: '2026-09-24T06:40:00.000Z',
  },
  {
    title: 'Book the team offsite venue',
    completed: false,
    createdAt: '2026-09-25T09:05:00.000Z',
  },
];

export default defineSeed({
  name: '20260926000001_sample_todos',
  async run(context) {
    const todos = context.repository('todos');
    for (const sample of SAMPLE_TODOS) {
      // The existence check is the second half of idempotency: the Seeder's history already prevents a re-run, and
      // this keeps the seed safe if it is ever replayed against a database whose history was lost.
      if (await todos.exists({ filter: { title: sample.title } })) {
        continue;
      }
      await todos.createOne({
        values: {
          title: sample.title,
          completed: sample.completed,
          createdAt: new Date(sample.createdAt),
        },
      });
    }
  },
});
