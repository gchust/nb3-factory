import { z } from 'zod';

/**
 * The request and response shapes of the materials API, stated once so the routes validate against them and the API
 * document is generated from them.
 */

export const MaterialIdParams = z.object({
  materialId: z.coerce.number().int().positive(),
});

export const MaterialShareParams = z.object({
  materialId: z.coerce.number().int().positive(),
  userId: z.string().min(1),
});

export const MaterialSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string().nullable(),
  published: z.boolean(),
  confidential: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const MaterialShareSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  createdAt: z.string(),
});

export const MaterialsCapabilitiesSchema = z.object({
  canCreate: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
  canShare: z.boolean(),
});

export const MaterialsListMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  capabilities: MaterialsCapabilitiesSchema,
});

export const MaterialSharesMetaSchema = z.object({
  total: z.number().int(),
});

const booleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

export const ListMaterialsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  q: z.string().optional(),
  ownerId: z.string().optional(),
  published: booleanQuery.optional(),
  confidential: booleanQuery.optional(),
});

export const MaterialCreateInput = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.string().nullable().optional(),
  published: z.boolean().optional(),
  confidential: z.boolean().optional(),
});

export const MaterialUpdateInput = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  body: z.string().nullable().optional(),
  published: z.boolean().optional(),
  confidential: z.boolean().optional(),
});

export const MaterialShareInput = z.object({
  userId: z.string().min(1),
});
