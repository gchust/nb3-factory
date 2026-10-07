import { z } from 'zod';

/** One document as the API returns it. */
export const LibraryDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  ownerId: z.string(),
  ownerName: z.string(),
  published: z.boolean(),
  confidential: z.boolean(),
});

/** What a list adds to the returned documents. */
export const LibraryDocumentListMetaSchema = z.object({
  total: z.number().int(),
  canCreate: z.boolean(),
  editableIds: z.array(z.string()),
});

/** The body of a create or an update. */
export const LibraryDocumentInputSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string(),
  published: z.boolean(),
  confidential: z.boolean(),
});

/** The record a single-document route addresses. */
export const LibraryDocumentParamsSchema = z.object({
  id: z.string().min(1),
});
