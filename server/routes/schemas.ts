import { z } from 'zod';

import {
  EQUIPMENT_STATUSES,
  type EquipmentView,
} from '../providers/equipment.js';

/** Rows a page holds unless the caller asks otherwise, and the most it may ask for. */
export const DEFAULT_EQUIPMENT_PAGE_SIZE = 20;
export const MAX_EQUIPMENT_PAGE_SIZE = 100;

const PageSize = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_EQUIPMENT_PAGE_SIZE)
  .default(DEFAULT_EQUIPMENT_PAGE_SIZE);

export const EquipmentParams = z.object({
  equipmentId: z.coerce.number().int().positive(),
});

export const ListEquipmentQuery = z.object({
  status: z.enum(EQUIPMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: PageSize,
});

export const EquipmentWriteInput = z.strictObject({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(191),
  status: z.enum(EQUIPMENT_STATUSES),
  notes: z.string().trim().max(2000).nullable(),
});

const dateTime = () => z.string().meta({ format: 'date-time' });

// Typed against what the service returns, so the documented response cannot drift from the real one.
export const Equipment: z.ZodType<EquipmentView> = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    status: z.enum(EQUIPMENT_STATUSES),
    notes: z.string().nullable(),
    createdAt: dateTime(),
    updatedAt: dateTime(),
  })
  .meta({ ref: 'Equipment' });

export const EquipmentListMeta = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});
