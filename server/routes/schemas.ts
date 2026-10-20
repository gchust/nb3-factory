import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);

/** RFC 3339 timestamps are documented by format alone rather than by the long pattern `z.iso.datetime()` emits. */
const dateTime = () => z.string().meta({ format: 'date-time' });

export const TodoParams = z.object({ todoId: z.string().min(1) });

export const ListTodosQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const CreateTodoInput = z.strictObject({
  title: nonEmpty.max(255),
  dueAt: z.iso.datetime(),
});

/**
 * `expired` is deliberately absent: only the scheduled job sets it. A person can rename a todo, move its due time,
 * or mark it done.
 */
export const UpdateTodoInput = z.strictObject({
  title: nonEmpty.max(255).optional(),
  dueAt: z.iso.datetime().optional(),
  completed: z.boolean().optional(),
});

export const TodoSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    dueAt: dateTime(),
    completed: z.boolean(),
    expired: z.boolean().meta({
      description:
        'Set by the "check expired todos" schedule once `dueAt` has passed on an open todo.',
    }),
    createdAt: dateTime(),
    updatedAt: dateTime(),
  })
  .meta({ ref: 'TodosTodo' });

export const TodosPageMeta = z
  .object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int().meta({
      description: 'The number of todos in the collection.',
    }),
  })
  .meta({ ref: 'TodosPageMeta' });
