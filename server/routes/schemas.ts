import { z } from 'zod';

/**
 * The todo shape the API returns. `id` is a string even though the column is an integer, so the contract matches every
 * other id in the API; `dueAt` is the stored RFC 3339 instant.
 */
export interface TodoView {
  readonly id: string;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

export const TodoParams = z.object({
  todoId: z
    .string()
    .regex(/^\d+$/, 'must be a positive integer id')
    .meta({ description: 'Id of the todo.' }),
});

export const ListTodosQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).meta({
    description: 'Page number, starting at 1.',
  }),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).meta({
    description: 'Records per page, at most 100.',
  }),
});

export const CreateTodoInput = z.strictObject({
  title: z
    .string()
    .min(1)
    .max(200)
    .meta({ description: 'What the todo is about.' }),
  dueAt: z.iso
    .datetime({ offset: true })
    .meta({ description: 'Deadline as an RFC 3339 instant.' }),
});

export const UpdateTodoInput = z.strictObject({
  completed: z.boolean().meta({
    description: 'Whether the todo is done. Only this field may be updated.',
  }),
});

export const Todo: z.ZodType<TodoView> = z
  .object({
    id: z.string(),
    title: z.string(),
    dueAt: z.string(),
    completed: z.boolean(),
    expired: z.boolean(),
  })
  .meta({ ref: 'Todo' });

export const TodoListMeta = z.object({
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
