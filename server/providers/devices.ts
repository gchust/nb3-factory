import type { Application } from '@nocobase/app-server/application';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import {
  databaseManagerToken,
  RepositoryError,
  type DatabaseManager,
  type FilterBuilder,
  type FilterNode,
  type Repository,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** The device statuses the application understands. They are stored as-is and translated for display. */
export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** The fields of a device the application returns. */
export interface Device {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly notes: string | null;
}

export interface ListDevicesInput {
  readonly status?: DeviceStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface CreateDeviceInput {
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly notes?: string | null;
}

export interface UpdateDeviceInput {
  readonly code?: string;
  readonly name?: string;
  readonly status?: DeviceStatus;
  readonly notes?: string | null;
}

/** A failure the caller can repair, named so a route can answer it without knowing how the service works. */
export class DeviceError extends Error {
  constructor(
    readonly code: 'DEVICE_CODE_TAKEN' | 'DEVICE_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'DeviceError';
  }
}

export interface DevicesService {
  list(input: ListDevicesInput): Promise<{
    readonly rows: readonly Device[];
    readonly total: number;
  }>;
  create(input: CreateDeviceInput): Promise<Device>;
  update(id: string, input: UpdateDeviceInput): Promise<Device>;
}

export const devicesServiceToken: ServiceToken<DevicesService> =
  createServiceToken<DevicesService>('app/devices-service');

interface DeviceRow {
  id: string;
  code: string;
  name: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The device ledger's domain logic: the shape a status may take, the uniqueness of a code and the mapping between a
 * stored row and the record the API returns.
 *
 * It holds no Hono context and no HTTP status, so the same service serves a route, a test and a future import.
 */
export function createDevicesService(
  database: DatabaseManager,
  idGenerator: { generateString(): string },
): DevicesService {
  const repository = (): Repository<DeviceRow> =>
    database.repository<DeviceRow>('devices');

  const toDevice = (row: DeviceRow): Device => ({
    id: row.id,
    code: row.code,
    name: row.name,
    status: toStatus(row.status),
    notes: row.notes ?? null,
  });

  const codeTaken = (code: string): DeviceError =>
    new DeviceError(
      'DEVICE_CODE_TAKEN',
      `A device with the code ${code} already exists.`,
    );

  const assertCodeIsFree = async (code: string, exceptId?: string) => {
    const existing = await repository().findOne({ filter: { code } });
    if (existing && existing.id !== exceptId) throw codeTaken(code);
  };

  return {
    async list({ status, page, pageSize }) {
      const filter = (builder: FilterBuilder<DeviceRow>) =>
        deviceFilter(builder, status);
      const [rows, total] = await Promise.all([
        repository().findMany({
          filter,
          sort: (sort) => sort.field('code').asc(),
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        repository().count({ filter }),
      ]);
      return { rows: rows.map(toDevice), total };
    },

    async create(input) {
      await assertCodeIsFree(input.code);
      const now = new Date();
      const { record } = await repository().createOne({
        values: {
          id: idGenerator.generateString(),
          code: input.code,
          name: input.name,
          status: input.status,
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
      return toDevice(record);
    },

    async update(id, input) {
      if (input.code !== undefined) await assertCodeIsFree(input.code, id);
      const values: Partial<Omit<DeviceRow, 'id'>> = {
        updatedAt: new Date(),
      };
      if (input.code !== undefined) values.code = input.code;
      if (input.name !== undefined) values.name = input.name;
      if (input.status !== undefined) values.status = input.status;
      if (input.notes !== undefined) values.notes = input.notes;
      try {
        const { record } = await repository().updateOne({
          filter: { id },
          values,
        });
        return toDevice(record);
      } catch (error) {
        if (
          error instanceof RepositoryError &&
          error.code === 'RECORD_NOT_FOUND'
        )
          throw new DeviceError(
            'DEVICE_NOT_FOUND',
            `The device ${id} was not found.`,
          );
        throw error;
      }
    },
  };
}

/** The status filter shared by the page and the total, so the count always matches the rows. */
function deviceFilter(
  filter: FilterBuilder<DeviceRow>,
  status?: DeviceStatus,
): FilterNode {
  return status ? filter.string('status').eq(status) : filter.and([]);
}

function toStatus(value: string): DeviceStatus {
  return value === 'borrowed' ? 'borrowed' : 'available';
}

export default class DevicesProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/devices-provider';

  public override register(): void {
    this.app.container.singleton(devicesServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const idGenerator = this.app.container.resolve(idGeneratorToken);
      return createDevicesService(database, idGenerator);
    });
  }
}
