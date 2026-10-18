import { z } from 'zod';

/** A todo as the API returns it. `dueAt` is always an ISO 8601 instant in UTC. */
export const todoSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(200),
  dueAt: z.iso.datetime({ offset: true }),
  completed: z.boolean(),
  expired: z.boolean(),
});

export const createTodoBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    dueAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const updateTodoBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    dueAt: z.iso.datetime({ offset: true }).optional(),
    completed: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field must be provided.',
  });

export const todoParamsSchema = z.object({
  todoId: z.coerce.number().int().positive(),
});

export type TodoDto = z.infer<typeof todoSchema>;
export type CreateTodoBody = z.infer<typeof createTodoBodySchema>;
export type UpdateTodoBody = z.infer<typeof updateTodoBodySchema>;
