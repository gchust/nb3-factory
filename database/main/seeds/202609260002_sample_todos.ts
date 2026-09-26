import { defineSeed } from '@nocobase/db';

interface SampleTodo {
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: string;
}

/** Fictional starting content so a new installation opens on a usable list. */
const SAMPLE_TODOS: readonly SampleTodo[] = [
  {
    title: 'Buy groceries for the week',
    completed: false,
    createdAt: '2026-09-24T09:00:00.000Z',
  },
  {
    title: 'Book a dentist appointment',
    completed: false,
    createdAt: '2026-09-25T09:00:00.000Z',
  },
  {
    title: 'Read the Q3 design doc',
    completed: true,
    createdAt: '2026-09-23T09:00:00.000Z',
  },
];

export default defineSeed({
  name: '202609260002_sample_todos',

  async run(context) {
    // Reach the repository through the context rather than a destructured `repository`, which would be an unbound method.
    const todos = context.repository<SampleTodo>('todos');

    // The seed is one-time history, but a partially applied run or a manually
    // cleared history can execute it again. Match on the title so a repeat run
    // leaves the existing rows and their user edits alone instead of doubling
    // the list. A unique constraint is deliberately absent, so this lookup —
    // not the database — is what makes the seed idempotent.
    for (const sample of SAMPLE_TODOS) {
      const existing = await todos.findOne({ filter: { title: sample.title } });
      if (existing) continue;
      await todos.createOne({
        values: {
          title: sample.title,
          completed: sample.completed,
          // The column is a datetime; the ISO string is what the Repository encodes for the dialect.
          createdAt: sample.createdAt,
        },
      });
    }
  },
});
