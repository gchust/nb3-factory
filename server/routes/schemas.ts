import { z } from 'zod';

/** One document as the HTTP API returns it. `accessLevel` is read-only metadata, not editable content. */
export const DocumentSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  body: z.string(),
  accessLevel: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ListDocumentsQuery = z.object({
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe(
      'Case-insensitive keyword searched in the document title and body.',
    ),
});

export const DocumentParams = z.object({
  id: z.coerce.number().int().positive(),
});

export const UpdateDocumentInput = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1),
});
