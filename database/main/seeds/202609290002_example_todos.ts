import {
  defineSeed,
  type SeedDefinition,
  type SeedContext,
} from '@nocobase/db';

interface TodoSeedRecord {
  seedKey: string;
  title: string;
  notes: string | null;
  completed: boolean;
  createdAt: Date;
}

/**
 * Three example todos for a fresh installation.
 *
 * The seed is idempotent on `seedKey` rather than on the title, so running it
 * again inserts nothing and never overwrites a row a user has edited. The
 * timestamps are fixed, so a repeat run cannot fabricate new "created at"
 * values or random identifiers.
 */
const EXAMPLE_TODOS: readonly TodoSeedRecord[] = [
  {
    seedKey: 'example-1',
    title: 'Buy groceries',
    notes: 'Milk, eggs, and a bag of coffee beans.',
    completed: false,
    createdAt: new Date('2026-09-29T08:00:00.000Z'),
  },
  {
    seedKey: 'example-2',
    title: 'Book a dentist appointment',
    notes: null,
    completed: true,
    createdAt: new Date('2026-09-29T09:30:00.000Z'),
  },
  {
    seedKey: 'example-3',
    title: "Prepare Monday's team meeting",
    notes: 'Share the agenda before Friday.',
    completed: false,
    createdAt: new Date('2026-09-29T11:00:00.000Z'),
  },
];

async function run(context: SeedContext): Promise<void> {
  // Call `repository` on the context rather than destructuring it: it is a method, and the lint rule that forbids
  // calling a separated method still applies even though this one does not read `this`.
  const todos = context.repository<TodoSeedRecord>('todos');

  for (const example of EXAMPLE_TODOS) {
    const existing = await todos.findOne({
      filter: { seedKey: example.seedKey },
    });
    if (existing) {
      continue;
    }

    await todos.createOne({
      values: {
        seedKey: example.seedKey,
        title: example.title,
        notes: example.notes,
        completed: example.completed,
        createdAt: example.createdAt,
      },
    });
  }
}

const seed: SeedDefinition = defineSeed({
  name: '202609290002_example_todos',
  run,
});

export default seed;
