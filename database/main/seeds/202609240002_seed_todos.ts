import { defineSeed } from '@nocobase/db';

interface SeedTodo {
  readonly title: string;
  readonly deadline: string;
  readonly completed: boolean;
  readonly expired: boolean;
  readonly createdAt: string;
}

/**
 * The three fixed records the "检查过期待办" task is verified against:
 * exactly one overdue incomplete todo, one future incomplete todo, and one
 * completed todo whose deadline already passed.
 *
 * Dates are literals, not `now`, so the seed is reproducible. `title` is the
 * natural business key: a row that already exists is left exactly as it is, so
 * a repeated run never overwrites what a user has since edited.
 */
const todos: readonly SeedTodo[] = [
  {
    title: '过期待办 / Overdue todo',
    deadline: '2020-01-01T00:00:00.000Z',
    completed: false,
    expired: false,
    createdAt: '2020-01-01T00:00:00.000Z',
  },
  {
    title: '未来待办 / Future todo',
    deadline: '2099-12-31T00:00:00.000Z',
    completed: false,
    expired: false,
    createdAt: '2020-01-01T00:00:00.000Z',
  },
  {
    title: '已完成待办 / Completed todo',
    deadline: '2020-01-01T00:00:00.000Z',
    completed: true,
    expired: false,
    createdAt: '2020-01-01T00:00:00.000Z',
  },
];

export default defineSeed({
  name: '202609240002_seed_todos',

  async run(context) {
    const todosRepository = context.repository<SeedTodo>('todos');

    for (const todo of todos) {
      const exists = await todosRepository.exists({
        filter: { title: todo.title },
      });
      if (!exists) {
        await todosRepository.createOne({ values: todo });
      }
    }
  },
});
