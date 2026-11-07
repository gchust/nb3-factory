import { defineSeed } from '@nocobase/db';

/**
 * The three states the todo page and its overdue schedule are meant to be inspected in.
 *
 * The due times are fixed rather than relative to installation so the seed stays reproducible: one is permanently
 * overdue, one is permanently in the future, and the third is already completed.
 */
const TODOS = [
  {
    id: '1f0b4a3c-7d2e-4f5a-9b6c-8d1e2f3a4b5c',
    title: 'Overdue todo',
    dueAt: '2020-01-01T00:00:00.000Z',
    completed: false,
    expired: false,
  },
  {
    id: '2a1c5b4d-8e3f-4a6b-8c7d-9e2f3a4b5c6d',
    title: 'Upcoming todo',
    dueAt: '2099-01-01T00:00:00.000Z',
    completed: false,
    expired: false,
  },
  {
    id: '3b2d6c5e-9f4a-4b7c-9d8e-1f3a4b5c6d7e',
    title: 'Completed todo',
    dueAt: '2020-01-02T00:00:00.000Z',
    completed: true,
    expired: false,
  },
] as const;

export default defineSeed({
  name: '202610070002_sample_todos',
  sample: true,

  async run(context) {
    // Call `repository` on its context instead of destructuring it: the method is
    // not declared `this: void`, so an unbound reference trips
    // @typescript-eslint/unbound-method.
    const todos = context.repository('todo');
    for (const todo of TODOS) {
      // A repeated run must not overwrite a title or completion an administrator changed.
      if (await todos.findOne({ filter: { id: todo.id } })) continue;
      await todos.createOne({
        values: { ...todo, dueAt: new Date(todo.dueAt) },
      });
    }
  },
});
