import { z } from 'zod';

import { DEVICE_STATUSES } from '../providers/devices.js';

/** A device status, as the wire accepts and answers it. */
export const DeviceStatusSchema = z.enum(DEVICE_STATUSES);

/**
 * A device in the ledger. Response schemas document what a route sends; nothing validates a response against them.
 */
export const DeviceSchema = z
  .object({
    /** The device's id, a string as every `/api` id is. */
    id: z.string(),
    /** The ledger-unique code, such as `DEV-0001`. */
    code: z.string(),
    /** The device's name. */
    name: z.string(),
    status: DeviceStatusSchema,
  })
  .meta({
    ref: 'Device',
    description: 'A device in the ledger.',
  });

/** What a list of devices carries besides its rows. */
export const DevicesListMeta = z
  .object({
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .meta({
    ref: 'DevicesListMeta',
    description: 'Where one page of devices sits in the whole ledger.',
  });

/** The query of `GET /devices`: a page, optionally limited to one status. */
export const ListDevicesQuery = z.object({
  status: DeviceStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** The path of the routes that act on one device. */
export const DeviceParams = z.object({
  deviceId: z.string().min(1),
});

/** The body of `POST /devices`. */
export const CreateDeviceInput = z.strictObject({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  status: DeviceStatusSchema.default('available'),
});

/** The body of `PATCH /devices/:deviceId`: the fields to change. */
export const UpdateDeviceInput = z
  .strictObject({
    code: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(255).optional(),
    status: DeviceStatusSchema.optional(),
  })
  .refine(
    (value) =>
      value.code !== undefined ||
      value.name !== undefined ||
      value.status !== undefined,
    { message: 'At least one field must be provided.' },
  );
