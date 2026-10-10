import { z } from 'zod';

import type { LibraryDocumentView } from '../library-service.js';

/** One document. Annotated with the service view so the two cannot drift. */
export const LibraryDocumentSchema: z.ZodType<LibraryDocumentView> = z
  .object({
    id: z.string().meta({ description: 'The document id.' }),
    title: z.string().meta({ description: 'The document title.' }),
    content: z
      .string()
      .nullable()
      .meta({ description: 'The document body, or null.' }),
    ownerId: z.string().meta({ description: 'The owning account id.' }),
    ownerName: z
      .string()
      .nullable()
      .meta({ description: 'The owning account display name.' }),
    published: z
      .boolean()
      .meta({ description: 'Whether every colleague may read the document.' }),
    confidential: z.boolean().meta({
      description: 'Confidential documents are never shared, even by a rule.',
    }),
    createdAt: z.iso
      .datetime()
      .meta({ description: 'When the document was created.' }),
    updatedAt: z.iso
      .datetime()
      .meta({ description: 'When the document was last changed.' }),
  })
  .meta({ ref: 'LibraryDocument' });

export const LibraryDocumentParams = z.object({
  documentId: z.string().min(1),
});

export const LibraryDocumentListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const CreateLibraryDocumentBody = z.strictObject({
  title: z.string().min(1).max(255),
  content: z.string().max(200_000).optional(),
  published: z.boolean().optional(),
  confidential: z.boolean().optional(),
});

export const UpdateLibraryDocumentBody = z.strictObject({
  title: z.string().min(1).max(255).optional(),
  content: z.string().max(200_000).nullable().optional(),
  published: z.boolean().optional(),
  confidential: z.boolean().optional(),
});

export const LibraryDocumentListMeta = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
