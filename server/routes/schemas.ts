import { z } from 'zod';

import {
  DEFAULT_PAGE_SIZE,
  DEVICE_STATUSES,
  MAX_PAGE_SIZE,
  type DeviceList,
  type DeviceView,
} from '../providers/devices.js';

/** The device ledger's statuses, shared by the request validators and the response schema. */
export const DeviceStatusSchema = z.enum(DEVICE_STATUSES);

/** A device as every endpoint returns it. */
export const DeviceSchema: z.ZodType<DeviceView> = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    status: DeviceStatusSchema,
  })
  .meta({ ref: 'Device' });

/** `{ data, meta }` for the list endpoint, typed against what the service returns. */
export const DeviceListMetaSchema: z.ZodType<DeviceList['meta']> = z
  .object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  })
  .meta({ ref: 'DeviceListMeta' });

export const DeviceParams = z.object({ deviceId: z.string() });

/** Query string values arrive as strings, so `page` and `pageSize` are coerced before their bounds are checked. */
export const ListDevicesQuery = z.object({
  q: z.string().optional(),
  status: DeviceStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

/**
 * Body of `POST /api/devices`. The shape mirrors `CreateDeviceInput` in the service; the route validates before the
 * service sees it.
 */
export const CreateDeviceInput = z.strictObject({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  status: DeviceStatusSchema,
});

/** Body of `PATCH /api/devices/:deviceId`: only the fields sent are changed. */
export const UpdateDeviceInput = CreateDeviceInput.partial();

export type ListDevicesQueryInput = z.infer<typeof ListDevicesQuery>;
export type CreateDeviceInputValue = z.infer<typeof CreateDeviceInput>;
export type UpdateDeviceInputValue = z.infer<typeof UpdateDeviceInput>;
