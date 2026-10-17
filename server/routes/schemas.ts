import { z } from 'zod';

/** Response schema of one todo, as the todo page and the API document see it. */
export const TodoSchema = z
  .object({
    id: z.string().meta({ description: 'The todo’s UUID.' }),
    title: z.string().meta({ description: 'What has to be done.' }),
    dueAt: z.iso.datetime().meta({
      description: 'When it is due, as an ISO 8601 instant.',
    }),
    completed: z.boolean().meta({
      description: 'Whether a user marked it done.',
    }),
    expired: z.boolean().meta({
      description:
        'Whether the scheduled sweep has marked it expired, which it does only while the todo is past due and not completed.',
    }),
    createdAt: z.iso.datetime(),
  })
  .meta({ ref: 'Todo' });

export const TodoParams = z.object({
  todoId: z.string().min(1),
});

export const TodoListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/** A title is required and capped at the column's length; `dueAt` is an instant, not a date in some time zone. */
export const CreateTodoInput = z.strictObject({
  title: z.string().trim().min(1).max(200),
  dueAt: z.iso.datetime(),
});

export const UpdateTodoInput = z.strictObject({
  completed: z.boolean(),
});

export const TodoPageMeta = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .meta({ ref: 'TodoPageMeta' });
