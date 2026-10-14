import { z } from 'zod';

import { DEVICE_STATUSES, type DeviceView } from '../providers/devices.js';

/** Rows a page holds unless the caller asks otherwise, and the most it may ask for. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const PageSize = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .default(DEFAULT_PAGE_SIZE);

export const DeviceParams = z.object({ deviceId: z.string().min(1) });

export const DeviceStatusSchema = z.enum(DEVICE_STATUSES);

/** The `devices` table pages by number, so it can show a total. */
export const DeviceListQuery = z.object({
  status: DeviceStatusSchema.optional().meta({
    description: 'Return only devices in this status.',
  }),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: PageSize,
});

/**
 * Both `code` and `name` are required, and `status` must be one of the two
 * known values. `code` is trimmed first, so a code of spaces is rejected
 * rather than stored.
 */
export const DeviceCreateInput = z.strictObject({
  code: z.string().trim().min(1).max(64).meta({
    description: 'The unique identifier a person reads on the device.',
  }),
  name: z.string().trim().min(1).max(255),
  status: DeviceStatusSchema,
});

/**
 * A PATCH carries only the fields it changes. Every field is optional, but at
 * least one must be present so an empty body is a bad request instead of a
 * silent no-op.
 */
export const DeviceUpdateInput = z
  .strictObject({
    code: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(255).optional(),
    status: DeviceStatusSchema.optional(),
  })
  .refine((values) => Object.keys(values).length > 0, {
    message: 'At least one field must be provided.',
  });

// Response schemas. They describe what the routes send in the API document at
// `/api/swagger/docs`; nothing validates a response against them.
export const Device: z.ZodType<DeviceView> = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    status: DeviceStatusSchema,
  })
  .meta({ ref: 'Device' });

export const DeviceListMeta = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .meta({ ref: 'DeviceListMeta' });
