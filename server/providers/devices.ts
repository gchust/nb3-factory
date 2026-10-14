import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

/**
 * The statuses a device may hold. `available` means the device can be taken,
 * `borrowed` means it is currently out. The set is deliberately small and
 * closed: the Collection stores the value as a plain string, so this constant
 * and the route schema are what keep it a closed set.
 */
export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** The row shape this service reads and writes in the `devices` Collection. */
export interface DeviceRecord {
  id: number;
  code: string;
  name: string;
  status: DeviceStatus;
}

/**
 * A device as the API returns it. The only difference from the stored row is
 * `id`: an auto-increment id is a number in the database and a string in the
 * HTTP API.
 */
export interface DeviceView {
  id: string;
  code: string;
  name: string;
  status: DeviceStatus;
}

export interface DeviceValues {
  code: string;
  name: string;
  status: DeviceStatus;
}

export interface ListDevicesInput {
  status?: DeviceStatus;
  page: number;
  pageSize: number;
}

export interface ListDevicesResult {
  items: DeviceView[];
  total: number;
}

/** Raised when a device the caller named does not exist. */
export class DeviceNotFoundError extends Error {
  public readonly deviceId: string;

  constructor(deviceId: string) {
    super(`Device ${deviceId} was not found.`);
    this.name = 'DeviceNotFoundError';
    this.deviceId = deviceId;
  }
}

/**
 * Raised when a create or update would put two devices under the same code.
 * The database enforces the unique index as well; this error lets the route
 * answer a readable 409 instead of the driver's raw constraint failure.
 */
export class DeviceCodeTakenError extends Error {
  public readonly code: string;

  constructor(code: string) {
    super(`Device code "${code}" is already in use.`);
    this.name = 'DeviceCodeTakenError';
    this.code = code;
  }
}

export interface DeviceService {
  list(input: ListDevicesInput): Promise<ListDevicesResult>;
  get(deviceId: string): Promise<DeviceView | undefined>;
  create(values: DeviceValues): Promise<DeviceView>;
  update(deviceId: string, values: Partial<DeviceValues>): Promise<DeviceView>;
}

/** The token the routes resolve the device service by. */
export const deviceServiceToken = createServiceToken<DeviceService>(
  'app/devices/service',
);

function toView(record: DeviceRecord): DeviceView {
  return {
    id: String(record.id),
    code: record.code,
    name: record.name,
    status: record.status,
  };
}

/** `undefined` for anything that cannot be an auto-increment id. */
function toId(deviceId: string): number | undefined {
  return /^\d+$/u.test(deviceId) ? Number.parseInt(deviceId, 10) : undefined;
}

export class DeviceServiceImplementation implements DeviceService {
  private readonly devices: Repository<DeviceRecord>;

  constructor(database: DatabaseManager) {
    this.devices = database.repository<DeviceRecord>('devices');
  }

  async list(input: ListDevicesInput): Promise<ListDevicesResult> {
    const filter = input.status ? { status: input.status } : undefined;
    const [records, total] = await Promise.all([
      this.devices.findMany({
        filter,
        sort: (sort) => sort.field('code').asc(),
        limit: input.pageSize,
        offset: (input.page - 1) * input.pageSize,
      }),
      this.devices.count({ filter }),
    ]);
    return { items: records.map(toView), total };
  }

  async get(deviceId: string): Promise<DeviceView | undefined> {
    const id = toId(deviceId);
    if (id === undefined) {
      return undefined;
    }
    const record = await this.devices.findOne({ filter: { id } });
    return record ? toView(record) : undefined;
  }

  async create(values: DeviceValues): Promise<DeviceView> {
    await this.assertCodeFree(values.code);
    try {
      const { record } = await this.devices.createOne({ values });
      return toView(record);
    } catch (error) {
      // The pre-check cannot see a concurrent create that lands between it and
      // this write. The unique index does, but raises the driver's own error,
      // so a second look decides whether that is the collision or something
      // else worth reporting as a server fault.
      await this.assertCodeFree(values.code);
      throw error;
    }
  }

  async update(
    deviceId: string,
    values: Partial<DeviceValues>,
  ): Promise<DeviceView> {
    const existing = await this.get(deviceId);
    if (!existing) {
      throw new DeviceNotFoundError(deviceId);
    }
    const id = toId(deviceId);
    // A code left unchanged belongs to this very device, so only a new code
    // needs to be checked against the others.
    if (values.code !== undefined && values.code !== existing.code) {
      await this.assertCodeFree(values.code);
    }
    try {
      const { record } = await this.devices.updateOne({
        filter: { id },
        values,
      });
      return toView(record);
    } catch (error) {
      if (values.code !== undefined && values.code !== existing.code) {
        await this.assertCodeFree(values.code);
      }
      throw error;
    }
  }

  private async assertCodeFree(code: string): Promise<void> {
    if (await this.devices.exists({ filter: { code } })) {
      throw new DeviceCodeTakenError(code);
    }
  }
}

/** Registers the device service in the application container. */
export class DeviceServiceProvider extends ServiceProvider<Application> {
  public readonly name = 'app/devices';

  public override register(): void {
    this.app.container.singleton(deviceServiceToken, (container) => {
      return new DeviceServiceImplementation(
        container.resolve(databaseManagerToken),
      );
    });
  }
}
