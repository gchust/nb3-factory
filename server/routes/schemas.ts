import { z } from 'zod';

import type { DeviceView } from '../providers/devices.js';

export const DeviceStatusSchema = z.enum(['available', 'borrowed']).meta({
  description: 'The device status key; the interface translates it.',
});

/** The list query. `status` is omitted for the whole ledger. */
export const ListDevicesQuery = z.object({
  status: DeviceStatusSchema.optional().meta({
    description: 'Return only devices in this status.',
  }),
});

export const DeviceIdParams = z.object({
  deviceId: z.string().min(1).meta({ description: 'The device id.' }),
});

export const CreateDeviceInput = z.strictObject({
  code: z
    .string()
    .trim()
    .min(1, 'A device code is required.')
    .max(64, 'A device code may not exceed 64 characters.')
    .meta({ description: 'The unique business code of the device.' }),
  name: z
    .string()
    .trim()
    .min(1, 'A device name is required.')
    .max(255, 'A device name may not exceed 255 characters.')
    .meta({ description: 'The device name, kept exactly as entered.' }),
  status: DeviceStatusSchema,
});

export const UpdateDeviceInput = z
  .strictObject({
    code: z
      .string()
      .trim()
      .min(1, 'A device code is required.')
      .max(64, 'A device code may not exceed 64 characters.')
      .optional()
      .meta({ description: 'The unique business code of the device.' }),
    name: z
      .string()
      .trim()
      .min(1, 'A device name is required.')
      .max(255, 'A device name may not exceed 255 characters.')
      .optional()
      .meta({ description: 'The device name, kept exactly as entered.' }),
    status: DeviceStatusSchema.optional(),
  })
  .refine(
    (input) =>
      input.code !== undefined ||
      input.name !== undefined ||
      input.status !== undefined,
    { message: 'At least one device field must be provided.' },
  );

export const Device: z.ZodType<DeviceView> = z
  .object({
    id: z.string().meta({ description: 'The device id.' }),
    code: z.string().meta({ description: 'The unique business code.' }),
    name: z.string().meta({ description: 'The device name.' }),
    status: DeviceStatusSchema,
    createdAt: z.iso
      .datetime()
      .meta({ description: 'When the device was added.' }),
    updatedAt: z.iso
      .datetime()
      .meta({ description: 'When the device was last changed.' }),
  })
  .meta({ ref: 'Device' });
