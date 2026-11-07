import { z } from 'zod';

import type { TodoView } from '../providers/todo.js';

export const TodoParams = z.object({ todoId: z.string().min(1) });

export const TodoListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const TodoListMeta = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});

export const TodoSchema: z.ZodType<TodoView> = z
  .object({
    id: z.string(),
    title: z.string(),
    dueAt: z.iso.datetime(),
    completed: z.boolean(),
    expired: z.boolean(),
  })
  .meta({ ref: 'Todo' });

export const CreateTodoInput = z.strictObject({
  title: z.string().trim().min(1).max(191),
  dueAt: z.iso.datetime(),
});

export const UpdateTodoInput = z
  .strictObject({
    title: z.string().trim().min(1).max(191).optional(),
    dueAt: z.iso.datetime().optional(),
    completed: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one change.',
  });
