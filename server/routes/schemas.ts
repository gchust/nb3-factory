import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);
const status = z.enum(['available', 'borrowed']);
const idValue = z.union([z.string().min(1), z.number()]);
const notes = z.string().trim().max(1000);

export const DeviceStatusSchema = status;

/** The device as the API returns it. Timestamps are not part of the view. */
export const DeviceSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status,
  notes: z.string().nullable(),
});

export const DevicesMeta = z.object({ total: z.number().int().nonnegative() });

export const ListDevicesQuery = z.object({
  status: status.optional(),
});

export const DeviceParams = z.object({ deviceId: z.string().min(1) });

export const CreateDeviceInput = z.strictObject({
  code: nonEmpty.max(64),
  name: nonEmpty.max(100),
  status: status.optional(),
  notes: notes.nullable().optional(),
});

export const UpdateDeviceInput = z.strictObject({
  code: nonEmpty.max(64).optional(),
  name: nonEmpty.max(100).optional(),
  status: status.optional(),
  notes: notes.nullable().optional(),
});

/**
 * The classic NocoBase resource form of the same operations, `/api/devices:get`
 * and `/api/devices:update`, where the selector travels with the body or the
 * query rather than in the path. Only the selector is looser here; the values
 * keep the strict schema above.
 */
export const GetDeviceResourceQuery = z.object({
  filterByTk: idValue.optional(),
  filter: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
});

export const CreateDeviceResourceInput = z.union([
  CreateDeviceInput,
  z.object({ values: CreateDeviceInput }),
]);

export const UpdateDeviceResourceInput = z.object({
  filter: z.object({ id: idValue }).partial().optional(),
  filterByTk: idValue.optional(),
  values: UpdateDeviceInput,
});
