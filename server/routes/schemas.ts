import { z } from 'zod';

/** Request and response schemas for the internal document library API. */

export const MaterialParams = z.object({
  materialId: z.string().min(1),
});

export const ShareParams = z.object({
  materialId: z.string().min(1),
  userId: z.string().min(1),
});

export const ListMaterialsQuery = z.object({
  q: z.string().optional(),
});

export const CreateMaterialInput = z.strictObject({
  title: z.string().trim().min(1),
  content: z.string().default(''),
  published: z.boolean().default(false),
  confidential: z.boolean().default(false),
});

export const UpdateMaterialInput = z.strictObject({
  title: z.string().trim().min(1).optional(),
  content: z.string().optional(),
  published: z.boolean().optional(),
  confidential: z.boolean().optional(),
});

export const CreateShareInput = z.strictObject({
  userId: z.string().min(1),
});

/** An RFC 3339 timestamp, documented by its format alone rather than by a long pattern. */
const dateTime = () => z.string().meta({ format: 'date-time' });

export const MaterialListItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    ownerId: z.string(),
    ownerName: z.string(),
    published: z.boolean(),
    confidential: z.boolean(),
    canEdit: z.boolean().meta({
      description:
        'Whether the current user may edit this document. Reading never implies editing.',
    }),
    shared: z.boolean().meta({
      description:
        'Whether an administrator opened this single document to the current user.',
    }),
    createdAt: dateTime(),
    updatedAt: dateTime(),
  })
  .meta({ ref: 'MaterialsMaterialListItem' });

export const MaterialShareSchema = z
  .object({
    userId: z.string(),
    userName: z.string(),
    createdAt: dateTime(),
  })
  .meta({ ref: 'MaterialsMaterialShare' });

export const MaterialDetailSchema = MaterialListItemSchema.extend({
  canShare: z.boolean().meta({
    description:
      'Whether the current user may manage sharing. Administrators only.',
  }),
  shares: z.array(MaterialShareSchema).meta({
    description:
      'The users this document is temporarily open to. Empty for anyone but an administrator.',
  }),
}).meta({ ref: 'MaterialsMaterialDetail' });

export const MaterialListMeta = z.object({
  total: z.number().int(),
  canCreate: z.boolean().meta({
    description:
      'Whether the current user may create a document. A reader may not.',
  }),
});
