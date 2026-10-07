import { z } from 'zod';

/**
 * The attachment a material response carries. It is the file row's public shape plus the
 * application-computed `contentUrl`, which is what the browser previews and downloads from.
 */
export const MaterialFileSchema = z.object({
  id: z.string(),
  disk: z.string(),
  key: z.string(),
  filename: z.string(),
  ext: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  contentUrl: z.string(),
});

/** A project material with its currently attached files, in upload order. */
export const MaterialSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  files: z.array(MaterialFileSchema),
});

export const CreateMaterialInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  // Files already uploaded through the file exposure. The upload happens before the material
  // exists, which is what lets a title validation failure be corrected without uploading again.
  fileIds: z.array(z.string().min(1)).max(100).optional(),
});

export const UpdateMaterialInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    fileIds: z.array(z.string().min(1)).max(100).optional(),
  })
  .refine((value) => value.title !== undefined || value.fileIds !== undefined, {
    message: 'At least one of title or fileIds is required.',
  });

export const MaterialIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** The list response's `data`. */
export const MaterialListSchema = z.array(MaterialSchema);
