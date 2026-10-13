import { z } from 'zod';

import type { DocumentShareView, DocumentView } from '../library/types.js';

const nonEmpty = z.string().trim().min(1);

/** An RFC 3339 timestamp, documented by its format alone rather than by the long pattern `z.iso.datetime()` emits. */
const dateTime = () => z.string().meta({ format: 'date-time' });

export const DocumentParams = z.object({
  documentId: z.string().min(1).meta({ description: 'The document id.' }),
});

export const DocumentShareParams = z.object({
  documentId: z.string().min(1).meta({ description: 'The document id.' }),
  userId: z
    .string()
    .min(1)
    .meta({ description: 'The person the document is shared with.' }),
});

export const CreateDocumentInput = z.strictObject({
  title: nonEmpty.max(255).meta({ description: 'The document title.' }),
  body: z
    .string()
    .optional()
    .meta({ description: 'The document body; omitted means empty.' }),
  published: z.boolean().optional().meta({
    description:
      'Whether every qualified reader may see the document. Defaults to `false`.',
  }),
  confidential: z.boolean().optional().meta({
    description:
      'Whether the document stays with its owner. Defaults to `false`.',
  }),
});

export const UpdateDocumentInput = z.strictObject({
  title: nonEmpty.max(255).optional(),
  body: z.string().nullable().optional(),
  published: z.boolean().optional(),
  confidential: z.boolean().optional(),
});

export const AddDocumentShareInput = z.strictObject({
  userId: nonEmpty.meta({
    description: 'The person to share the document with.',
  }),
});

export const LibraryDocumentSchema: z.ZodType<DocumentView> = z
  .object({
    id: z.string(),
    title: z.string(),
    body: z.string().nullable(),
    published: z.boolean(),
    confidential: z.boolean(),
    ownerId: z.string(),
    ownerName: z.string().nullable(),
    canEdit: z.boolean().meta({
      description:
        'Whether the requesting person may change the document; only its owner may.',
    }),
    shared: z.boolean().meta({
      description:
        'Whether the document reached the requester through a temporary share rather than by ownership.',
    }),
    createdAt: dateTime(),
    updatedAt: dateTime(),
  })
  .meta({ ref: 'LibraryDocument' });

export const LibraryDocumentShareSchema: z.ZodType<DocumentShareView> = z
  .object({
    userId: z.string(),
    name: z.string().nullable(),
    username: z.string().nullable(),
    email: z.string().nullable(),
    createdAt: dateTime(),
  })
  .meta({ ref: 'LibraryDocumentShare' });
