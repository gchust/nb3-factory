import { Readable } from 'node:stream';

import { driveManagerToken } from '@nocobase/app-server/drive';
import type { Application } from '@nocobase/app-server/application';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import {
  serverFileRepositoryManagerToken,
  type ServerFileRepository,
  type ServerFileRepositoryManager,
} from '@nocobase/app-plugin-file/server';
import {
  authorizationToken,
  type AppAuthorization,
  type DatabaseAuthorizationConditions,
  type DatabaseFilter,
  type DatabaseFilterOperator,
} from '@nocobase/app-plugin-authorization';
import {
  databaseManagerToken,
  type ComparisonOperator,
  type DatabaseManager,
  type Expression,
  type ExpressionBuilder,
  type Row,
  type SqlBool,
} from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

/** The File plugin disk used for contract scans. It ships with the application. */
export const CONTRACT_FILE_DISK = 'local';
/** Resource name registered with the File plugin's repository manager. */
export const CONTRACT_FILE_COLLECTION = 'contractAttachments';
/** Application-internal access path; scans are served by an authenticated download route, never by this path. */
export const CONTRACT_FILE_ACCESS_PATH = '/uploads/contract-attachments';

export const contractsServiceToken: ServiceToken<ContractsService> =
  createServiceToken<ContractsService>('contractsService');

export const CONTRACT_FIELDS = [
  'id',
  'contractNo',
  'name',
  'counterparty',
  'type',
  'signedDate',
  'effectiveDate',
  'expiryDate',
  'amount',
  'ownerId',
  'ownerName',
  'createdById',
  'status',
  'createdAt',
  'updatedAt',
] as const;

export const CONTRACT_ACTIONS = [
  'read',
  'create',
  'update',
  'delete',
  'download',
] as const;

export interface ContractInput {
  readonly contractNo?: string;
  readonly name?: string;
  readonly counterparty?: string;
  readonly type?: string;
  readonly signedDate?: string | null;
  readonly effectiveDate?: string | null;
  readonly expiryDate?: string | null;
  readonly amount?: number;
  readonly status?: string;
}

export interface ContractListFilters {
  readonly type?: string;
  readonly status?: string;
  readonly expiringDays?: number;
  readonly search?: string;
}

export interface ContractRow {
  id: string;
  contractNo: string;
  name: string;
  counterparty: string;
  type: string;
  signedDate: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  amount: number;
  ownerId: string;
  ownerName: string | null;
  createdById: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractVersionRow {
  id: string;
  contractId: string;
  versionNo: string;
  description: string | null;
  uploadedAt: string;
  uploadedById: string;
  uploadedByName: string | null;
}

export interface ContractAttachmentRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  contractId: string | null;
  versionId: string | null;
  ownerId: string | null;
  uploadedById: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface ContractActor {
  readonly id: string;
  readonly name: string;
}

export class ContractsService {
  public constructor(
    private readonly database: DatabaseManager,
    private readonly files: ServerFileRepositoryManager,
    private readonly drive: NocoBaseDriveManager,
  ) {}

  public fileRepository(): ServerFileRepository {
    return this.files.repository(CONTRACT_FILE_COLLECTION, {
      connection: 'main',
      disk: CONTRACT_FILE_DISK,
      accessPath: CONTRACT_FILE_ACCESS_PATH,
    });
  }

