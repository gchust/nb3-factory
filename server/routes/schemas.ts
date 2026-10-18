import { z } from 'zod';

import { EQUIPMENT_STATUSES } from '../services/equipment.js';

export const EquipmentStatusSchema = z.enum(EQUIPMENT_STATUSES).meta({
  description: '`available` can be borrowed; `borrowed` is currently out.',
});

export const EquipmentSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    status: EquipmentStatusSchema,
    notes: z.string().nullable(),
  })
  .meta({ ref: 'Equipment' });

export const EquipmentPageMeta = z
  .object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  })
  .meta({ ref: 'EquipmentPageMeta' });

export const EquipmentParams = z.object({
  id: z.coerce.number().int().positive(),
});

export const ListEquipmentsQuery = z.object({
  status: EquipmentStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const CreateEquipmentInput = z
  .object({
    code: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(191),
    status: EquipmentStatusSchema.default('available'),
    notes: z.string().max(2000).nullable().optional(),
  })
  .meta({ ref: 'CreateEquipmentInput' });

export const UpdateEquipmentInput = z
  .object({
    code: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(191).optional(),
    status: EquipmentStatusSchema.optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .meta({ ref: 'UpdateEquipmentInput' });
