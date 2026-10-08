import { z } from 'zod';

/**
 * Request and response schemas for the project-material API.
 *
 * The request schemas are what `apiValidator()` enforces; the response schemas
 * describe what the routes send, in the API document at `/api/swagger/docs`.
 * Nothing validates a response against them.
 */

const dateTime = (): z.ZodString => z.string().meta({ format: 'date-time' });

export const MaterialParams = z.object({
  materialId: z.string().min(1),
});

/**
 * The title is validated as a string here and as non-blank in the service, so a
 * blank title is answered with the specific `MATERIAL_TITLE_REQUIRED` reason
 * rather than the generic invalid-input body. Saving is refused, which is what
 * keeps an already-uploaded attachment selected in the form.
 */
export const CreateMaterialInput = z.strictObject({
  title: z.string(),
  fileIds: z.array(z.string().min(1)).optional(),
});

export const UpdateMaterialInput = z.strictObject({
  title: z.string().optional(),
  fileIds: z.array(z.string().min(1)).optional(),
});

export const MaterialFileSchema = z
  .object({
    id: z.string(),
    disk: z.string(),
    key: z.string(),
    filename: z.string(),
    ext: z.string(),
    mimeType: z.string(),
    size: z.number().int().nonnegative(),
    createdAt: dateTime(),
    updatedAt: dateTime(),
    contentUrl: z.string().meta({
      description:
        "The URL that serves the file's bytes: the public base path, the file exposure's access path, then `{id}.{ext}`.",
    }),
  })
  .meta({ ref: 'ProjectMaterialFile' });

export const MaterialSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    createdAt: dateTime(),
    updatedAt: dateTime(),
    files: z.array(MaterialFileSchema),
  })
  .meta({ ref: 'ProjectMaterial' });

export const MaterialPageMeta = z.object({
  total: z.number().int().meta({
    description: 'The number of materials owned by the caller.',
  }),
});
