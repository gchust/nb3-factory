import { z } from 'zod';

/** Rows a page holds unless the caller asks otherwise, and the most it may ask for. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const PageSize = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .default(DEFAULT_PAGE_SIZE);

/** The todo table pages by number so it can show a total. */
export const TodoListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: PageSize,
});

// Response schemas. They describe what the route sends in the API document at `/api/swagger/docs`; nothing validates a
// response against them.
export const TodoSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    dueAt: z.iso.datetime().meta({
      description: 'When the todo is due, in ISO 8601 UTC.',
    }),
    completed: z.boolean().meta({
      description: 'Whether the todo has been finished.',
    }),
    overdue: z.boolean().meta({
      description:
        'Set by the "检查过期待办" Schedule once `dueAt` has passed while `completed` is false; a completed todo keeps the value it had.',
    }),
  })
  .meta({ ref: 'Todo' });

export const TodoPageMeta = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .meta({ ref: 'TodoPageMeta' });
