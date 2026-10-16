import { z } from 'zod';

/** A `todos` row as the list route sends it. `dueAt` is an ISO 8601 timestamp. */
export const TodoSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    dueAt: z.iso.datetime(),
    completed: z.boolean(),
    expired: z.boolean(),
  })
  .meta({ ref: 'Todo' });