  /** Display name for the acting user, stored on contracts, versions and attachments for readability. */
  public async displayNameFor(userId: string): Promise<string> {
    const row = await this.database
      .query()
      .selectFrom('user')
      .select(['name', 'email', 'username'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!row) return userId;
    for (const key of ['name', 'email', 'username'] as const) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return userId;
  }

  public async list(
    conditions: DatabaseAuthorizationConditions,
    filters: ContractListFilters,
  ): Promise<ContractRow[]> {
    const fields = resolveOutputFields(conditions);
    let query = this.database
      .query()
      .selectFrom('contracts')
      .select(fields.length > 0 ? fields : [...CONTRACT_FIELDS])
      .where((eb) => compileFilter(eb, conditions.filter));

    if (filters.type) query = query.where('type', '=', filters.type);
    if (filters.status) query = query.where('status', '=', filters.status);
    if (filters.search) {
      const term = `%${filters.search}%`;
      query = query.where((eb) =>
        eb.or([
          eb('name', 'like', term),
          eb('contractNo', 'like', term),
          eb('counterparty', 'like', term),
        ]),
      );
    }
    if (filters.expiringDays !== undefined) {
      const today = new Date();
      const from = toDateString(today);
      const until = new Date(today);
      until.setDate(until.getDate() + filters.expiringDays);
      query = query
        .where('expiryDate', '>=', from)
        .where('expiryDate', '<=', toDateString(until));
    }

    const rows = await query.orderBy('createdAt', 'desc').execute();
    return rows.map(mapContract);
  }

  public async findById(
    id: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ContractRow | undefined> {
    const row = await this.database
      .query()
      .selectFrom('contracts')
      .select([...CONTRACT_FIELDS])
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .executeTakeFirst();
    return row ? mapContract(row) : undefined;
  }

  public async create(
    input: ContractInput,
    actor: ContractActor,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<string> {
    const values = normalizeContractInput(input);
    assertInputFields(values, conditions.fields.input);
    const id = crypto.randomUUID();
    const now = new Date();
    await this.database
      .query()
      .insertInto('contracts')
      .values({
        id,
        contractNo: String(values.contractNo),
        name: String(values.name),
        counterparty: String(values.counterparty),
        type: String(values.type),
        signedDate: values.signedDate ?? null,
        effectiveDate: values.effectiveDate ?? null,
        expiryDate: values.expiryDate ?? null,
        amount: values.amount ?? 0,
        ownerId: actor.id,
        ownerName: actor.name,
        createdById: actor.id,
        status: String(values.status),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return id;
  }

  public async update(
    id: string,
    input: ContractInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    const values = normalizeContractInput(input, { partial: true });
    assertInputFields(values, conditions.fields.input);
    const result = await this.database
      .query()
      .updateTable('contracts')
      .set({ ...values, updatedAt: new Date() })
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return result.updatedCount ?? 0;
  }

  public async listVersions(contractId: string): Promise<ContractVersionRow[]> {
    const rows = await this.database
      .query()
      .selectFrom('contractVersions')
      .select([
        'id',
        'contractId',
        'versionNo',
        'description',
        'uploadedAt',
        'uploadedById',
        'uploadedByName',
      ])
      .where('contractId', '=', contractId)
      .orderBy('uploadedAt', 'desc')
      .execute();
    return rows.map(mapVersion);
  }

  public async createVersion(
    contractId: string,
    input: { readonly versionNo: string; readonly description?: string },
    actor: ContractActor,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();
    await this.database
      .query()
      .insertInto('contractVersions')
      .values({
        id,
        contractId,
        versionNo: input.versionNo,
        description: input.description ?? null,
        uploadedAt: now,
        uploadedById: actor.id,
        uploadedByName: actor.name,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return id;
  }

  public async listAttachments(
    contractId: string,
  ): Promise<ContractAttachmentRow[]> {
    const rows = await this.database
      .query()
      .selectFrom('contractAttachments')
      .select([
        'id',
        'disk',
        'key',
        'filename',
        'ext',
        'mimeType',
        'size',
        'contractId',
        'versionId',
        'ownerId',
        'uploadedById',
        'uploadedByName',
        'createdAt',
      ])
      .where('contractId', '=', contractId)
      .orderBy('createdAt', 'asc')
      .execute();
    return rows.map(mapAttachment);
  }

  public async linkAttachment(
    id: string,
    link: {
      readonly contractId: string;
      readonly versionId: string | null;
      readonly ownerId: string;
      readonly actor: ContractActor;
    },
  ): Promise<void> {
    await this.database
      .query()
      .updateTable('contractAttachments')
      .set({
        contractId: link.contractId,
        versionId: link.versionId,
        ownerId: link.ownerId,
        uploadedById: link.actor.id,
        uploadedByName: link.actor.name,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }

  public async findAttachment(
    id: string,
  ): Promise<ContractAttachmentRow | undefined> {
    const row = await this.database
      .query()
      .selectFrom('contractAttachments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? mapAttachment(row) : undefined;
  }

  public async statistics(
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{
    byType: StatisticBucket[];
    byStatus: StatisticBucket[];
  }> {
    const [byType, byStatus] = await Promise.all([
      this.groupStatistics('type', conditions),
      this.groupStatistics('status', conditions),
    ]);
    return { byType, byStatus };
  }

  private async groupStatistics(
    column: 'type' | 'status',
    conditions: DatabaseAuthorizationConditions,
  ): Promise<StatisticBucket[]> {
    const rows = await this.database
      .query()
      .selectFrom('contracts')
      .select((eb) => [
        column,
        eb.fn.countAll().as('contractCount'),
        eb.fn.sum('amount').as('amountTotal'),
      ])
      .where((eb) => compileFilter(eb, conditions.filter))
      .groupBy(column)
      .execute();
    return rows.map((row) => ({
      key: asString(row[column]),
      count: Number(row.contractCount ?? 0),
      amount: Number(row.amountTotal ?? 0),
    }));
  }

  /** Stream the stored object for an attachment. */
  public async openAttachment(row: ContractAttachmentRow): Promise<{
    stream: ReadableStream<Uint8Array>;
    filename: string;
    size: number;
    mimeType: string;
  }> {
    const disk = this.drive.use(row.disk);
    if (!(await disk.exists(row.key))) {
      throw new ContractsAttachmentMissingError(row.id);
    }
    const stream = await disk.getStream(row.key);
    return {
      stream: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
      filename: row.filename,
      size: row.size,
      mimeType: row.mimeType,
    };
  }
}

export interface StatisticBucket {
  readonly key: string;
  readonly count: number;
  readonly amount: number;
}

export class ContractsAttachmentMissingError extends Error {
  public readonly code = 'ATTACHMENT_MISSING';
  public constructor(id: string) {
    super(`Attachment ${id} has no stored object.`);
    this.name = 'ContractsAttachmentMissingError';
  }
}

const FILTER_OPERATORS: Readonly<
  Record<DatabaseFilterOperator, ComparisonOperator>
> = {
  $eq: '=',
  $ne: '!=',
  $in: 'in',
  $notIn: 'not in',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};

/**
 * Translate the authorization Filter AST into the query builder.
 *
 * `$and: []` is the authorization layer's "all records" filter and `$or: []` its "no records"; both are spelled
 * explicitly because an empty knex boolean group is not portable SQL.
 */
export function compileFilter(
  eb: ExpressionBuilder,
  filter: DatabaseFilter,
): Expression<SqlBool> {
  const expressions = Object.entries(filter).map(([field, value]) => {
    if (field === '$and' || field === '$or') {
      const items = Array.isArray(value) ? (value as DatabaseFilter[]) : [];
      if (items.length === 0) {
        return field === '$and'
          ? eb('id', 'is not', null)
          : eb('id', 'is', null);
      }
      const nested = items.map((item) => compileFilter(eb, item));
      return field === '$and' ? eb.and(nested) : eb.or(nested);
    }
    const conditions = Object.entries(value as Record<string, unknown>).map(
      ([operator, expected]) => {
        const comparison = FILTER_OPERATORS[operator as DatabaseFilterOperator];
        if (!comparison) {
          throw new TypeError(`Unknown filter operator: ${operator}`);
        }
        return eb(field, comparison, expected);
      },
    );
    return eb.and(conditions);
  });
  return eb.and(expressions);
}

function resolveOutputFields(
  conditions: DatabaseAuthorizationConditions,
): readonly string[] {
  const output = conditions.fields.output;
  if (output === '*') return [...CONTRACT_FIELDS];
  return output.filter((field) =>
    (CONTRACT_FIELDS as readonly string[]).includes(field),
  );
}

function assertInputFields(input: Row, allowed: '*' | readonly string[]): void {
  if (allowed === '*') return;
  const rejected = Object.keys(input).filter(
    (field) => !allowed.includes(field),
  );
  if (rejected.length > 0) {
    throw new TypeError(
      `Input fields are not authorized: ${rejected.join(', ')}`,
    );
  }
}

function normalizeContractInput(
  input: ContractInput,
  options: { readonly partial?: boolean } = {},
): Row {
  const values: Row = {};
  const required = ['contractNo', 'name', 'counterparty', 'type', 'status'];
  for (const field of required) {
    const value = input[field as keyof ContractInput];
    if (typeof value === 'string' && value.trim()) {
      values[field] = value.trim();
    } else if (!options.partial) {
      throw new ContractsValidationError(
        'MISSING_REQUIRED_FIELD',
        `Contract field "${field}" is required.`,
      );
    }
  }
  for (const field of ['signedDate', 'effectiveDate', 'expiryDate'] as const) {
    if (input[field] !== undefined) {
      values[field] = input[field] || null;
    }
  }
  if (input.amount !== undefined) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new ContractsValidationError(
        'INVALID_AMOUNT',
        'Contract amount must be a non-negative number.',
      );
    }
    values.amount = amount;
  } else if (!options.partial) {
    values.amount = 0;
  }
  return values;
}

export class ContractsValidationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ContractsValidationError';
  }
}

function mapContract(row: Row): ContractRow {
  return {
    id: asString(row.id),
    contractNo: asString(row.contractNo),
    name: asString(row.name),
    counterparty: asString(row.counterparty),
    type: asString(row.type),
    signedDate: nullableString(row.signedDate),
    effectiveDate: nullableString(row.effectiveDate),
    expiryDate: nullableString(row.expiryDate),
    amount: Number(row.amount ?? 0),
    ownerId: asString(row.ownerId),
    ownerName: nullableString(row.ownerName),
    createdById: asString(row.createdById),
    status: asString(row.status),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function mapVersion(row: Row): ContractVersionRow {
  return {
    id: asString(row.id),
    contractId: asString(row.contractId),
    versionNo: asString(row.versionNo),
    description: nullableString(row.description),
    uploadedAt: toIsoString(row.uploadedAt),
    uploadedById: asString(row.uploadedById),
    uploadedByName: nullableString(row.uploadedByName),
  };
}

function mapAttachment(row: Row): ContractAttachmentRow {
  return {
    id: asString(row.id),
    disk: asString(row.disk),
    key: asString(row.key),
    filename: asString(row.filename),
    ext: asString(row.ext),
    mimeType: asString(row.mimeType),
    size: Number(row.size ?? 0),
    contractId: nullableString(row.contractId),
    versionId: nullableString(row.versionId),
    ownerId: nullableString(row.ownerId),
    uploadedById: nullableString(row.uploadedById),
    uploadedByName: nullableString(row.uploadedByName),
    createdAt: toIsoString(row.createdAt),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Coerce a driver value to a string without going through `Object.prototype.toString`. */
function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return '';
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Registers the contract resource with Authorization and exposes the contract service.
 *
 * The collection must be registered before any `authorize()` call, which is why this lives in `boot()`.
 */
export class ContractsProvider extends ServiceProvider<Application> {
  public readonly name = 'app/contracts';

  public override register(): void {
    this.app.container.singleton(contractsServiceToken, (container) => {
      return new ContractsService(
        container.resolve(databaseManagerToken),
        container.resolve(serverFileRepositoryManagerToken),
        container.resolve(driveManagerToken),
      );
    });
  }

  public override boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) {
      return Promise.resolve();
    }
    const authorization: AppAuthorization =
      this.app.container.resolve(authorizationToken);
    if (!authorization.database.collections.get('contracts')) {
      authorization.database.collections.add({
        name: 'contracts',
        title: 'Contracts',
        actions: [...CONTRACT_ACTIONS],
        fields: [...CONTRACT_FIELDS],
        attributes: {
          identifier: 'id',
          owner: 'ownerId',
          creator: 'createdById',
        },
      });
    }
    return Promise.resolve();
  }
}

export default ContractsProvider;
