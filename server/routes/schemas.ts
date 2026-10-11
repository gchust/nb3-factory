import { z } from 'zod';

/** One document as the client reads it, with the capabilities that depend on the caller's own grants. */
export const DocumentSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string().nullable(),
  published: z.boolean(),
  confidential: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});

export const DocumentShareSchema = z.object({
  id: z.number().int(),
  documentId: z.number().int(),
  userId: z.string(),
  userName: z.string().nullable(),
  createdAt: z.string(),
});

export const ListDocumentsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(255).optional(),
  sortBy: z.enum(['title', 'updatedAt']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const DocumentParams = z.object({
  id: z.coerce.number().int().min(1),
});

export const ShareParams = z.object({
  id: z.coerce.number().int().min(1),
  userId: z.string().min(1).max(64),
});

export const CreateDocumentInput = z.object({
  title: z.string().trim().min(1).max(255),
  // Nullable like the DTO and the update input: the form sends `null` for an empty body.
  body: z.string().max(100_000).nullable().optional(),
  published: z.boolean().optional(),
  confidential: z.boolean().optional(),
});

export const UpdateDocumentInput = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    body: z.string().max(100_000).nullable().optional(),
    published: z.boolean().optional(),
    confidential: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const CreateDocumentShareInput = z.object({
  userId: z.string().min(1).max(64),
});

export type DocumentDto = z.infer<typeof DocumentSchema>;
export type DocumentShareDto = z.infer<typeof DocumentShareSchema>;
