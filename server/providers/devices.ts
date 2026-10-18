import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type FilterNode,
  type RepositoryFilter,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** The device ledger's statuses, stored as canonical English values and translated by the interface. */
export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** One device, in the shape the API returns it. Ids are strings; the database stores integers. */
export interface DeviceView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
}

/** The fields a caller may set when creating a device. */
export interface CreateDeviceInput {
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
}

/** The fields a caller may change when editing a device; omitted fields keep their value. */
export type UpdateDeviceInput = Partial<CreateDeviceInput>;

export interface DeviceListQuery {
  /** Free text matched against the code and the name. */
  readonly q?: string;
  readonly status?: DeviceStatus;
  /** From 1. */
  readonly page: number;
  /** At most {@link MAX_PAGE_SIZE}. */
  readonly pageSize: number;
}

export interface DeviceList {
  readonly data: readonly DeviceView[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    /** How many devices match on all pages. */
    readonly total: number;
  };
}

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/** The code a device would use is already taken by another device. */
export class DeviceCodeTakenError extends Error {
  public readonly code = 'DEVICE_CODE_TAKEN';

  constructor(readonly deviceCode: string) {
    super(`A device with code "${deviceCode}" already exists`);
    this.name = 'DeviceCodeTakenError';
  }
}

/** No device exists with the given id. */
export class DeviceNotFoundError extends Error {
  public readonly code = 'DEVICE_NOT_FOUND';

  constructor(readonly deviceId: string) {
    super(`No device has id "${deviceId}"`);
    this.name = 'DeviceNotFoundError';
  }
}

export interface DeviceService {
  list(query: DeviceListQuery): Promise<DeviceList>;
  get(deviceId: string): Promise<DeviceView>;
  create(input: CreateDeviceInput): Promise<DeviceView>;
  update(deviceId: string, input: UpdateDeviceInput): Promise<DeviceView>;
}

export const deviceServiceToken: ServiceToken<DeviceService> =
  createServiceToken<DeviceService>('app/device-service');

/** The row shape of the `devices` table (see `database/main/migrations/202610070001_create_devices.ts`). */
export interface DeviceRecord {
  id: number;
  code: string;
  name: string;
  status: string;
}

function toDevice(record: DeviceRecord): DeviceView {
  return {
    id: String(record.id),
    code: record.code,
    name: record.name,
    status: record.status as DeviceStatus,
  };
}

function parseDeviceId(deviceId: string): number | undefined {
  const parsed = Number(deviceId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** Builds the service around a database manager; kept separate so a test can build it directly. */
export function createDeviceService(database: DatabaseManager): DeviceService {
  const devices = database.repository<DeviceRecord>('devices');

  /** `q` matches code or name; `status` narrows to one status; the two combine with AND. */
  function where(
    query: DeviceListQuery,
  ): RepositoryFilter<DeviceRecord> | undefined {
    const term = query.q?.trim();
    if (!term && !query.status) {
      return undefined;
    }
    return (f) => {
      const conditions: FilterNode[] = [];
      if (term) {
        conditions.push(
          f.or([
            f.string('code').includes(term, { mode: 'insensitive' }),
            f.string('name').includes(term, { mode: 'insensitive' }),
          ]),
        );
      }
      if (query.status) {
        conditions.push(f.string('status').eq(query.status));
      }
      return conditions.length === 1 ? conditions[0] : f.and(conditions);
    };
  }

  return {
    async list(query) {
      const filter = where(query);
      const [records, total] = await Promise.all([
        devices.findMany({
          filter,
          sort: (s) => s.field('code').asc(),
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
        }),
        devices.count({ filter }),
      ]);

      return {
        data: records.map((record) => toDevice(record)),
        meta: { page: query.page, pageSize: query.pageSize, total },
      };
    },

    async get(deviceId) {
      const id = parseDeviceId(deviceId);
      const record =
        id === undefined
          ? undefined
          : await devices.findOne({ filter: { id } });
      if (!record) {
        throw new DeviceNotFoundError(deviceId);
      }
      return toDevice(record);
    },

    async create(input) {
      if (await devices.exists({ filter: { code: input.code } })) {
        throw new DeviceCodeTakenError(input.code);
      }

      try {
        const { record } = await devices.createOne({
          values: {
            code: input.code,
            name: input.name,
            status: input.status,
          },
        });
        return toDevice(record);
      } catch (error) {
        // The unique constraint is the backstop for a race between the check above and this insert: report the
        // same domain error instead of leaking the database's constraint error.
        if (await devices.exists({ filter: { code: input.code } })) {
          throw new DeviceCodeTakenError(input.code);
        }
        throw error;
      }
    },

    async update(deviceId, input) {
      const id = parseDeviceId(deviceId);
      const existing =
        id === undefined
          ? undefined
          : await devices.findOne({ filter: { id } });
      if (!existing) {
        throw new DeviceNotFoundError(deviceId);
      }

      if (input.code !== undefined && input.code !== existing.code) {
        const nextCode = input.code;
        const taken = await devices.exists({
          filter: (f) =>
            f.and([
              f.string('code').eq(nextCode),
              f.number('id').ne(existing.id),
            ]),
        });
        if (taken) {
          throw new DeviceCodeTakenError(nextCode);
        }
      }

      const values: Partial<Pick<DeviceRecord, 'code' | 'name' | 'status'>> =
        {};
      if (input.code !== undefined) {
        values.code = input.code;
      }
      if (input.name !== undefined) {
        values.name = input.name;
      }
      if (input.status !== undefined) {
        values.status = input.status;
      }

      if (Object.keys(values).length === 0) {
        return toDevice(existing);
      }

      try {
        const { record } = await devices.updateOne({
          filter: { id: existing.id },
          values,
        });
        return toDevice(record);
      } catch (error) {
        if (
          input.code !== undefined &&
          (await devices.exists({ filter: { code: input.code } }))
        ) {
          throw new DeviceCodeTakenError(input.code);
        }
        throw error;
      }
    },
  };
}

export default class DeviceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/device-provider';

  public override register(): void {
    this.app.container.singleton(deviceServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createDeviceService(database);
    });
  }
}
