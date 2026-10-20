import { z } from 'zod';

import type {
  DocumentShareView,
  DocumentView,
  ShareCandidate,
} from '../providers/document-types.js';

export const DocumentParams = z.object({
  documentId: z.string().min(1),
});

export const ShareParams = DocumentParams.extend({
  shareId: z.string().min(1),
});

export const CreateDocumentInput = z.strictObject({
  title: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1).max(50_000),
  published: z.boolean().default(false),
  confidential: z.boolean().default(false),
});

export const UpdateDocumentInput = CreateDocumentInput;

export const CreateShareInput = z.strictObject({
  userId: z.string().min(1),
  expiresAt: z.iso.datetime().nullable().optional(),
});

export const DocumentSchema: z.ZodType<DocumentView> = z
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
  .meta({ ref: 'Document' });

export const DocumentShareSchema: z.ZodType<DocumentShareView> = z
  .object({
    id: z.string(),
    documentId: z.string(),
    userId: z.string(),
    userName: z.string(),
    sharedById: z.string(),
    sharedByName: z.string(),
    expiresAt: z.iso.datetime().nullable(),
    revokedAt: z.iso.datetime().nullable(),
    active: z.boolean(),
  })
  .meta({ ref: 'DocumentShare' });

export const ShareCandidateSchema: z.ZodType<ShareCandidate> = z
  .object({
    id: z.string(),
    name: z.string(),
    username: z.string().nullable(),
    email: z.string(),
  })
  .meta({ ref: 'DocumentShareCandidate' });

export const DocumentListMeta = z.object({
  total: z.number().int().min(0),
});

export const ShareListMeta = z.object({
  total: z.number().int().min(0),
});

export const CandidateListMeta = z.object({
  total: z.number().int().min(0),
});
