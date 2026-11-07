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

/** The `/todos` table pages by number, so it can show a total. */
export const ListTodosQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: PageSize,
});

const TodoSchema = z
  .object({
    id: z.number().int().meta({ description: 'The todo’s identifier.' }),
    title: z.string().meta({ description: 'What the todo is about.' }),
    dueAt: z.iso
      .datetime()
      .meta({ description: 'When the todo is due, as an ISO 8601 instant.' }),
    completed: z
      .boolean()
      .meta({ description: 'Whether the todo has been completed.' }),
    overdue: z.boolean().meta({
      description:
        'Whether the overdue schedule has flagged this todo as past its due time.',
    }),
  })
  .meta({ ref: 'Todo' });

const TodoPageMeta = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .meta({ ref: 'TodoPageMeta' });

export { TodoPageMeta, TodoSchema };
