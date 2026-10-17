import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** One device as the API returns it: ids are strings and times are RFC 3339 strings. */
export interface DeviceView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
}

export interface ListDevicesInput {
  readonly status?: DeviceStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface DevicePage {
  readonly rows: readonly DeviceView[];
  readonly total: number;
}

export interface CreateDeviceInput {
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly notes?: string | null;
}

export type UpdateDeviceInput = Partial<CreateDeviceInput>;

export type DeviceErrorCode = 'DEVICE_NOT_FOUND' | 'DEVICE_CODE_TAKEN';

/** A domain failure the route turns into an `ApiError`; the service never decides an HTTP status itself. */
export class DeviceError extends Error {
  public constructor(
    public readonly code: DeviceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DeviceError';
  }
}

export interface DeviceService {
  list(input: ListDevicesInput): Promise<DevicePage>;
  get(deviceId: string): Promise<DeviceView>;
  create(input: CreateDeviceInput): Promise<DeviceView>;
  update(deviceId: string, input: UpdateDeviceInput): Promise<DeviceView>;
}

export const deviceServiceToken: ServiceToken<DeviceService> =
  createServiceToken<DeviceService>('app/devices-service');

interface DeviceRow {
  readonly id: number | string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly notes: string | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string | null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toView(row: DeviceRow): DeviceView {
  return {
    id: String(row.id),
    code: row.code,
    name: row.name,
    status: row.status as DeviceStatus,
    notes: row.notes ?? null,
    createdAt: toIsoString(row.createdAt),
    updatedAt: row.updatedAt ? toIsoString(row.updatedAt) : null,
  };
}

/** The database key for an id the URL carries; a non-numeric id names no record this table can hold. */
function toRowId(deviceId: string): number | undefined {
  if (!/^\d+$/.test(deviceId)) return undefined;
  const id = Number(deviceId);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function notFound(deviceId: string): DeviceError {
  return new DeviceError(
    'DEVICE_NOT_FOUND',
    `Device ${deviceId} does not exist.`,
  );
}

function codeTaken(code: string): DeviceError {
  return new DeviceError(
    'DEVICE_CODE_TAKEN',
    `A device with code ${code} already exists.`,
  );
}

function normalizeNotes(notes: string | null | undefined): string | null {
  if (notes === undefined || notes === null) return null;
  const trimmed = notes.trim();
  return trimmed === '' ? null : trimmed;
}

function createDeviceService(database: DatabaseManager): DeviceService {
  return {
    async list({ status, page, pageSize }) {
      const repository = database.repository('devices');
      // An empty filter is invalid: a list without a status filter reads every device.
      const filter = status ? { status } : undefined;
      const [rows, total] = await Promise.all([
        repository.findMany({
          ...(filter ? { filter } : {}),
          sort: (sort) => sort.field('code').asc(),
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }) as unknown as Promise<DeviceRow[]>,
        repository.count(filter ? { filter } : {}),
      ]);

      return { rows: rows.map(toView), total };
    },

    async get(deviceId) {
      const id = toRowId(deviceId);
      if (id === undefined) throw notFound(deviceId);

      const row = (await database.repository('devices').findOne({
        filter: { id },
      })) as unknown as DeviceRow | undefined;
      if (!row) throw notFound(deviceId);

      return toView(row);
    },

    async create(input) {
      const repository = database.repository('devices');
      if (await repository.exists({ filter: { code: input.code } })) {
        throw codeTaken(input.code);
      }

      const { record } = await repository.createOne({
        values: {
          code: input.code,
          name: input.name,
          status: input.status,
          notes: normalizeNotes(input.notes),
          createdAt: new Date(),
          updatedAt: null,
        },
      });

      return toView(record as unknown as DeviceRow);
    },

    async update(deviceId, input) {
      const id = toRowId(deviceId);
      if (id === undefined) throw notFound(deviceId);

      const repository = database.repository('devices');
      const existing = (await repository.findOne({
        filter: { id },
      })) as unknown as DeviceRow | undefined;
      if (!existing) throw notFound(deviceId);

      if (input.code !== undefined && input.code !== existing.code) {
        const conflict = (await repository.findOne({
          filter: { code: input.code },
        })) as unknown as DeviceRow | undefined;
        if (conflict && String(conflict.id) !== String(id)) {
          throw codeTaken(input.code);
        }
      }

      const values = {
        updatedAt: new Date(),
        ...(input.code === undefined ? {} : { code: input.code }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.notes === undefined
          ? {}
          : { notes: normalizeNotes(input.notes) }),
      };
      const { record } = await repository.updateOne({
        filter: { id },
        values,
      });

      return toView(record as unknown as DeviceRow);
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
