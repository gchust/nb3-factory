import { z } from 'zod';

export const documentIdParams = z.object({
  id: z.string().min(1),
});

export const documentUserIdParams = z.object({
  userId: z.string().min(1),
});

export const documentCreateInput = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.string(),
  published: z.boolean().default(false),
  confidential: z.boolean().default(false),
});

export const documentUpdateInput = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    body: z.string().optional(),
    published: z.boolean().optional(),
    confidential: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const documentUserQuery = z.object({
  q: z.string().trim().max(255).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const documentUserRolesInput = z.object({
  roles: z
    .array(
      z.enum(['documents.admin', 'documents.maintainer', 'documents.reader']),
    )
    .max(3),
});

export const documentSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  ownerId: z.string(),
  published: z.boolean(),
  confidential: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const documentUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string().optional(),
  email: z.string(),
  roles: z.array(z.string()),
  disabledAt: z.string().nullable(),
});

export const documentUserListSchema = z.object({
  users: z.array(documentUserSchema),
  total: z.number(),
});
