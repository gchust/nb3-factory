import { z } from 'zod';

import type {
  LibraryActor,
  LibraryMaterial,
  LibraryMember,
  LibraryShare,
} from '../providers/library.js';

/** The material the path names. Ids are UUID strings. */
export const MaterialParams = z.object({
  materialId: z.string().min(1).meta({ description: 'The material id.' }),
});

/** The material and the person a share names. */
export const MaterialShareParams = z.object({
  materialId: z.string().min(1).meta({ description: 'The material id.' }),
  userId: z.string().min(1).meta({ description: 'The user id to unshare.' }),
});

/** The person whose library role is replaced. */
export const MemberParams = z.object({
  userId: z.string().min(1).meta({ description: 'The user id.' }),
});

export const CreateMaterialInput = z.strictObject({
  title: z
    .string()
    .min(1)
    .max(255)
    .meta({ description: 'The material title.' }),
  body: z
    .string()
    .max(20000)
    .nullish()
    .meta({ description: 'The material body.' }),
  published: z
    .boolean()
    .optional()
    .meta({ description: 'Whether every library member may read it.' }),
  confidential: z.boolean().optional().meta({
    description: 'Whether only the owner and administrators may read it.',
  }),
});

export const UpdateMaterialInput = z.strictObject({
  title: z.string().min(1).max(255).optional().meta({
    description: 'The material title.',
  }),
  body: z
    .string()
    .max(20000)
    .nullish()
    .meta({ description: 'The material body.' }),
  published: z.boolean().optional().meta({
    description: 'Whether every library member may read it.',
  }),
  confidential: z.boolean().optional().meta({
    description: 'Whether only the owner and administrators may read it.',
  }),
});

export const ShareMaterialInput = z.strictObject({
  userId: z
    .string()
    .min(1)
    .meta({ description: 'The user to share the material with.' }),
});

export const SetMemberRoleInput = z.strictObject({
  role: z
    .enum(['editor', 'reader'])
    .meta({ description: 'The library work role.' }),
});

export const LibraryActorSchema: z.ZodType<LibraryActor> = z
  .object({
    userId: z.string(),
    isAdmin: z.boolean(),
    role: z.enum(['editor', 'reader']).nullable(),
  })
  .meta({ ref: 'LibraryActor' });

export const LibraryMaterialSchema: z.ZodType<LibraryMaterial> = z
  .object({
    id: z.string(),
    title: z.string(),
    body: z.string().nullable(),
    ownerId: z.string(),
    ownerName: z.string(),
    published: z.boolean(),
    confidential: z.boolean(),
    shared: z.boolean(),
    writable: z.boolean(),
    canShare: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'LibraryMaterial' });

export const LibraryShareSchema: z.ZodType<LibraryShare> = z
  .object({
    userId: z.string(),
    name: z.string(),
    username: z.string().nullable(),
    email: z.string(),
    createdAt: z.string(),
  })
  .meta({ ref: 'LibraryShare' });

export const LibraryMemberSchema: z.ZodType<LibraryMember> = z
  .object({
    userId: z.string(),
    name: z.string(),
    username: z.string().nullable(),
    email: z.string(),
    role: z.enum(['editor', 'reader']).nullable(),
    disabled: z.boolean(),
    isAdmin: z.boolean(),
  })
  .meta({ ref: 'LibraryMember' });
