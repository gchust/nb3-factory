import { z } from 'zod';

/**
 * One document as the API presents it. `canEdit`/`canDelete` are computed by
 * the server for the caller and the record, so the browser never offers a
 * control the server would refuse.
 */
export interface LibraryDocumentView {
  id: string;
  title: string;
  body: string | null;
  ownerId: string;
  ownerName: string | null;
  published: boolean;
  confidential: boolean;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * The list's `meta` block. `canCreate` lets the browser hide the "New" action
 * from a caller the create action would refuse, without a second request.
 */
export const LibraryListMeta = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  canCreate: z.boolean(),
});

export const ListDocumentsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const DocumentParams = z.object({
  documentId: z.string().min(1),
});

export const CreateDocumentInput = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .meta({ description: 'The document title.' }),
  body: z
    .string()
    .max(20000)
    .nullish()
    .meta({ description: 'The document body.' }),
  published: z.boolean().optional().meta({
    description: 'Whether the document is published. Defaults to false.',
  }),
  confidential: z.boolean().optional().meta({
    description: 'Whether the document is confidential. Defaults to false.',
  }),
});

export const UpdateDocumentInput = z.strictObject({
  title: z.string().trim().min(1).max(255).optional(),
  body: z.string().max(20000).nullish(),
  published: z.boolean().optional(),
  confidential: z.boolean().optional(),
});

/** Typed against the view the route returns, so the document cannot drift. */
export const LibraryDocument: z.ZodType<LibraryDocumentView> = z
  .object({
    id: z.string(),
    title: z.string(),
    body: z.string().nullable(),
    ownerId: z.string(),
    ownerName: z.string().nullable(),
    published: z.boolean(),
    confidential: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    canEdit: z.boolean(),
    canDelete: z.boolean(),
  })
  .meta({ ref: 'LibraryDocument' });
