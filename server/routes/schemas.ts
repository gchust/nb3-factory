import { z } from 'zod';

import type { TodoView } from '../providers/todo.js';

/** The todo as the API returns it, typed against what the service builds. */
export const TodoSchema: z.ZodType<TodoView> = z
  .object({
    id: z.string(),
    title: z.string(),
    dueAt: z.iso.datetime(),
    completed: z.boolean(),
    expired: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ ref: 'Todo' });

/**
 * The primary key is an auto-increment integer in the table, but the API addresses records by string id. Coercing
 * here keeps the client's string id working while the filter receives a number.
 */
export const TodoParams = z.object({
  todoId: z.coerce.number().int().positive(),
});

/** Only the completion flag is writable from the page; the expiry flag belongs to the scheduled task. */
export const UpdateTodoInput = z.strictObject({
  completed: z.boolean().meta({
    description: 'Whether the todo is done.',
  }),
});
