import { z } from 'zod';

import {
  DEVICE_CODE_MAX_LENGTH,
  DEVICE_NAME_MAX_LENGTH,
  DEVICE_STATUSES,
} from '../providers/devices.js';

export const DeviceStatusSchema = z.enum(DEVICE_STATUSES);

/** One device as the API returns it. `id` is a string, unlike the numeric id the connection stores. */
export const DeviceSchema: z.ZodType<{
  id: string;
  code: string;
  name: string;
  status: (typeof DEVICE_STATUSES)[number];
}> = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: DeviceStatusSchema,
});

/** `GET /api/devices` query: an optional status filter. */
export const DeviceListQuery = z.object({
  status: DeviceStatusSchema.optional(),
});

/** `:deviceId` is coerced to a number here, so a non-numeric id is a 400 and the handlers always see a number. */
export const DeviceParams = z.object({
  deviceId: z.coerce.number().int().positive(),
});

/** `POST /api/devices` body. */
export const CreateDeviceInput = z.object({
  code: z.string().trim().min(1).max(DEVICE_CODE_MAX_LENGTH),
  name: z.string().trim().min(1).max(DEVICE_NAME_MAX_LENGTH),
  status: DeviceStatusSchema,
});

/** `PATCH /api/devices/:deviceId` body: any subset of the writable fields. */
export const UpdateDeviceInput = CreateDeviceInput.partial();
