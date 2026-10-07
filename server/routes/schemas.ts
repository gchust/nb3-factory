import { z } from 'zod';

/** One material as every materials endpoint returns it. */
export const MaterialSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  body: z.string(),
  restricted: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ListMaterialsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const MaterialIdParams = z.object({
  materialId: z.coerce.number().int().positive(),
});

/** The two content fields; the supervisor maintains nothing else. */
export const MaterialContentInput = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1),
});

export type MaterialContent = z.infer<typeof MaterialContentInput>;
