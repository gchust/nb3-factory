import type {
  Application,
  ApplicationServiceProviderConstructor,
} from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
  type RepositoryFilter,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

/** The statuses a device may hold. The database stores one of these strings. */
export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** A `devices` row as the database returns it. The primary key is an auto-increment integer. */
interface DeviceRow {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly status: string;
}

/** A device as an endpoint returns it. Every `/api` id is a string, the database's integer key included. */
export interface DeviceView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
}

/** What a device may be created or updated with. */
export interface DeviceInput {
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
}

export interface DeviceListInput {
  readonly status?: DeviceStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface DeviceListResult {
  readonly data: DeviceView[];
  readonly total: number;
}

/** A device already carries this code, which the table keeps unique. */
export class DeviceCodeTakenError extends Error {
  constructor(readonly code: string) {
    super(`A device with code "${code}" already exists.`);
    this.name = 'DeviceCodeTakenError';
  }
}

/** No device in the ledger has this id. */
export class DeviceNotFoundError extends Error {
  constructor(readonly deviceId: string) {
    super(`Device "${deviceId}" was not found.`);
    this.name = 'DeviceNotFoundError';
  }
}

/**
 * The id an endpoint received, as the database number, or undefined when it cannot name a row: ids are strings on the
 * wire but the primary key is an auto-increment integer, so anything but a positive whole number names nothing.
 */
function toDeviceId(deviceId: string): number | undefined {
  if (!/^[1-9][0-9]*$/u.test(deviceId)) {
    return undefined;
  }
  const id = Number(deviceId);
  return Number.isSafeInteger(id) ? id : undefined;
}

function toView(row: DeviceRow): DeviceView {
  return {
    id: String(row.id),
    code: row.code,
    name: row.name,
    status: row.status as DeviceStatus,
  };
}

/**
 * The device ledger's domain logic: which devices exist, what a valid write is, and what a write refuses. It talks to
 * the database and answers with records; it never reads a Hono context or decides an HTTP status.
 */
export class DeviceService {
  constructor(private readonly manager: () => DatabaseManager) {}

  private repository(): Repository<DeviceRow> {
    return this.manager().repository<DeviceRow>('devices');
  }

  /** One page of devices, newest first, optionally limited to a status. */
  async list(input: DeviceListInput): Promise<DeviceListResult> {
    const repository = this.repository();
    const status = input.status;
    const filter: RepositoryFilter<DeviceRow> | undefined = status
      ? (where) => where.string('status').eq(status)
      : undefined;
    const rows = await repository.findMany({
      filter,
      sort: (sort) => sort.field('id').desc(),
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    });
    const total = await repository.count({ filter });
    return { data: rows.map(toView), total };
  }

  /** One device, or `DeviceNotFoundError` when the id names none. */
  async get(deviceId: string): Promise<DeviceView> {
    const id = toDeviceId(deviceId);
    const row =
      id === undefined
        ? undefined
        : await this.repository().findOne({
            filter: (where) => where.number('id').eq(id),
          });
    if (!row) {
      throw new DeviceNotFoundError(deviceId);
    }
    return toView(row);
  }

  /** Adds a device, refusing a code another device already holds. */
  async create(input: DeviceInput): Promise<DeviceView> {
    const repository = this.repository();
    if (await repository.exists({ filter: { code: input.code } })) {
      throw new DeviceCodeTakenError(input.code);
    }
    const { record } = await repository.createOne({ values: input });
    return toView(record);
  }

  /** Changes a device, refusing an id that names none and a code another device holds. */
  async update(
    deviceId: string,
    input: Partial<DeviceInput>,
  ): Promise<DeviceView> {
    const repository = this.repository();
    const id = toDeviceId(deviceId);
    const existing =
      id === undefined
        ? undefined
        : await repository.findOne({
            filter: (where) => where.number('id').eq(id),
          });
    if (!existing) {
      throw new DeviceNotFoundError(deviceId);
    }
    if (
      input.code !== undefined &&
      input.code !== existing.code &&
      (await repository.exists({ filter: { code: input.code } }))
    ) {
      throw new DeviceCodeTakenError(input.code);
    }
    const { record } = await repository.updateOne({
      filter: (where) => where.number('id').eq(existing.id),
      values: input,
    });
    return toView(record);
  }
}

export const deviceServiceToken = createServiceToken<DeviceService>('devices');

/** Binds the device service, which the `/api/devices` routes resolve. */
export class DevicesProvider extends ServiceProvider<Application> {
  readonly name = 'devices';

  register(): void {
    this.app.container.singleton(
      deviceServiceToken,
      (resolver) =>
        new DeviceService(() => resolver.resolve(databaseManagerToken)),
    );
  }
}

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  DevicesProvider,
];

export default serviceProviders;
