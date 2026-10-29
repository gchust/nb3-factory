import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';
import { randomUUID } from 'node:crypto';

export type DeviceStatus = 'available' | 'borrowed';

export interface DeviceView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateDeviceInput {
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
}

export interface UpdateDeviceInput {
  readonly code?: string;
  readonly name?: string;
  readonly status?: DeviceStatus;
}

export interface DeviceService {
  list(input?: { readonly status?: DeviceStatus }): Promise<DeviceView[]>;
  create(input: CreateDeviceInput): Promise<DeviceView>;
  update(deviceId: string, input: UpdateDeviceInput): Promise<DeviceView>;
}

/** The requested code already belongs to another device. */
export class DeviceCodeTakenError extends Error {
  constructor() {
    super('A device with this code already exists.');
    this.name = 'DeviceCodeTakenError';
  }
}

/** The device id does not resolve to a ledger row. */
export class DeviceNotFoundError extends Error {
  constructor() {
    super('The device was not found.');
    this.name = 'DeviceNotFoundError';
  }
}

export const deviceServiceToken: ServiceToken<DeviceService> =
  createServiceToken<DeviceService>('app/device-service');

interface DeviceRow {
  id: string;
  code: string;
  name: string;
  status: DeviceStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toView(row: DeviceRow): DeviceView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

/**
 * Mirrors the database drivers' unique-constraint signals. The Repository exposes no duplicate-code error of its own,
 * so the service checks the business key first and keeps this as the race-safe fallback.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  const visited = new Set<object>();
  let current: unknown = error;

  while (
    typeof current === 'object' &&
    current !== null &&
    !visited.has(current)
  ) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    const code = record.code;
    const number = record.errno ?? record.number ?? record.errorNum;
    if (
      record.errCode === -6602 ||
      code === '23505' ||
      code === 'ER_DUP_ENTRY' ||
      code === 'SQLITE_CONSTRAINT' ||
      code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
      number === 1 ||
      number === 1062 ||
      number === 2601 ||
      number === 2627
    ) {
      return true;
    }
    current = record.cause ?? record.originalError;
  }

  return false;
}

function createDeviceService(database: DatabaseManager): DeviceService {
  const devices = database.repository<DeviceRow>('devices');

  async function codeIsTaken(
    code: string,
    exceptId?: string,
  ): Promise<boolean> {
    if (exceptId === undefined) {
      return devices.exists({ filter: { code } });
    }
    return devices.exists({
      filter: (filter) =>
        filter.and([
          filter.string('code').eq(code),
          filter.string('id').ne(exceptId),
        ]),
    });
  }

  return {
    async list(input = {}) {
      const rows = await devices.findMany({
        ...(input.status === undefined
          ? {}
          : { filter: { status: input.status } }),
        sort: (sort) => sort.field('code').asc(),
      });
      return rows.map(toView);
    },

    async create(input) {
      if (await codeIsTaken(input.code)) {
        throw new DeviceCodeTakenError();
      }

      const now = new Date();
      try {
        const result = await devices.createOne({
          values: {
            id: randomUUID(),
            code: input.code,
            name: input.name,
            status: input.status,
            createdAt: now,
            updatedAt: now,
          },
        });
        return toView(result.record);
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw new DeviceCodeTakenError();
        }
        throw error;
      }
    },

    async update(deviceId, input) {
      const current = await devices.findOne({ filter: { id: deviceId } });
      if (!current) {
        throw new DeviceNotFoundError();
      }

      if (
        input.code !== undefined &&
        (await codeIsTaken(input.code, deviceId))
      ) {
        throw new DeviceCodeTakenError();
      }

      const values = {
        ...(input.code === undefined ? {} : { code: input.code }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.status === undefined ? {} : { status: input.status }),
        updatedAt: new Date(),
      };

      try {
        const result = await devices.updateOne({
          filter: { id: deviceId },
          values,
        });
        return toView(result.record);
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw new DeviceCodeTakenError();
        }
        if (
          error instanceof Error &&
          'code' in error &&
          (error as { code?: unknown }).code === 'RECORD_NOT_FOUND'
        ) {
          throw new DeviceNotFoundError();
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
