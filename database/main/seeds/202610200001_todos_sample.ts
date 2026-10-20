import { defineSeed } from '@nocobase/db';

interface TodoSeedRow {
  readonly id: string;
  readonly title: string;
  readonly dueAt: Date;
  readonly completed: boolean;
  readonly expired: boolean;
}

const todos: readonly TodoSeedRow[] = [
  {
    id: 'todo-overdue-sample',
    title: '提交逾期费用报销',
    dueAt: new Date('2020-01-15T09:00:00.000Z'),
    completed: false,
    expired: false,
  },
  {
    id: 'todo-future-sample',
    title: '准备下季度计划',
    dueAt: new Date('2099-12-31T09:00:00.000Z'),
    completed: false,
    expired: false,
  },
  {
    id: 'todo-completed-sample',
    title: '归档已完成合同',
    dueAt: new Date('2020-01-10T09:00:00.000Z'),
    completed: true,
    expired: false,
  },
];

/**
 * The three records the acceptance check compares: one overdue, one in the future, and one completed with a past due
 * time. Stable ids make a repeated run update the same rows instead of adding duplicates.
 */
export default defineSeed({
  name: '202610200001_todos_sample',

  async run(context) {
    const todosRepository = context.repository('todos');
    for (const { id, ...values } of todos) {
      await todosRepository.upsertOne({
        filter: { id },
        create: { id, ...values },
        update: values,
      });
    }
  },
});
