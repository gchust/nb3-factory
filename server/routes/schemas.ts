import { z } from 'zod';

import { DOCUMENT_VISIBILITY } from '../knowledge-resources.js';

/** One document as the API returns it. */
export const DocumentSchema = z.object({
  id: z.number().int().describe('Document id.'),
  title: z.string().describe('Document title, which the assistant cites.'),
  body: z
    .string()
    .describe('Document body, the only material an answer may use.'),
  visibility: z
    .enum([DOCUMENT_VISIBILITY.public, DOCUMENT_VISIBILITY.restricted])
    .describe(
      '`public` is readable by everyone; `restricted` only by a holder of the manage grant.',
    ),
  createdAt: z.string().describe('Creation time, ISO 8601.'),
  updatedAt: z.string().describe('Last edit time, ISO 8601.'),
});

/** The `:documentId` path parameter, shared by the read and edit routes. */
export const DocumentParams = z.object({
  documentId: z.coerce
    .number()
    .int()
    .positive()
    .describe('The document to read or edit.'),
});

/**
 * A partial edit. `updatedAt` is set by the server and `visibility` is not
 * editable through the API at all, so neither appears here.
 */
export const UpdateDocumentInput = z.object({
  title: z.string().min(1).max(255).optional().describe('New title.'),
  body: z.string().min(1).optional().describe('New body.'),
});

export type DocumentDto = z.infer<typeof DocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof UpdateDocumentInput>;
