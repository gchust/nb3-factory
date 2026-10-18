import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

import type { Application } from '@nocobase/app-server/application';

/** The two states a device can be in. `available` is the state a new device starts in. */
export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export function isDeviceStatus(value: unknown): value is DeviceStatus {
  return DEVICE_STATUSES.some((status) => status === value);
}

/** The default a new device gets when the form does not choose a status. */
export const DEFAULT_DEVICE_STATUS: DeviceStatus = 'available';

/**
 * What a client sees. `id` is a string so the API has one id shape whichever
 * connection is behind it; the timestamps the table keeps are not part of this
 * view because the list and the forms do not show them.
 */
export interface Device {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly notes: string | null;
}

/**
 * The `devices` table as the repository sees it. `increments('id')` compiles to
 * an auto-increment integer, which the driver may hand back as a number or a
 * string, so the id is widened here and narrowed at the API edge.
 */
interface DeviceRow {
  readonly id: number | string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly notes: string | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}

export type DeviceErrorCode = 'DEVICE_NOT_FOUND' | 'DEVICE_CODE_TAKEN';

/** A domain failure the route translates into the API error body. */
export class DeviceError extends Error {
  readonly code: DeviceErrorCode;

  constructor(code: DeviceErrorCode, message: string) {
    super(message);
    this.name = 'DeviceError';
    this.code = code;
  }
}

/** A mutable set of update values; `Partial<DeviceRow>` would keep its `readonly` fields. */
interface DeviceUpdateValues {
  code?: string;
  name?: string;
  status?: DeviceStatus;
  notes?: string | null;
  updatedAt: Date;
}

/** The fields a create carries. `notes` is optional; a missing one is stored as `null`. */
export interface DeviceDraft {
  readonly code: string;
  readonly name: string;
  readonly status?: DeviceStatus;
  readonly notes?: string | null;
}

/** The fields an update may carry. A missing key is left alone. */
export interface DeviceChanges {
  readonly code?: string;
  readonly name?: string;
  readonly status?: DeviceStatus;
  readonly notes?: string | null;
}

export interface ListDevicesInput {
  readonly status?: DeviceStatus;
}

export interface DeviceService {
  /** Every device, or the ones in one status, ordered by `code`. */
  list(input?: ListDevicesInput): Promise<Device[]>;
  /** One device, or `undefined` when no device has that id. */
  get(id: string): Promise<Device | undefined>;
  create(input: DeviceDraft): Promise<Device>;
  /** Throws `DEVICE_NOT_FOUND` when the id is gone and `DEVICE_CODE_TAKEN` when the code is in use. */
  update(id: string, changes: DeviceChanges): Promise<Device>;
}

export const deviceServiceToken = createServiceToken<DeviceService>(
  'nb3-factory/devices',
);

/** A numeric id is an integer column; anything else is passed through to fail as "not found". */
function toFilterId(id: string): number | string {
  return /^\d+$/.test(id) ? Number(id) : id;
}

function toDevice(row: DeviceRow): Device {
  return {
    id: String(row.id),
    code: row.code,
    name: row.name,
    status: row.status,
    notes: row.notes ?? null,
  };
}

export function createDeviceService(database: DatabaseManager): DeviceService {
  const devices: Repository<DeviceRow> =
    database.repository<DeviceRow>('devices');

  /**
   * The unique index on `code` is the real guard; this check turns the failure
   * into a named domain error before the write, since a duplicate is an
   * expected outcome of the form rather than a database fault. `exceptId`
   * lets an edit keep its own code.
   */
  async function assertCodeAvailable(
    code: string,
    exceptId?: string,
  ): Promise<void> {
    const duplicate = await devices.findOne({ filter: { code } });
    if (
      duplicate &&
      (exceptId === undefined || String(duplicate.id) !== exceptId)
    ) {
      throw new DeviceError(
        'DEVICE_CODE_TAKEN',
        `Another device already uses the code ${code}.`,
      );
    }
  }

  return {
    async list(input) {
      const rows = await devices.findMany({
        // An empty filter is rejected, so an unfiltered list passes no filter at all.
        ...(input?.status ? { filter: { status: input.status } } : {}),
        sort: (sort) => sort.field('code').asc(),
      });
      return rows.map(toDevice);
    },

    async get(id) {
      const row = await devices.findOne({ filter: { id: toFilterId(id) } });
      return row ? toDevice(row) : undefined;
    },

    async create(input) {
      await assertCodeAvailable(input.code);
      const now = new Date();
      const { record } = await devices.createOne({
        values: {
          code: input.code,
          name: input.name,
          status: input.status ?? DEFAULT_DEVICE_STATUS,
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
      return toDevice(record);
    },

    async update(id, changes) {
      const existing = await devices.findOne({
        filter: { id: toFilterId(id) },
      });
      if (!existing) {
        throw new DeviceError(
          'DEVICE_NOT_FOUND',
          `No device has the id ${id}.`,
        );
      }
      if (changes.code !== undefined && changes.code !== existing.code) {
        await assertCodeAvailable(changes.code, String(existing.id));
      }

      const values: DeviceUpdateValues = {
        updatedAt: new Date(),
      };
      if (changes.code !== undefined) values.code = changes.code;
      if (changes.name !== undefined) values.name = changes.name;
      if (changes.status !== undefined) values.status = changes.status;
      if (changes.notes !== undefined) values.notes = changes.notes;

      const { record } = await devices.updateOne({
        filter: { id: toFilterId(id) },
        values,
      });
      return toDevice(record);
    },
  };
}

/**
 * Binds the device service to its token. The repository is created lazily, the
 * first time something resolves the token, so this runs no database work while
 * the application is still being assembled.
 */
export class DevicesProvider extends ServiceProvider<Application> {
  override readonly name = 'nb3-factory/devices';

  override register(): void {
    this.app.container.singleton(deviceServiceToken, (resolver) =>
      createDeviceService(resolver.resolve(databaseManagerToken)),
    );
  }
}
