import { z } from 'zod';

/** An RFC 3339 timestamp, documented by its format alone rather than by the long pattern `z.iso.datetime()` emits. */
const dateTime = () => z.string().meta({ format: 'date-time' });

export const DocumentParams = z.object({
  documentId: z.string().min(1),
});

export const DocumentShareParams = z.object({
  documentId: z.string().min(1),
  userId: z.string().min(1),
});

const DocumentCapabilitiesSchema = z.object({
  canEdit: z
    .boolean()
    .meta({ description: 'The reader may change this document.' }),
  canDelete: z
    .boolean()
    .meta({ description: 'The reader may delete this document.' }),
  canManageShares: z.boolean().meta({
    description:
      'The reader is an administrator and may share or revoke this document.',
  }),
});

export const DocumentSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    body: z.string().nullable(),
    ownerId: z.string(),
    ownerName: z.string().nullable(),
    published: z
      .boolean()
      .meta({ description: 'A published document is visible to colleagues.' }),
    confidential: z.boolean().meta({
      description:
        'A confidential document is never visible to anyone but its owner, even when shared.',
    }),
    createdAt: dateTime(),
    updatedAt: dateTime(),
    capabilities: DocumentCapabilitiesSchema,
  })
  .meta({ ref: 'DocumentsDocument' });

export const DocumentListMeta = z
  .object({
    total: z.number().int(),
    canCreate: z
      .boolean()
      .meta({ description: 'The reader may create a document.' }),
  })
  .meta({ ref: 'DocumentsListMeta' });

export const DocumentShareSchema = z
  .object({
    documentId: z.string(),
    userId: z.string(),
    userName: z.string().nullable(),
    createdAt: dateTime(),
  })
  .meta({ ref: 'DocumentsShare' });

export const CreateDocumentInput = z.strictObject({
  title: z.string().trim().min(1).max(255),
  body: z.string().nullable().optional(),
  published: z.boolean().optional(),
  confidential: z.boolean().optional(),
});

export const UpdateDocumentInput = z.strictObject({
  title: z.string().trim().min(1).max(255).optional(),
  body: z.string().nullable().optional(),
  published: z.boolean().optional(),
  confidential: z.boolean().optional(),
});

export const CreateDocumentShareInput = z.strictObject({
  userId: z.string().min(1),
});
