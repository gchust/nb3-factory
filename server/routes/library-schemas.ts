import { z } from 'zod';

import type {
  LibraryAdminDocument as LibraryAdminDocumentView,
  LibraryAdminUser as LibraryAdminUserView,
  LibraryDocumentView,
  LibraryShareView,
} from '../library/service.js';

export const LibraryPageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const LibraryDocumentParams = z.object({
  documentId: z.string().min(1).max(64),
});

export const LibraryShareParams = z.object({
  shareId: z.string().min(1).max(64),
});

export const CreateLibraryDocument = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .meta({ description: 'The document title.' }),
  body: z
    .string()
    .max(100_000)
    .default('')
    .meta({ description: 'The document text.' }),
  published: z.boolean().default(false),
  confidential: z.boolean().default(false),
});

export const UpdateLibraryDocument = z
  .strictObject({
    title: z.string().trim().min(1).max(255).optional(),
    body: z.string().max(100_000).optional(),
    published: z.boolean().optional(),
    confidential: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to change.',
  });

export const CreateLibraryShare = z.strictObject({
  documentId: z.string().min(1).max(64),
  userId: z.string().min(1).max(64),
});

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
    canEdit: z.boolean(),
    canDelete: z.boolean(),
  })
  .meta({ ref: 'LibraryDocument' });

export const LibraryShare: z.ZodType<LibraryShareView> = z
  .object({
    id: z.string(),
    documentId: z.string(),
    userId: z.string(),
    userName: z.string(),
    userEmail: z.string(),
    createdAt: z.iso.datetime(),
  })
  .meta({ ref: 'LibraryShare' });

export const LibraryAdminDocument: z.ZodType<LibraryAdminDocumentView> = z
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
    canEdit: z.boolean(),
    canDelete: z.boolean(),
    shares: z.array(LibraryShare),
  })
  .meta({ ref: 'LibraryAdminDocument' });

export const LibraryAdminUser: z.ZodType<LibraryAdminUserView> = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  })
  .meta({ ref: 'LibraryAdminUser' });
