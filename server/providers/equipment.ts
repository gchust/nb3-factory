import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Expression,
  type ExpressionBuilder,
  type Row,
  type SqlBool,
} from '@nocobase/db';
import type {
  DatabaseAuthorizationConditions,
  DatabaseFilter,
} from '@nocobase/app-plugin-authorization/server';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

// `create-app` rewrites this literal to the generated application's own package name. Keeping it alone on one short
// line means the rewrite cannot change how Prettier wraps the statements that use it: a shorter name would otherwise
// let a wrapped call collapse onto one line, leaving the generated project failing its own `pnpm format:check`.
const APP_PACKAGE_NAME = '@nocobase/app-template-default';

export const EQUIPMENT_STATUSES = [
  'available',
  'borrowed',
  'repairing',
] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export interface EquipmentRow {
  id: number;
  name: string;
  assetNumber: string;
  category: string;
  status: EquipmentStatus;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentCreateInput {
  name: string;
  assetNumber: string;
  category: string;
  description?: string | null;
}

export interface EquipmentUpdateInput {
  name?: string;
  assetNumber?: string;
  category?: string;
  status?: 'available' | 'repairing';
  description?: string | null;
}

export interface BorrowRecordRow {
  id: number;
  equipmentId: number;
  borrowerId: string;
  borrowerName: string;
  borrowedAt: string;
  returnedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BorrowerIdentity {
  id: string;
  name: string;
}

export interface BorrowCreateInput {
  equipmentId: number;
  note?: string | null;
}

export interface BorrowReturnInput {
  note?: string | null;
}

export type BorrowReturnOutcome =
  | { status: 'returned'; record: BorrowRecordRow }
  | { status: 'not-found' }
  | { status: 'already-returned' }
  | { status: 'not-borrowed'; equipmentStatus: EquipmentStatus };

export type EquipmentDeleteOutcome =
  { status: 'deleted' } | { status: 'not-found' } | { status: 'has-records' };

export type BorrowCreateResult =
  | { status: 'created'; record: BorrowRecordRow }
  | { status: 'equipment-not-found' }
  | { status: 'unavailable'; equipmentStatus: EquipmentStatus };

export interface EquipmentService {
  listEquipment(
    conditions: DatabaseAuthorizationConditions,
  ): Promise<EquipmentRow[]>;
  getEquipment(id: number): Promise<EquipmentRow | undefined>;
  createEquipment(
    input: EquipmentCreateInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<EquipmentRow>;
  updateEquipment(
    id: number,
    input: EquipmentUpdateInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<EquipmentRow | 'not-found'>;
  deleteEquipment(id: number): Promise<EquipmentDeleteOutcome>;
  listBorrowRecords(
    conditions: DatabaseAuthorizationConditions,
  ): Promise<BorrowRecordRow[]>;
  createBorrowRecord(
    input: BorrowCreateInput,
    borrower: BorrowerIdentity,
    conditions: DatabaseAuthorizationConditions,
    now?: Date,
  ): Promise<BorrowCreateResult>;
  returnBorrowRecord(
    id: number,
    input: BorrowReturnInput,
    conditions: DatabaseAuthorizationConditions,
    now?: Date,
  ): Promise<BorrowReturnOutcome>;
  countByStatus(): Promise<Record<EquipmentStatus, number>>;
}

export const equipmentServiceToken: ServiceToken<EquipmentService> =
  createServiceToken<EquipmentService>(`${APP_PACKAGE_NAME}/equipment-service`);

/** A compiled filter: a function building a boolean expression for WHERE. */
type FilterFactory = (eb: ExpressionBuilder) => Expression<SqlBool>;

/**
 * Translates an authorization Database Filter AST into the query builder's
 * expression language, or returns undefined when the filter is empty
 * (a full-access `allRecords` filter). The authorization plugin always emits
 * logical roots (`$and` / `$or`) with field operators beneath them, so this
 * adapter only needs to cover those shapes.
 */
export function compileEquipmentFilter(
  filter: DatabaseFilter,
): FilterFactory | undefined {
  return compileFilterNode(filter);
}

function compileFilterNode(node: DatabaseFilter): FilterFactory | undefined {
  const entries = Object.entries(node);
  if (entries.length === 0) {
    return undefined;
  }

  const parts: FilterFactory[] = [];
  for (const [key, value] of entries) {
    if (key === '$and' || key === '$or') {
      if (!Array.isArray(value)) {
        continue;
      }
      const compiled = value
        .map((item) => compileFilterNode(item as DatabaseFilter))
        .filter((item): item is FilterFactory => item !== undefined);
      if (compiled.length === 0) {
        continue;
      }
      parts.push((eb) =>
        key === '$and'
          ? eb.and(compiled.map((item) => item(eb)))
          : eb.or(compiled.map((item) => item(eb))),
      );
      continue;
    }
    if (key.startsWith('$') || typeof value !== 'object' || value === null) {
      continue;
    }
    const fieldParts = compileFieldFilter(
      key,
      value as Record<string, unknown>,
    );
    if (fieldParts !== undefined) {
      parts.push(fieldParts);
    }
  }

  if (parts.length === 0) {
    return undefined;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return (eb) => eb.and(parts.map((part) => part(eb)));
}

function compileFieldFilter(
  field: string,
  expression: Record<string, unknown>,
): FilterFactory | undefined {
  const parts: FilterFactory[] = [];
  for (const [operator, operand] of Object.entries(expression)) {
    switch (operator) {
      case '$eq':
        parts.push((eb) => eb(field, '=', operand));
        break;
      case '$ne':
        parts.push((eb) => eb(field, '!=', operand));
        break;
      case '$in':
        parts.push((eb) => eb(field, 'in', operand));
        break;
      case '$notIn':
        parts.push((eb) => eb(field, 'not in', operand));
        break;
      case '$gt':
        parts.push((eb) => eb(field, '>', operand));
        break;
      case '$gte':
        parts.push((eb) => eb(field, '>=', operand));
        break;
      case '$lt':
        parts.push((eb) => eb(field, '<', operand));
        break;
      case '$lte':
        parts.push((eb) => eb(field, '<=', operand));
        break;
      default:
        break;
    }
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.length === 1
    ? parts[0]
    : (eb) => eb.and(parts.map((p) => p(eb)));
}

class DatabaseEquipmentService implements EquipmentService {
  public constructor(private readonly database: DatabaseManager) {}

  public async listEquipment(
    conditions: DatabaseAuthorizationConditions,
  ): Promise<EquipmentRow[]> {
    let query = this.database
      .query()
      .selectFrom('equipment')
      .select(outputFields(conditions, EQUIPMENT_OUTPUT_COLUMNS))
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc');
    query = applyFilter(query, conditions.filter);
    const rows = await query.execute();
    return rows.map(toEquipmentRow);
  }

  public async getEquipment(id: number): Promise<EquipmentRow | undefined> {
    return this.database
      .query()
      .selectFrom('equipment')
      .select(EQUIPMENT_OUTPUT_COLUMNS)
      .where('id', '=', id)
      .executeTakeFirst()
      .then((row) => (row === undefined ? undefined : toEquipmentRow(row)));
  }

  public async createEquipment(
    input: EquipmentCreateInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<EquipmentRow> {
    assertInputFields(Object.keys(input), conditions, 'Equipment');
    const now = new Date().toISOString();
    const result = await this.database
      .query()
      .insertInto('equipment')
      .values({
        name: input.name,
        assetNumber: input.assetNumber,
        category: input.category,
        status: 'available',
        description: input.description ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const row = await this.getEquipment(Number(result.insertId));
    if (row === undefined) {
      throw new Error('Inserted equipment row could not be read back.');
    }
    return row;
  }

  public async updateEquipment(
    id: number,
    input: EquipmentUpdateInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<EquipmentRow | 'not-found'> {
    assertInputFields(Object.keys(input), conditions, 'Equipment');
    const current = await applyFilter(
      this.database
        .query()
        .selectFrom('equipment')
        .select(EQUIPMENT_OUTPUT_COLUMNS)
        .where('id', '=', id),
      conditions.filter,
    )
      .executeTakeFirst()
      .then((row) => (row === undefined ? undefined : toEquipmentRow(row)));
    if (current === undefined) {
      return 'not-found';
    }

    if (input.status !== undefined) {
      const blocked =
        (input.status === 'available' &&
          current.status !== 'repairing' &&
          current.status !== 'available') ||
        (input.status === 'repairing' &&
          current.status !== 'available' &&
          current.status !== 'repairing');
      if (blocked) {
        throw new EquipmentStatusConflictError(
          `Equipment ${id} is ${current.status} and cannot be set to ${input.status}.`,
        );
      }
    }

    const now = new Date().toISOString();
    const changes: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) {
      changes.name = input.name;
    }
    if (input.assetNumber !== undefined) {
      changes.assetNumber = input.assetNumber;
    }
    if (input.category !== undefined) {
      changes.category = input.category;
    }
    if (input.description !== undefined) {
      changes.description = input.description;
    }
    if (input.status !== undefined) {
      changes.status = input.status;
    }
    if (Object.keys(changes).length === 1) {
      return current;
    }

    await this.database
      .query()
      .updateTable('equipment')
      .set(changes)
      .where('id', '=', id)
      .execute();
    const updated = await this.getEquipment(id);
    return updated ?? 'not-found';
  }

  public async deleteEquipment(id: number): Promise<EquipmentDeleteOutcome> {
    const record = await this.database
      .query()
      .selectFrom('equipmentBorrowRecord')
      .select('id')
      .where('equipmentId', '=', id)
      .limit(1)
      .executeTakeFirst();
    if (record !== undefined) {
      return { status: 'has-records' };
    }
    const result = await this.database
      .query()
      .deleteFrom('equipment')
      .where('id', '=', id)
      .execute();
    return (result.deletedCount ?? 0) > 0
      ? { status: 'deleted' }
      : { status: 'not-found' };
  }

  public async listBorrowRecords(
    conditions: DatabaseAuthorizationConditions,
  ): Promise<BorrowRecordRow[]> {
    let query = this.database
      .query()
      .selectFrom('equipmentBorrowRecord')
      .select(outputFields(conditions, BORROW_RECORD_OUTPUT_COLUMNS))
      .orderBy('borrowedAt', 'desc')
      .orderBy('id', 'desc');
    query = applyFilter(query, conditions.filter);
    const rows = await query.execute();
    return rows.map(toBorrowRecordRow);
  }

  public async createBorrowRecord(
    input: BorrowCreateInput,
    borrower: BorrowerIdentity,
    conditions: DatabaseAuthorizationConditions,
    now = new Date(),
  ): Promise<BorrowCreateResult> {
    assertInputFields(Object.keys(input), conditions, 'Borrow record');
    const nowIso = now.toISOString();
    return this.database.transaction(async (connection) => {
      const equipment = await connection.query
        .selectFrom('equipment')
        .select(['id', 'status'])
        .where('id', '=', input.equipmentId)
        .executeTakeFirst();
      if (equipment === undefined) {
        return { status: 'equipment-not-found' as const };
      }
      if (equipment.status !== 'available') {
        return {
          status: 'unavailable' as const,
          equipmentStatus: equipment.status as EquipmentStatus,
        };
      }

      const result = await connection.query
        .insertInto('equipmentBorrowRecord')
        .values({
          equipmentId: input.equipmentId,
          borrowerId: borrower.id,
          borrowerName: borrower.name,
          borrowedAt: nowIso,
          returnedAt: null,
          note: input.note ?? null,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .execute();

      const updateResult = await connection.query
        .updateTable('equipment')
        .set({ status: 'borrowed', updatedAt: nowIso })
        .where('id', '=', input.equipmentId)
        .execute();
      if ((updateResult.updatedCount ?? 0) === 0) {
        throw new Error('Borrow flow could not update the equipment status.');
      }

      const record = await connection.query
        .selectFrom('equipmentBorrowRecord')
        .select(BORROW_RECORD_OUTPUT_COLUMNS)
        .where('id', '=', Number(result.insertId))
        .executeTakeFirst();
      if (record === undefined) {
        throw new Error('Inserted borrow record could not be read back.');
      }
      return { status: 'created' as const, record: toBorrowRecordRow(record) };
    });
  }

  public async returnBorrowRecord(
    id: number,
    input: BorrowReturnInput,
    conditions: DatabaseAuthorizationConditions,
    now = new Date(),
  ): Promise<BorrowReturnOutcome> {
    assertInputFields(Object.keys(input), conditions, 'Borrow record');
    const nowIso = now.toISOString();
    return this.database.transaction(async (connection) => {
      const record = await applyFilter(
        connection.query
          .selectFrom('equipmentBorrowRecord')
          .select(['id', 'equipmentId', 'returnedAt'])
          .where('id', '=', id),
        conditions.filter,
      ).executeTakeFirst();
      if (record === undefined) {
        return { status: 'not-found' as const };
      }
      if (record.returnedAt !== null && record.returnedAt !== undefined) {
        return { status: 'already-returned' as const };
      }

      const equipment = await connection.query
        .selectFrom('equipment')
        .select(['id', 'status'])
        .where('id', '=', record.equipmentId)
        .executeTakeFirst();
      if (equipment === undefined || equipment.status !== 'borrowed') {
        return {
          status: 'not-borrowed' as const,
          equipmentStatus:
            (equipment?.status as EquipmentStatus) ?? 'available',
        };
      }

      const updateResult = await connection.query
        .updateTable('equipmentBorrowRecord')
        .set({
          returnedAt: nowIso,
          ...(input.note !== undefined ? { note: input.note } : {}),
          updatedAt: nowIso,
        })
        .where('id', '=', id)
        .execute();
      if ((updateResult.updatedCount ?? 0) === 0) {
        throw new Error('Return flow could not update the borrow record.');
      }
      await connection.query
        .updateTable('equipment')
        .set({ status: 'available', updatedAt: nowIso })
        .where('id', '=', record.equipmentId)
        .execute();

      const updated = await connection.query
        .selectFrom('equipmentBorrowRecord')
        .select(BORROW_RECORD_OUTPUT_COLUMNS)
        .where('id', '=', id)
        .executeTakeFirst();
      if (updated === undefined) {
        throw new Error('Returned borrow record could not be read back.');
      }
      return {
        status: 'returned' as const,
        record: toBorrowRecordRow(updated),
      };
    });
  }

  public async countByStatus(): Promise<Record<EquipmentStatus, number>> {
    const rows = await this.database
      .query()
      .selectFrom('equipment')
      .select(['status'])
      .execute();
    const counts: Record<EquipmentStatus, number> = {
      available: 0,
      borrowed: 0,
      repairing: 0,
    };
    for (const row of rows) {
      const status = row.status as EquipmentStatus;
      if (status in counts) {
        counts[status] += 1;
      }
    }
    return counts;
  }
}

const EQUIPMENT_OUTPUT_COLUMNS = [
  'id',
  'name',
  'assetNumber',
  'category',
  'status',
  'description',
  'createdAt',
  'updatedAt',
] as const;

const BORROW_RECORD_OUTPUT_COLUMNS = [
  'id',
  'equipmentId',
  'borrowerId',
  'borrowerName',
  'borrowedAt',
  'returnedAt',
  'note',
  'createdAt',
  'updatedAt',
] as const;

type EquipmentSelectQuery = ReturnType<
  ReturnType<DatabaseManager['query']>['selectFrom']
>;

function applyFilter(
  query: EquipmentSelectQuery,
  filter: DatabaseFilter,
): EquipmentSelectQuery {
  const where = compileEquipmentFilter(filter);
  return where === undefined ? query : query.where(where);
}

function outputFields(
  conditions: DatabaseAuthorizationConditions,
  available: readonly string[],
): readonly string[] {
  const granted =
    conditions.fields.output === '*'
      ? available
      : conditions.fields.output.filter((field) => available.includes(field));
  return granted.length > 0 ? granted : available;
}

/** Rejects a write whose keys are not all allowed by the authorization grant. */
function assertInputFields(
  keys: ReadonlyArray<string>,
  conditions: DatabaseAuthorizationConditions,
  subject: string,
): void {
  if (conditions.fields.input === '*') {
    return;
  }
  const allowed = new Set<string>(conditions.fields.input);
  const rejected = keys.filter((key) => !allowed.has(key));
  if (rejected.length > 0) {
    throw new EquipmentFieldNotAllowedError(
      `${subject} input fields not allowed: ${rejected.join(', ')}`,
    );
  }
}

export class EquipmentStatusConflictError extends Error {}

export class EquipmentFieldNotAllowedError extends Error {}

/** Null-safe stringification for optional text columns. */
function textValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

function toEquipmentRow(row: Row): EquipmentRow {
  return {
    id: Number(row.id),
    name: String(row.name),
    assetNumber: String(row.assetNumber),
    category: String(row.category),
    status: row.status as EquipmentStatus,
    description: textValue(row.description),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function toBorrowRecordRow(row: Row): BorrowRecordRow {
  return {
    id: Number(row.id),
    equipmentId: Number(row.equipmentId),
    borrowerId: String(row.borrowerId),
    borrowerName: String(row.borrowerName),
    borrowedAt: String(row.borrowedAt),
    returnedAt: textValue(row.returnedAt),
    note: textValue(row.note),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

/**
 * Registers the equipment collections with the authorization plugin and
 * provisions the two permission sets plus their subject assignments. Idempotent:
 * safe to call on every boot.
 *
 * - `equipment-user`: every authenticated user can read the ledger, create
 *   borrow records, and return only borrow records they own.
 * - `equipment-maintainer`: full equipment CRUD plus access to every borrow
 *   record; assigned to the seeded `nocobase` administrator user.
 */
export async function provisionEquipmentAuthorization(
  authorization: AppAuthorization,
  database: DatabaseManager,
): Promise<void> {
  authorization.database.collections.add({
    name: 'equipment',
    title: 'Equipment',
    actions: ['list', 'create', 'update', 'delete'],
    fields: [
      'id',
      'name',
      'assetNumber',
      'category',
      'status',
      'description',
      'createdAt',
      'updatedAt',
    ],
  });
  authorization.database.collections.add({
    name: 'equipmentBorrowRecord',
    title: 'Equipment borrow records',
    actions: ['list', 'create', 'return'],
    fields: [
      'id',
      'equipmentId',
      'borrowerId',
      'borrowerName',
      'borrowedAt',
      'returnedAt',
      'note',
      'createdAt',
      'updatedAt',
    ],
    attributes: { owner: 'borrowerId' },
  });

  const userSet = await ensurePermissionSet(authorization, {
    key: 'equipment-user',
    title: 'Equipment user',
    grants: [
      authorization.database.grant('equipment', {
        list: {
          fields: { output: EQUIPMENT_OUTPUT_COLUMNS },
          recordAccess: ['allRecords'],
        },
      }),
      authorization.database.grant('equipmentBorrowRecord', {
        list: {
          fields: { output: BORROW_RECORD_OUTPUT_COLUMNS },
          recordAccess: ['allRecords'],
        },
        create: {
          fields: {
            input: ['equipmentId', 'note'],
            output: ['id', 'equipmentId', 'borrowedAt'],
          },
          recordAccess: ['allRecords'],
        },
        return: {
          fields: {
            input: ['note'],
            output: ['id', 'equipmentId', 'returnedAt'],
          },
          recordAccess: ['recordsIOwn'],
        },
      }),
    ],
  });
  await ensureAssignment(authorization, {
    permissionSet: userSet.key,
    subject: { type: 'authenticated', id: '*' },
  });

  const maintainerSet = await ensurePermissionSet(authorization, {
    key: 'equipment-maintainer',
    title: 'Equipment maintainer',
    grants: [
      authorization.database.grant('equipment', {
        list: {
          fields: { output: '*' },
          recordAccess: ['allRecords'],
        },
        create: {
          fields: { input: '*', output: '*' },
          recordAccess: ['allRecords'],
        },
        update: {
          fields: { input: '*', output: '*' },
          recordAccess: ['allRecords'],
        },
        delete: {
          recordAccess: ['allRecords'],
        },
      }),
      authorization.database.grant('equipmentBorrowRecord', {
        list: {
          fields: { output: '*' },
          recordAccess: ['allRecords'],
        },
        create: {
          fields: { input: '*', output: '*' },
          recordAccess: ['allRecords'],
        },
        return: {
          fields: { input: '*', output: '*' },
          recordAccess: ['allRecords'],
        },
      }),
    ],
  });

  const admin = await database
    .query()
    .selectFrom('user')
    .select(['id'])
    .where('username', '=', 'nocobase')
    .limit(1)
    .executeTakeFirst();
  if (admin !== undefined) {
    await ensureAssignment(authorization, {
      permissionSet: maintainerSet.key,
      subject: { type: 'user', id: String(admin.id) },
    });
  }
}

type PermissionSetInput = Parameters<
  AppAuthorization['permissionSets']['create']
>[0];

async function ensurePermissionSet(
  authorization: AppAuthorization,
  input: PermissionSetInput,
): Promise<{ key: string }> {
  const existing = await authorization.permissionSets.get(input.key);
  if (existing !== undefined) {
    return existing;
  }
  return authorization.permissionSets.create(input);
}

async function ensureAssignment(
  authorization: AppAuthorization,
  input: {
    permissionSet: string;
    subject: { type: string; id: string };
  },
): Promise<void> {
  const assignments = await authorization.permissionSets.listAssignments(
    input.permissionSet,
  );
  const exists = assignments.some(
    (assignment) =>
      assignment.subject.type === input.subject.type &&
      assignment.subject.id === input.subject.id,
  );
  if (!exists) {
    await authorization.permissionSets.assign(input);
  }
}

export default class EquipmentProvider extends ServiceProvider<Application> {
  public readonly name: string = `${APP_PACKAGE_NAME}/equipment-provider`;

  public override register(): void {
    this.app.container.singleton(equipmentServiceToken, (container) => {
      const database = container.resolve(databaseManagerToken);
      return new DatabaseEquipmentService(database);
    });
  }

  public override async boot(): Promise<void> {
    const database = this.app.container.resolve(databaseManagerToken);
    const authorization = this.app.container.resolve(authorizationToken);
    await provisionEquipmentAuthorization(authorization, database);
  }
}
