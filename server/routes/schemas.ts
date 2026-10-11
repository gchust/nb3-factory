import { z } from 'zod';

/** One attachment of a material, as the application API returns it. */
export const MaterialFileSchema = z.strictObject({
  id: z.string(),
  filename: z.string(),
  ext: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  contentUrl: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** A material with its attachments. */
export const MaterialSchema = z.strictObject({
  id: z.number().int().positive(),
  title: z.string(),
  ownerId: z.string(),
  files: z.array(MaterialFileSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** The body of a material create or update: the title and the files left attached. */
export const MaterialInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(255),
  fileIds: z.array(z.string().trim().min(1)).max(100).default([]),
});

/** The `:materialId` path segment. */
export const MaterialParamsSchema = z.strictObject({
  materialId: z.coerce.number().int().positive(),
});
