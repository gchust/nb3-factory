import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

/** The statuses the ledger understands. Adding one means a locale entry, not a migration. */
export const EQUIPMENT_STATUSES = ['available', 'borrowed'] as const;

export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export function isEquipmentStatus(value: string): value is EquipmentStatus {
  return (EQUIPMENT_STATUSES as readonly string[]).includes(value);
}

/** One stored row, in Collection terms. `id` is the auto-increment integer; `status` is stored as text. */
export interface EquipmentRecord {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly notes: string | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}

/** One row as the API returns it: ids and times are strings, matching the HTTP contract. */
export interface EquipmentView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: EquipmentStatus;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The fields a create or update carries. `notes` is user-entered text and is never translated. */
export interface EquipmentInput {
  readonly code: string;
  readonly name: string;
  readonly status: EquipmentStatus;
  readonly notes: string | null;
}

export interface EquipmentListQuery {
  readonly status?: EquipmentStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface EquipmentList {
  readonly rows: EquipmentView[];
  readonly total: number;
}

/** The ledger number is already used by another device. */
export class EquipmentCodeTakenError extends Error {
  constructor(readonly code: string) {
    super(`Equipment code ${code} is already in use.`);
    this.name = 'EquipmentCodeTakenError';
  }
}

/** The device named by the URL does not exist. */
export class EquipmentNotFoundError extends Error {
  constructor(readonly equipmentId: string) {
    super(`Equipment ${equipmentId} was not found.`);
    this.name = 'EquipmentNotFoundError';
  }
}

export interface EquipmentService {
  list(query: EquipmentListQuery): Promise<EquipmentList>;
  get(id: number): Promise<EquipmentView>;
  create(input: EquipmentInput): Promise<EquipmentView>;
  update(id: number, input: EquipmentInput): Promise<EquipmentView>;
}

export const equipmentServiceToken =
  createServiceToken<EquipmentService>('app/equipment');

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}

function toView(record: EquipmentRecord): EquipmentView {
  return {
    id: String(record.id),
    code: record.code,
    name: record.name,
    status: isEquipmentStatus(record.status) ? record.status : 'available',
    notes: record.notes,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
  };
}

/**
 * The ledger's domain logic. It reads and writes through the Repository service and throws domain errors — never
 * HTTP concerns — so the route decides the status and reason each one maps to.
 */
class DefaultEquipmentService implements EquipmentService {
  constructor(private readonly database: DatabaseManager) {}

  private repository() {
    return this.database.repository<EquipmentRecord>('equipment');
  }

  async list({
    status,
    page,
    pageSize,
  }: EquipmentListQuery): Promise<EquipmentList> {
    const repository = this.repository();
    const filter = status === undefined ? undefined : { status };
    // Newest first, with the id as a stable tie-break so two rows written in the same millisecond keep one order.
    const [records, total] = await Promise.all([
      repository.findMany({
        filter,
        sort: (sort) => [
          sort.field('updatedAt').desc(),
          sort.field('id').desc(),
        ],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      repository.count({ filter }),
    ]);
    return { rows: records.map(toView), total };
  }

  async get(id: number): Promise<EquipmentView> {
    const record = await this.repository().findOne({ filter: { id } });
    if (!record) throw new EquipmentNotFoundError(String(id));
    return toView(record);
  }

  async create(input: EquipmentInput): Promise<EquipmentView> {
    const repository = this.repository();
    // The column is unique too; this pre-check turns the duplicate into the reason the client branches on.
    if (await repository.exists({ filter: { code: input.code } })) {
      throw new EquipmentCodeTakenError(input.code);
    }
    const now = new Date();
    const { record } = await repository.createOne({
      values: {
        code: input.code,
        name: input.name,
        status: input.status,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      },
    });
    return toView(record);
  }

  async update(id: number, input: EquipmentInput): Promise<EquipmentView> {
    const repository = this.repository();
    if (!(await repository.exists({ filter: { id } }))) {
      throw new EquipmentNotFoundError(String(id));
    }
    // Another device may hold the code; the row being edited may keep its own.
    const takenByAnother = await repository.exists({
      filter: (filter) =>
        filter.and([
          filter.string('code').eq(input.code),
          filter.number('id').ne(id),
        ]),
    });
    if (takenByAnother) throw new EquipmentCodeTakenError(input.code);
    const { record } = await repository.updateOne({
      filter: { id },
      values: {
        code: input.code,
        name: input.name,
        status: input.status,
        notes: input.notes,
        updatedAt: new Date(),
      },
    });
    return toView(record);
  }
}

export class EquipmentProvider extends ServiceProvider<Application> {
  public readonly name = 'app/equipment-provider';

  public override register(): void {
    this.app.container.singleton(equipmentServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return new DefaultEquipmentService(database);
    });
  }
}
