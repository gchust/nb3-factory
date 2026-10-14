import { randomUUID } from 'node:crypto';

import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

/** The two states a device can be in. Stored as a code, translated for display, never stored translated. */
export type DeviceStatus = 'available' | 'borrowed';

/** A device as the API returns it: string id, ISO timestamps, `remark` null when it was not given. */
export interface Device {
  readonly id: string;
  readonly reference: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly remark: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DeviceListQuery {
  readonly status?: DeviceStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface DeviceListResult {
  readonly data: readonly Device[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface DeviceCreateInput {
  readonly reference: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly remark: string | null;
}

export interface DeviceUpdateInput {
  readonly reference?: string;
  readonly name?: string;
  readonly status?: DeviceStatus;
  readonly remark?: string | null;
}

/** The device ledger's domain operations. It never reads an HTTP context or decides a response status. */
export interface DeviceService {
  list(query: DeviceListQuery): Promise<DeviceListResult>;
  findById(id: string): Promise<Device | undefined>;
  referenceExists(reference: string, exceptId?: string): Promise<boolean>;
  create(input: DeviceCreateInput): Promise<Device>;
  update(id: string, input: DeviceUpdateInput): Promise<Device | undefined>;
}

/** One row of the `devices` Collection. `status` is a string at the database layer; `toDevice` narrows it. */
interface DeviceRecord {
  readonly id: string;
  readonly reference: string;
  readonly name: string;
  readonly status: string;
  readonly remark: string | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}

export const deviceServiceToken = createServiceToken<DeviceService>(
  'app/devices-service',
);

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toDeviceStatus(value: string): DeviceStatus {
  return value === 'borrowed' ? 'borrowed' : 'available';
}

function toDevice(record: DeviceRecord): Device {
  return {
    id: record.id,
    reference: record.reference,
    name: record.name,
    status: toDeviceStatus(record.status),
    remark: record.remark ?? null,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
  };
}

export function createDeviceService(database: DatabaseManager): DeviceService {
  const devices: Repository<DeviceRecord> =
    database.repository<DeviceRecord>('devices');

  return {
    async list({ status, page, pageSize }) {
      const filter = status ? { status } : undefined;
      const [rows, total] = await Promise.all([
        devices.findMany({
          filter,
          sort: (sort) => sort.field('reference').asc(),
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        devices.count({ filter }),
      ]);

      return { data: rows.map(toDevice), page, pageSize, total };
    },

    async findById(id) {
      const record = await devices.findOne({ filter: { id } });
      return record ? toDevice(record) : undefined;
    },

    async referenceExists(reference, exceptId) {
      const record = await devices.findOne({ filter: { reference } });
      return record !== undefined && record.id !== exceptId;
    },

    async create(input) {
      const now = new Date();
      const result = await devices.createOne({
        values: {
          id: randomUUID(),
          reference: input.reference,
          name: input.name,
          status: input.status,
          remark: input.remark,
          createdAt: now,
          updatedAt: now,
        },
      });

      return toDevice(result.record);
    },

    async update(id, input) {
      const existing = await devices.findOne({ filter: { id } });
      if (!existing) return undefined;

      const values: {
        updatedAt: Date;
        reference?: string;
        name?: string;
        status?: string;
        remark?: string | null;
      } = { updatedAt: new Date() };
      if (input.reference !== undefined) values.reference = input.reference;
      if (input.name !== undefined) values.name = input.name;
      if (input.status !== undefined) values.status = input.status;
      if (input.remark !== undefined) values.remark = input.remark;

      const result = await devices.updateOne({ filter: { id }, values });
      return toDevice(result.record);
    },
  };
}

export class DevicesProvider extends ServiceProvider<Application> {
  readonly name = 'app/devices-provider';

  register(): void {
    this.app.container.singleton(deviceServiceToken, (resolver) => {
      const database: DatabaseManager = resolver.resolve(databaseManagerToken);
      return createDeviceService(database);
    });
  }
}
