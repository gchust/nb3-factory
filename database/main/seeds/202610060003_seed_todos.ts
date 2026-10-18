import { defineSeed, type SeedDefinition } from '@nocobase/db';

interface TodoRecord {
  id: number;
  title: string;
  dueAt: string;
  completed: boolean;
  expired: boolean;
}

interface SampleTodo {
  readonly title: string;
  readonly dueInDays: number;
  readonly completed: boolean;
  readonly expired: boolean;
}

const sampleTodos: readonly SampleTodo[] = [
  {
    title: '提交季度报销单',
    dueInDays: -2,
    completed: false,
    // Left unmarked so the scheduled check has real work to do on first run.
    expired: false,
  },
  {
    title: '准备产品评审材料',
    dueInDays: 3,
    completed: false,
    expired: false,
  },
  {
    title: '整理上周会议纪要',
    dueInDays: -1,
    completed: true,
    expired: false,
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202610060003_seed_todos',
  // A seed run is one unit of work; a failure must leave no half-written set.
  transaction: true,
  async run(context) {
    const todos = context.repository<TodoRecord>('todos');
    const now = Date.now();

    for (const sample of sampleTodos) {
      // The title is the natural key here. Running the seed again on a database
      // that already has these records leaves them alone instead of duplicating.
      const existing = await todos.findOne({
        filter: { title: sample.title },
      });
      if (existing) {
        continue;
      }

      await todos.createOne({
        values: {
          title: sample.title,
          dueAt: new Date(
            now + sample.dueInDays * 24 * 60 * 60 * 1000,
          ).toISOString(),
          completed: sample.completed,
          expired: sample.expired,
        },
      });
    }
  },
});

export default seed;
