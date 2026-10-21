import { randomUUID } from 'node:crypto';

import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export interface Device {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
}

interface DeviceRecord {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface ListDevicesInput {
  readonly status?: DeviceStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface DeviceList {
  readonly rows: readonly Device[];
  readonly total: number;
}

export interface CreateDeviceInput {
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
}

export type UpdateDeviceInput = Partial<CreateDeviceInput>;

/** The requested code belongs to another device. The route turns this into a conflict response. */
export class DeviceCodeTakenError extends Error {
  public override readonly name = 'DeviceCodeTakenError';
}

/** The device does not exist. The route turns this into a not-found response. */
export class DeviceNotFoundError extends Error {
  public override readonly name = 'DeviceNotFoundError';
}

export interface DeviceService {
  list(input: ListDevicesInput): Promise<DeviceList>;
  get(id: string): Promise<Device | undefined>;
  create(input: CreateDeviceInput): Promise<Device>;
  update(id: string, input: UpdateDeviceInput): Promise<Device>;
}

export const deviceServiceToken: ServiceToken<DeviceService> =
  createServiceToken<DeviceService>('app/device-service');

function toDevice(record: DeviceRecord): Device {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    status: record.status as DeviceStatus,
  };
}

export function createDeviceService(database: DatabaseManager): DeviceService {
  const devices = database.repository<DeviceRecord>('devices');

  async function codeExists(code: string, exceptId?: string) {
    const record = await devices.findOne({ filter: { code } });
    return Boolean(record && record.id !== exceptId);
  }

  return {
    async list({ status, page, pageSize }) {
      const filter = status ? { status } : undefined;
      const [total, records] = await Promise.all([
        devices.count({ filter }),
        devices.findMany({
          filter,
          sort: (sort) => sort.field('code').asc(),
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
      ]);

      return { rows: records.map(toDevice), total };
    },

    async get(id) {
      const record = await devices.findOne({ filter: { id } });
      return record ? toDevice(record) : undefined;
    },

    async create(input) {
      if (await codeExists(input.code)) {
        throw new DeviceCodeTakenError();
      }

      try {
        const { record } = await devices.createOne({
          values: { id: randomUUID(), ...input },
        });
        return toDevice(record);
      } catch (error) {
        // A concurrent request may have taken the code between the check and
        // the insert; report it as the same conflict.
        if (await codeExists(input.code)) {
          throw new DeviceCodeTakenError();
        }
        throw error;
      }
    },

    async update(id, input) {
      const existing = await devices.findOne({ filter: { id } });
      if (!existing) {
        throw new DeviceNotFoundError();
      }

      if (input.code && (await codeExists(input.code, id))) {
        throw new DeviceCodeTakenError();
      }

      try {
        const { record } = await devices.updateOne({
          filter: { id },
          values: input,
        });
        return toDevice(record);
      } catch (error) {
        if (input.code && (await codeExists(input.code, id))) {
          throw new DeviceCodeTakenError();
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
