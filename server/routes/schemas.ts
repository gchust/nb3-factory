import { z } from 'zod';

import type { Device } from '../providers/devices.js';

/**
 * Request and response schemas for the device ledger routes. Response schemas are annotated with the service's view
 * types so a route's documented body cannot drift from what the service returns without failing typecheck.
 */

const MAX_REFERENCE_LENGTH = 64;
const MAX_NAME_LENGTH = 255;
const MAX_REMARK_LENGTH = 2000;
const MAX_PAGE_SIZE = 100;

export const DeviceStatusSchema = z.enum(['available', 'borrowed']);

export const DeviceSchema: z.ZodType<Device> = z
  .object({
    id: z.string().meta({ description: 'The device id.' }),
    reference: z
      .string()
      .meta({ description: 'The business number of the device.' }),
    name: z.string().meta({ description: 'The device name.' }),
    status: DeviceStatusSchema.meta({
      description: 'Whether the device can be borrowed.',
    }),
    remark: z
      .string()
      .nullable()
      .meta({ description: 'Free-form note, or null when there is none.' }),
    createdAt: z.iso.datetime().meta({ description: 'When it was created.' }),
    updatedAt: z.iso
      .datetime()
      .meta({ description: 'When it was last changed.' }),
  })
  .meta({ ref: 'Device' });

export const DeviceListQuery = z.object({
  status: DeviceStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});

export const DeviceListMeta: z.ZodType<{
  page: number;
  pageSize: number;
  total: number;
}> = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const DeviceParams = z.object({
  deviceId: z.string().min(1).meta({ description: 'The device id.' }),
});

export const CreateDeviceInput = z.strictObject({
  reference: z
    .string()
    .trim()
    .min(1)
    .max(MAX_REFERENCE_LENGTH)
    .meta({ description: 'The unique business number of the device.' }),
  name: z
    .string()
    .trim()
    .min(1)
    .max(MAX_NAME_LENGTH)
    .meta({ description: 'The device name.' }),
  status: DeviceStatusSchema,
  remark: z
    .string()
    .trim()
    .max(MAX_REMARK_LENGTH)
    .nullable()
    .optional()
    .meta({ description: 'An optional note.' }),
});

export const UpdateDeviceInput = z.strictObject({
  reference: z.string().trim().min(1).max(MAX_REFERENCE_LENGTH).optional(),
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
  status: DeviceStatusSchema.optional(),
  remark: z.string().trim().max(MAX_REMARK_LENGTH).nullable().optional(),
});

export { MAX_NAME_LENGTH, MAX_REFERENCE_LENGTH, MAX_REMARK_LENGTH };
