import { z } from 'zod';

/**
 * The document library's request and response schemas.
 *
 * Input schemas describe exactly what a caller may send and are attached to a
 * route with `apiValidator()`. Response schemas are written against what the
 * service returns, so the API document cannot drift from the real payload.
 */

const id = z.string().min(1).max(64);
const isoDate = z.string().meta({
  description: 'An RFC 3339 timestamp, such as `2026-10-07T08:00:00.000Z`.',
});

export const LibraryDocumentParams = z.object({
  id,
});

export const LibraryDocumentBody = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .meta({ description: 'A one-line document title.' }),
  body: z
    .string()
    .max(200000)
    .meta({ description: 'The document body, as plain text.' }),
  // A document without a flag is a draft only its owner can read, so an
  // omitted flag is `false` rather than a validation error.
  published: z
    .boolean()
    .default(false)
    .meta({ description: 'Whether qualified colleagues may read it.' }),
  confidential: z
    .boolean()
    .default(false)
    .meta({ description: 'Whether it must never reach an ordinary reader.' }),
});

export const LibraryDocumentPatchBody = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().max(200000).optional(),
  published: z.boolean().optional(),
  confidential: z.boolean().optional(),
});

export const LibraryDocument = z
  .object({
    id,
    title: z.string(),
    body: z.string(),
    ownerId: z.string(),
    ownerName: z.string(),
    published: z.boolean(),
    confidential: z.boolean(),
    createdAt: isoDate,
    updatedAt: isoDate,
    editable: z.boolean(),
    canShare: z.boolean(),
  })
  .meta({ ref: 'LibraryDocument' });

export const LibraryListQuery = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .meta({ description: 'Matches the title or the body.' }),
  visibility: z
    .enum(['published', 'draft', 'confidential'])
    .optional()
    .meta({ description: 'Narrows the list to one kind of visibility.' }),
});

export const LibraryDocumentListMeta = z.object({
  total: z.number().int(),
  canCreate: z.boolean(),
});

export const LibraryShare = z
  .object({
    key: z.string(),
    documentIds: z.array(z.string()),
    subjectIds: z.array(z.string()),
    reason: z.string().nullable(),
  })
  .meta({ ref: 'LibraryShare' });

export const LibraryShareBody = z.strictObject({
  subjectId: id.meta({
    description: 'The colleague the document is temporarily shared with.',
  }),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const LibraryShareParams = z.object({
  id,
  key: z.string().min(1).max(255),
});
