import { z } from 'zod';

import type { TodoView } from '../providers/todos.js';

export const ListTodosQuery = z.object({});

export const TodoSchema: z.ZodType<TodoView> = z
  .object({
    id: z.string(),
    title: z.string(),
    dueAt: z.iso.datetime(),
    completed: z.boolean(),
    expired: z.boolean(),
  })
  .meta({ ref: 'Todo' });
