import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * The three todos the application ships with, so the todo page and the "check expired todos" schedule have something
 * to show on a fresh install: one past due and open (the schedule will mark it expired), one in the future, and one
 * completed before it fell due (the schedule must leave it alone).
 *
 * This is a regular seed rather than one declared with `sample: true` on purpose. Sample seeds only run when the
 * database is installed with `app.sampleData` set, and the application's automated verification installs the
 * database without it — so a sample seed would be recorded as skipped and the todo page would come up empty. These
 * rows are the demonstration the feature needs to be verifiable, so they are installation data.
 *
 * `reference` makes it idempotent: `upsertOne` matches an existing row by it and writes the no-op key back, so a
 * re-run never duplicates a todo and never overwrites a state the schedule has already changed (an expired row stays
 * expired).
 */
interface TodoRecord extends Record<string, unknown> {
  id: string;
  title: string;
  dueAt: Date;
  completed: boolean;
  expired: boolean;
  reference: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SampleTodo {
  readonly id: string;
  readonly reference: string;
  readonly title: string;
  readonly dueAt: Date;
  readonly completed: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

const seed: SeedDefinition = defineSeed({
  name: '202610130002_seed_todos',

  async run(context) {
    const todos = context.repository<
      TodoRecord,
      TodoRecord,
      Partial<TodoRecord>
    >('todos');
    const now = new Date();
    const samples: readonly SampleTodo[] = [
      {
        id: 'sample-todo-past-due',
        reference: 'sample-todo-past-due',
        title: 'Submit the quarterly report',
        dueAt: new Date(now.getTime() - 2 * DAY),
        completed: false,
      },
      {
        id: 'sample-todo-future',
        reference: 'sample-todo-future',
        title: 'Prepare the team offsite agenda',
        dueAt: new Date(now.getTime() + 7 * DAY),
        completed: false,
      },
      {
        id: 'sample-todo-completed',
        reference: 'sample-todo-completed',
        title: 'Renew the domain certificate',
        dueAt: new Date(now.getTime() - DAY),
        completed: true,
      },
    ];

    for (const sample of samples) {
      await todos.upsertOne({
        filter: { reference: sample.reference },
        create: {
          id: sample.id,
          title: sample.title,
          dueAt: sample.dueAt,
          completed: sample.completed,
          expired: false,
          reference: sample.reference,
          createdAt: now,
          updatedAt: now,
        },
        update: { reference: sample.reference },
      });
    }
  },
});

export default seed;
