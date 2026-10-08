import { z } from 'zod';

/**
 * The document library's request and response schemas.
 *
 * They live apart from the route factory so the API document and the handler
 * parse against the same declaration, and so a response schema stays a
 * statement about the payload rather than about the storage row.
 */

/** `:documentId` in a path. Ids are opaque strings. */
export const DocumentIdParam = z.object({
  documentId: z.string().min(1).max(64),
});

/** List paging. The service sorts newest first and never returns an unbounded page. */
export const ListDocumentsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const documentTitle = z.string().trim().min(1).max(255);
const documentBody = z.string().max(100_000).nullish();

export const CreateDocumentInput = z.object({
  title: documentTitle,
  body: documentBody.optional(),
  published: z.boolean().optional(),
  confidential: z.boolean().optional(),
});

export const UpdateDocumentInput = z
  .object({
    title: documentTitle.optional(),
    body: documentBody.optional(),
    published: z.boolean().optional(),
    confidential: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

/** One document as the browser receives it. Dates are ISO strings. */
export const DocumentSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string().nullable(),
  published: z.boolean(),
  confidential: z.boolean(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export type DocumentView = z.infer<typeof DocumentSchema>;

export const DocumentListMeta = z.object({
  total: z.number().int().nonnegative(),
});

/** One storage row plus the resolved owner name the API exposes. */
export interface DocumentSource {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly body: string | null;
  readonly ownerId: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: Date | string | null;
  readonly updatedAt: Date | string | null;
}

/** Shapes a storage row into the documented response payload. */
export function serializeDocument(
  document: DocumentSource,
  ownerName: string | null,
): DocumentView {
  return {
    id: document.id,
    code: document.code,
    title: document.title,
    body: document.body,
    ownerId: document.ownerId,
    ownerName,
    published: document.published,
    confidential: document.confidential,
    createdAt: toIsoString(document.createdAt),
    updatedAt: toIsoString(document.updatedAt),
  };
}

function toIsoString(value: Date | string | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}
