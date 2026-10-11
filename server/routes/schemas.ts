import { z } from 'zod';

import type { TodoView } from '../providers/todos.js';

/**
 * Response schemas describe what the routes send in the API document at `/api/swagger/docs`; nothing validates a
 * response against them. Each is typed against what the service returns, so the document cannot drift from the code.
 */
export const TodoSchema: z.ZodType<TodoView> = z
  .object({
    id: z.number().int(),
    title: z.string(),
    dueAt: z.iso
      .datetime()
      .meta({ description: 'The deadline, as an ISO 8601 instant.' }),
    completed: z.boolean().meta({ description: 'Whether the todo is done.' }),
    expired: z
      .boolean()
      .meta({ description: 'Set by the schedule once the deadline passes.' }),
  })
  .meta({ ref: 'Todo' });

/** The todo an operation addresses, by its numeric id in the path. */
export const TodoParams = z.object({
  todoId: z.coerce.number().int().positive(),
});

/** Only the completed flag is editable through the API; the schedule owns `expired`. */
export const UpdateTodoInput = z.strictObject({
  completed: z.boolean(),
});
