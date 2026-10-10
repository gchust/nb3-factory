import { z } from 'zod';

/**
 * The shapes the materials routes document and validate against. They describe
 * what the service returns: a material's content and its access flag, never a
 * row's internal columns.
 */
export const MaterialSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  body: z.string(),
  confidential: z.boolean(),
  createdAt: z.string(),
});

export const MaterialsListMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const MaterialListQuery = z.object({
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const MaterialParams = z.object({
  materialId: z.string().min(1),
});

export const UpdateMaterialBody = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    body: z.string().trim().min(1).optional(),
  })
  .refine((values) => values.title !== undefined || values.body !== undefined, {
    message: 'Provide a title or a body to change.',
  });
