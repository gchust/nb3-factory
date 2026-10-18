import { type DatabaseManager, type RepositoryRecord } from '@nocobase/db';
import { createServiceToken } from '@nocobase/service-provider';

// The token name is an application-local key, not a package name: `create-app` rewrites the
// template's package name only in `client/runtime.ts` and `client/service-provider.ts`, so
// embedding it here would ship the template's identity into every generated application.
export const equipmentServiceToken = createServiceToken<EquipmentService>(
  'app/equipment-service',
);

export const EQUIPMENT_STATUSES = ['available', 'borrowed'] as const;

export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

/** What a client reads. The id is a string so route parameters and JSON stay one shape. */
export interface EquipmentView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: EquipmentStatus;
  readonly notes: string | null;
}

export interface EquipmentListInput {
  readonly status?: EquipmentStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface EquipmentListResult {
  readonly rows: readonly EquipmentView[];
  readonly total: number;
}

export interface EquipmentCreateInput {
  readonly code: string;
  readonly name: string;
  readonly status: EquipmentStatus;
  readonly notes?: string | null;
}

export type EquipmentUpdateInput = Partial<EquipmentCreateInput>;

export interface EquipmentService {
  list(input: EquipmentListInput): Promise<EquipmentListResult>;
  get(id: number): Promise<EquipmentView>;
  create(input: EquipmentCreateInput): Promise<EquipmentView>;
  update(id: number, input: EquipmentUpdateInput): Promise<EquipmentView>;
}

/** The code is already used by another device; the route answers 409 with this reason. */
export class EquipmentCodeTakenError extends Error {
  constructor() {
    super('An equipment record already uses this code.');
    this.name = 'EquipmentCodeTakenError';
  }
}

/** No equipment record has this id; the route answers 404. */
export class EquipmentNotFoundError extends Error {
  constructor() {
    super('The equipment record was not found.');
    this.name = 'EquipmentNotFoundError';
  }
}

type EquipmentRecord = RepositoryRecord & {
  readonly id: number | string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly notes: string | null;
};

type EquipmentCreateValues = {
  code: string;
  name: string;
  status: EquipmentStatus;
  notes: string | null;
};

type EquipmentUpdateValues = Partial<EquipmentCreateValues>;

function cleanNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim();
  return trimmed ? trimmed : null;
}

function toView(record: EquipmentRecord): EquipmentView {
  return {
    id: String(record.id),
    code: record.code,
    name: record.name,
    status: record.status as EquipmentStatus,
    notes: record.notes ?? null,
  };
}

/**
 * The ledger's data access. Queries stay here rather than in the route so a second caller (a command,
 * a scheduled task) reuses the same duplicate-code rule and the same view shape.
 */
export function createEquipmentService(
  database: DatabaseManager,
): EquipmentService {
  const repository = database.repository<
    EquipmentRecord,
    EquipmentCreateValues,
    EquipmentUpdateValues
  >('equipment');

  async function requireOne(id: number): Promise<EquipmentRecord> {
    const record = await repository.findOne({ filter: { id } });
    if (!record) throw new EquipmentNotFoundError();
    return record;
  }

  async function requireCodeAvailable(
    code: string,
    exceptId?: number,
  ): Promise<void> {
    const existing = await repository.findOne({ filter: { code } });
    if (
      existing &&
      (exceptId === undefined || String(existing.id) !== String(exceptId))
    ) {
      throw new EquipmentCodeTakenError();
    }
  }

  return {
    async list(input) {
      const filter = input.status ? { status: input.status } : undefined;
      const [records, total] = await Promise.all([
        repository.findMany({
          filter,
          sort: (sort) => sort.field('code').asc(),
          limit: input.pageSize,
          offset: (input.page - 1) * input.pageSize,
        }),
        repository.count({ filter }),
      ]);
      return { rows: records.map(toView), total };
    },

    async get(id) {
      return toView(await requireOne(id));
    },

    async create(input) {
      const code = input.code.trim();
      await requireCodeAvailable(code);
      const { record } = await repository.createOne({
        values: {
          code,
          name: input.name.trim(),
          status: input.status,
          notes: cleanNotes(input.notes),
        },
      });
      return toView(record);
    },

    async update(id, input) {
      const existing = await requireOne(id);
      const values: EquipmentUpdateValues = {};

      if (input.code !== undefined) {
        const code = input.code.trim();
        await requireCodeAvailable(code, id);
        values.code = code;
      }
      if (input.name !== undefined) values.name = input.name.trim();
      if (input.status !== undefined) values.status = input.status;
      if (input.notes !== undefined) values.notes = cleanNotes(input.notes);

      if (Object.keys(values).length === 0) return toView(existing);

      const { record } = await repository.updateOne({
        filter: { id },
        values,
      });
      return toView(record);
    },
  };
}
