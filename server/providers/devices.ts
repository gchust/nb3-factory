import { randomUUID } from 'node:crypto';

import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
  RepositoryError,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export interface DeviceRecord {
  id: string;
  code: string;
  name: string;
  status: DeviceStatus;
  notes: string | null;
}

export interface DeviceCreateInput {
  code: string;
  name: string;
  status?: DeviceStatus;
  notes?: string | null;
}

export interface DeviceUpdateInput {
  code?: string;
  name?: string;
  status?: DeviceStatus;
  notes?: string | null;
}

export interface DeviceListOptions {
  status?: DeviceStatus;
  page?: number;
  pageSize?: number;
}

export interface DeviceListResult {
  rows: DeviceRecord[];
  total: number;
}

/** A code is the device's public identifier, so two devices may never share one. */
export class DuplicateDeviceCodeError extends Error {
  public readonly code: string;

  constructor(code: string) {
    super(`A device with code "${code}" already exists.`);
    this.name = 'DuplicateDeviceCodeError';
    this.code = code;
  }
}

type DeviceRepository = Repository<
  DeviceRecord,
  DeviceRecord,
  DeviceUpdateInput
>;

/**
 * Device ledger domain logic. Routes own HTTP concerns; this service owns what a device is and which writes are
 * allowed, so another entry point can reuse it without rebuilding the rules.
 */
export class DeviceService {
  constructor(private readonly database: DatabaseManager) {}

  private get devices(): DeviceRepository {
    return this.database.repository('devices');
  }

  public async list(
    options: DeviceListOptions = {},
  ): Promise<DeviceListResult> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const filter = options.status ? { status: options.status } : undefined;
    const devices = this.devices;

    const [rows, total] = await Promise.all([
      devices.findMany({
        ...(filter ? { filter } : {}),
        sort: (sort) => sort.field('code').asc(),
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      devices.count(filter ? { filter } : {}),
    ]);

    return { rows, total };
  }

  public async get(deviceId: string): Promise<DeviceRecord | undefined> {
    return this.devices.findOne({ filter: { id: deviceId } });
  }

  public async create(input: DeviceCreateInput): Promise<DeviceRecord> {
    await this.assertCodeAvailable(input.code);
    const id = randomUUID();

    try {
      const { record } = await this.devices.createOne({
        values: {
          id,
          code: input.code,
          name: input.name,
          status: input.status ?? 'available',
          notes: input.notes ?? null,
        },
      });
      return record;
    } catch (error) {
      // A concurrent create can pass the check above and then lose the unique constraint. The second read tells the
      // caller the same thing as the check, instead of exposing a driver-specific constraint error.
      if (await this.devices.exists({ filter: { code: input.code } })) {
        throw new DuplicateDeviceCodeError(input.code);
      }
      throw error;
    }
  }

  public async update(
    deviceId: string,
    input: DeviceUpdateInput,
  ): Promise<DeviceRecord | undefined> {
    const existing = await this.get(deviceId);
    if (!existing) {
      return undefined;
    }

    if (input.code !== undefined && input.code !== existing.code) {
      await this.assertCodeAvailable(input.code, deviceId);
    }

    const values = {
      ...(input.code === undefined ? {} : { code: input.code }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    };

    try {
      const { record } = await this.devices.updateOne({
        filter: { id: deviceId },
        values,
      });
      return record;
    } catch (error) {
      if (
        error instanceof RepositoryError &&
        error.code === 'RECORD_NOT_FOUND'
      ) {
        return undefined;
      }
      if (input.code !== undefined) {
        const codeOwner = await this.devices.findOne({
          filter: { code: input.code },
        });
        if (codeOwner && codeOwner.id !== deviceId) {
          throw new DuplicateDeviceCodeError(input.code);
        }
      }
      throw error;
    }
  }

  private async assertCodeAvailable(
    code: string,
    exceptDeviceId?: string,
  ): Promise<void> {
    const owner = await this.devices.findOne({ filter: { code } });
    if (owner && owner.id !== exceptDeviceId) {
      throw new DuplicateDeviceCodeError(code);
    }
  }
}

export const deviceServiceToken = createServiceToken<DeviceService>(
  'nb3-factory/devices',
);

export default class DevicesProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nb3-factory/devices';

  public override register(): void {
    this.app.container.singleton(deviceServiceToken, (container) => {
      return new DeviceService(container.resolve(databaseManagerToken));
    });
  }
}
