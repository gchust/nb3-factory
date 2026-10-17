import { z } from 'zod';

import type {
  LibraryDocumentShare,
  LibraryDocumentView,
} from '../library-types.js';

export const LibraryDocumentIdParams = z.object({
  documentId: z.string().min(1),
});

export const LibraryShareCandidatesQuery = z.object({
  excludeUserId: z.string().min(1).optional(),
});

export const ListLibraryDocumentsQuery = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  // The management list asks for the caller's own documents; an unrestricted administrator omits it to see all.
  mine: z.literal('true').optional(),
});

export const SetLibraryDocumentSharesInput = z.strictObject({
  userIds: z.array(z.string().min(1)).max(100),
});

export const CreateLibraryDocumentInput = z.strictObject({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(50_000),
  published: z.boolean().optional().default(false),
  confidential: z.boolean().optional().default(false),
});

export const UpdateLibraryDocumentInput = z
  .strictObject({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).max(50_000).optional(),
    published: z.boolean().optional(),
    confidential: z.boolean().optional(),
  })
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    { message: 'Provide at least one field to change.' },
  );

export const LibraryDocument: z.ZodType<LibraryDocumentView> = z
  .object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    ownerId: z.string(),
    ownerName: z.string(),
    published: z.boolean(),
    confidential: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ ref: 'LibraryDocument' });

export const LibraryDocumentShareCandidate: z.ZodType<LibraryDocumentShare> = z
  .object({
    userId: z.string(),
    name: z.string(),
    email: z.string(),
  })
  .meta({ ref: 'LibraryDocumentShareCandidate' });
