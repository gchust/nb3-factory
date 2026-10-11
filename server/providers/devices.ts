import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** The two borrowing states a device may be in. The stored values are stable and never localized. */
export const DEVICE_STATUSES = ['available', 'borrowed'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** Field limits, shared by the request schemas and the database columns so both reject the same input. */
export const DEVICE_CODE_MAX_LENGTH = 64;
export const DEVICE_NAME_MAX_LENGTH = 255;

export interface Device {
  /** The numeric id, serialized as a string at the API boundary. */
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
}

export interface DeviceInput {
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
}

export interface DeviceChanges {
  readonly code?: string;
  readonly name?: string;
  readonly status?: DeviceStatus;
}

export interface DeviceListFilter {
  readonly status?: DeviceStatus;
}

/** A second device already uses this code; the `uq_devices_code` constraint refused the write. */
export class DeviceCodeTakenError extends Error {
  public readonly code: string = 'DEVICE_CODE_TAKEN';

  public constructor() {
    super('A device with this code already exists.');
    this.name = 'DeviceCodeTakenError';
  }
}

/** No device has the requested id. */
export class DeviceNotFoundError extends Error {
  public readonly code: string = 'DEVICE_NOT_FOUND';

  public constructor(id: number) {
    super(`Device ${id} does not exist.`);
    this.name = 'DeviceNotFoundError';
  }
}

export interface DeviceService {
  list(filter?: DeviceListFilter): Promise<Device[]>;
  find(id: number): Promise<Device | undefined>;
  create(input: DeviceInput): Promise<Device>;
  update(id: number, changes: DeviceChanges): Promise<Device>;
}

export const deviceServiceToken: ServiceToken<DeviceService> =
  createServiceToken<DeviceService>('app/device-service');

/** A `devices` table row, read as an untyped record because the query adapter does not carry table typings. */
function toDevice(row: Record<string, unknown>): Device {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    status: row.status === 'borrowed' ? 'borrowed' : 'available',
  };
}

/**
 * The ledger's data access. It talks to the `devices` table through the connection's query adapter, so it does not
 * depend on the Collection having been materialized into metadata, and it returns domain results rather than HTTP
 * concerns. Uniqueness is enforced by the database; the service translates the constraint into a domain error.
 */
export function createDeviceService(database: DatabaseManager): DeviceService {
  const query = database.query();

  async function findByCode(code: string): Promise<Device | undefined> {
    const row = await query
      .selectFrom('devices')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirst();
    return row ? toDevice(row) : undefined;
  }

  async function findById(id: number): Promise<Device | undefined> {
    const row = await query
      .selectFrom('devices')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toDevice(row) : undefined;
  }

  return {
    async list(filter: DeviceListFilter = {}): Promise<Device[]> {
      let select = query.selectFrom('devices').selectAll();
      if (filter.status) {
        select = select.where('status', '=', filter.status);
      }
      const rows = await select.orderBy('code', 'asc').execute();
      return rows.map(toDevice);
    },

    async find(id: number): Promise<Device | undefined> {
      return findById(id);
    },

    async create(input: DeviceInput): Promise<Device> {
      // The pre-check turns the common case into a clear domain error; the catch below covers the race between it and
      // the insert, where the unique constraint is the only thing that can still stop the write.
      if (await findByCode(input.code)) {
        throw new DeviceCodeTakenError();
      }

      try {
        await query
          .insertInto('devices')
          .values({
            code: input.code,
            name: input.name,
            status: input.status,
          })
          .execute();
      } catch (error) {
        if (await findByCode(input.code)) {
          throw new DeviceCodeTakenError();
        }
        throw error;
      }

      const created = await findByCode(input.code);
      if (!created) {
        throw new Error('The device was inserted but could not be read back.');
      }
      return created;
    },

    async update(id: number, changes: DeviceChanges): Promise<Device> {
      const existing = await findById(id);
      if (!existing) {
        throw new DeviceNotFoundError(id);
      }

      if (changes.code && changes.code !== existing.code) {
        const conflicting = await findByCode(changes.code);
        if (conflicting && conflicting.id !== existing.id) {
          throw new DeviceCodeTakenError();
        }
      }

      const values: { code?: string; name?: string; status?: DeviceStatus } =
        {};
      if (changes.code !== undefined) values.code = changes.code;
      if (changes.name !== undefined) values.name = changes.name;
      if (changes.status !== undefined) values.status = changes.status;

      if (Object.keys(values).length > 0) {
        try {
          await query
            .updateTable('devices')
            .set(values)
            .where('id', '=', id)
            .execute();
        } catch (error) {
          if (changes.code && (await findByCode(changes.code))) {
            throw new DeviceCodeTakenError();
          }
          throw error;
        }
      }

      const updated = await findById(id);
      if (!updated) {
        throw new DeviceNotFoundError(id);
      }
      return updated;
    },
  };
}

export default class DevicesProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/devices-provider';

  public override register(): void {
    this.app.container.singleton(deviceServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createDeviceService(database);
    });
  }
}
