import { z } from 'zod';

import { DEVICE_STATUSES, type DeviceView } from '../providers/devices.js';

export const DeviceStatusSchema = z.enum(DEVICE_STATUSES);

export const DeviceSchema: z.ZodType<DeviceView> = z
  .object({
    id: z.string().meta({ description: 'The device id.' }),
    code: z.string().meta({ description: 'The unique equipment code.' }),
    name: z.string().meta({ description: 'The equipment name.' }),
    status: DeviceStatusSchema,
    notes: z.string().nullable(),
    createdAt: z.string().meta({ description: 'RFC 3339 creation time.' }),
    updatedAt: z
      .string()
      .nullable()
      .meta({ description: 'RFC 3339 time of the last change.' }),
  })
  .meta({ ref: 'Device' });

export const ListDevicesQuery = z.object({
  status: DeviceStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const DeviceParams = z.object({
  deviceId: z.string().min(1).max(64),
});

export const CreateDeviceInput = z.strictObject({
  code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .meta({ description: 'The unique equipment code.' }),
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .meta({ description: 'The equipment name.' }),
  status: DeviceStatusSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const UpdateDeviceInput = CreateDeviceInput.partial();

export type DeviceParamsInput = z.infer<typeof DeviceParams>;
export type ListDevicesQueryInput = z.infer<typeof ListDevicesQuery>;
export type CreateDeviceInputValue = z.infer<typeof CreateDeviceInput>;
export type UpdateDeviceInputValue = z.infer<typeof UpdateDeviceInput>;
