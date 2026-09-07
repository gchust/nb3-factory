import type { Application } from '@nocobase/app-server/application';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Expression,
  type ExpressionBuilder,
  type ExpressionFactory,
  type PortableComparisonOperator,
  type SqlBool,
} from '@nocobase/db';
import {
  authorizationToken,
  type AppAuthorization,
  type DatabaseFieldFilter,
  type DatabaseFilter,
  type DatabaseFilterOperator,
} from '@nocobase/app-plugin-authorization';

// `create-app` rewrites this literal to the generated application's own package name. Keeping it alone on one short
// line means the rewrite cannot change how Prettier wraps the statements that use it: a shorter name would otherwise
// let a wrapped call collapse onto one line, leaving the generated project failing its own `pnpm format:check`.
const APP_PACKAGE_NAME = '@nocobase/app-template-default';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetType = 'computer' | 'monitor' | 'phone' | 'other';
export type AssetStatus = 'available' | 'inUse' | 'maintenance' | 'retired';
export type RecordStatus = 'claimed' | 'returned';

export interface Asset {
  id: number;
  assetNumber: string;
  name: string;
  type: string;
  brandModel: string;
  status: string;
  currentEmployeeId: number | null;
  currentEmployeeName: string | null;
  purchasedAt: string | null;
  remark: string | null;
  createdAt: string;
}

export interface AssetRecord {
  id: number;
  assetId: number;
  assetNumber: string;
  assetName: string;
  employeeId: number;
  employeeName: string;
  department: string;
  claimedAt: string;
  returnedAt: string | null;
  status: string;
  remark: string | null;
}

export interface Employee {
  id: number;
  name: string;
  department: string;
  email: string | null;
  isAdmin: boolean;
}

export interface AssetListFilters {
  type?: string;
  status?: string;
  search?: string;
}

export interface RecordListFilters {
  status?: string;
  search?: string;
  assetId?: string;
}

export interface CreateAssetInput {
  assetNumber: string;
  name: string;
  type: string;
  brandModel: string;
  status: string;
  purchasedAt?: string | null;
  remark?: string | null;
}

export interface UpdateAssetInput {
  assetNumber?: string;
  name?: string;
  type?: string;
  brandModel?: string;
  status?: string;
  purchasedAt?: string | null;
  remark?: string | null;
}

/** A business-rule violation (claiming an in-use asset, returning an available one, ...). */
export class AssetDomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AssetDomainError';
  }
}

export interface AssetService {
  listAssets(
    filters: AssetListFilters,
    scope: DatabaseFilter,
  ): Promise<Asset[]>;
  getAsset(id: number, scope: DatabaseFilter): Promise<Asset | undefined>;
  createAsset(input: CreateAssetInput): Promise<Asset>;
  updateAsset(
    id: number,
    input: UpdateAssetInput,
    scope: DatabaseFilter,
  ): Promise<Asset | undefined>;
  deleteAsset(id: number, scope: DatabaseFilter): Promise<boolean>;
  claimAsset(
    id: number,
    employeeId: number,
    remark: string | null,
    scope: DatabaseFilter,
  ): Promise<Asset>;
  returnAsset(
    id: number,
    remark: string | null,
    scope: DatabaseFilter,
  ): Promise<Asset>;
  listRecords(
    filters: RecordListFilters,
    scope: DatabaseFilter,
  ): Promise<AssetRecord[]>;
  listEmployees(scope: DatabaseFilter): Promise<Employee[]>;
}

export const assetServiceToken: ServiceToken<AssetService> =
  createServiceToken<AssetService>(`${APP_PACKAGE_NAME}/asset-service`);

// ---------------------------------------------------------------------------
// Authorization filter compilation
// ---------------------------------------------------------------------------

const FILTER_OPERATORS: Record<
  DatabaseFilterOperator,
  PortableComparisonOperator
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

function compileFilter(
  eb: ExpressionBuilder,
  filter: DatabaseFilter,
): Expression<SqlBool> {
  const entries = Object.entries(filter);
  if (
    entries.length === 1 &&
    (entries[0][0] === '$and' || entries[0][0] === '$or')
  ) {
    const [operator, children] = entries[0];
    const expressions = (children as readonly DatabaseFilter[]).map((child) =>
      compileFilter(eb, child),
    );
    return operator === '$and' ? eb.and(expressions) : eb.or(expressions);
  }
  const expressions: Expression<SqlBool>[] = [];
  for (const [field, fieldFilter] of entries) {
    for (const [operator, value] of Object.entries(
      fieldFilter as DatabaseFieldFilter,
    )) {
      const sqlOperator = FILTER_OPERATORS[operator as DatabaseFilterOperator];
      if (sqlOperator) {
        expressions.push(eb(field, sqlOperator, value));
      }
    }
  }
  return eb.and(expressions);
}

/** Applies an authorization record filter to a query builder's WHERE clause. */
export function applyDatabaseFilter<
  T extends { where(factory: ExpressionFactory<SqlBool>): T },
>(query: T, filter: DatabaseFilter): T {
  return query.where((eb) => compileFilter(eb, filter));
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

interface AssetRow {
  id: number;
  assetNumber: string;
  name: string;
  type: string;
  brandModel: string;
  status: string;
  currentEmployeeId: number | null;
  currentEmployeeName: string | null;
  purchasedAt: Date | string | null;
  remark: string | null;
  createdAt: Date | string;
}

interface RecordRow {
  id: number;
  assetId: number;
  assetNumber: string;
  assetName: string;
  employeeId: number;
  employeeName: string;
  department: string;
  claimedAt: Date | string;
  returnedAt: Date | string | null;
  status: string;
  remark: string | null;
}

interface EmployeeRow {
  id: number;
  name: string;
  department: string;
  email: string | null;
  isAdmin: number | boolean;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toAsset(row: AssetRow): Asset {
  return {
    id: Number(row.id),
    assetNumber: String(row.assetNumber),
    name: String(row.name),
    type: String(row.type),
    brandModel: String(row.brandModel),
    status: String(row.status),
    currentEmployeeId:
      row.currentEmployeeId == null ? null : Number(row.currentEmployeeId),
    currentEmployeeName:
      row.currentEmployeeName == null ? null : String(row.currentEmployeeName),
    purchasedAt: toIso(row.purchasedAt),
    remark: row.remark == null ? null : String(row.remark),
    createdAt: toIso(row.createdAt) ?? '',
  };
}

function toRecord(row: RecordRow): AssetRecord {
  return {
    id: Number(row.id),
    assetId: Number(row.assetId),
    assetNumber: String(row.assetNumber),
    assetName: String(row.assetName),
    employeeId: Number(row.employeeId),
    employeeName: String(row.employeeName),
    department: String(row.department),
    claimedAt: toIso(row.claimedAt) ?? '',
    returnedAt: toIso(row.returnedAt),
    status: String(row.status),
    remark: row.remark == null ? null : String(row.remark),
  };
}

export class DatabaseAssetService implements AssetService {
  constructor(private readonly database: DatabaseManager) {}

  async listAssets(
    filters: AssetListFilters,
    scope: DatabaseFilter,
  ): Promise<Asset[]> {
    let query = this.database
      .query()
      .selectFrom('itAssets')
      .leftJoin('itEmployees', 'itEmployees.id', 'itAssets.currentEmployeeId')
      .select([
        'itAssets.id',
        'itAssets.assetNumber',
        'itAssets.name',
        'itAssets.type',
        'itAssets.brandModel',
        'itAssets.status',
        'itAssets.currentEmployeeId',
        'itAssets.purchasedAt',
        'itAssets.remark',
        'itAssets.createdAt',
        'itEmployees.name as currentEmployeeName',
      ])
      .where((eb) => compileFilter(eb, scope));

    if (filters.type) {
      query = query.where('itAssets.type', '=', filters.type);
    }
    if (filters.status) {
      query = query.where('itAssets.status', '=', filters.status);
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      query = query.where((eb) =>
        eb.or([
          eb('itAssets.assetNumber', 'like', term),
          eb('itAssets.name', 'like', term),
        ]),
      );
    }

    const rows = await query.orderBy('itAssets.id', 'desc').execute();
    return rows.map((row) => toAsset(row as unknown as AssetRow));
  }

  async getAsset(
    id: number,
    scope: DatabaseFilter,
  ): Promise<Asset | undefined> {
    const row = await this.database
      .query()
      .selectFrom('itAssets')
      .leftJoin('itEmployees', 'itEmployees.id', 'itAssets.currentEmployeeId')
      .select([
        'itAssets.id',
        'itAssets.assetNumber',
        'itAssets.name',
        'itAssets.type',
        'itAssets.brandModel',
        'itAssets.status',
        'itAssets.currentEmployeeId',
        'itAssets.purchasedAt',
        'itAssets.remark',
        'itAssets.createdAt',
        'itEmployees.name as currentEmployeeName',
      ])
      .where('itAssets.id', '=', id)
      .where((eb) => compileFilter(eb, scope))
      .executeTakeFirst();
    return row ? toAsset(row as unknown as AssetRow) : undefined;
  }

  async createAsset(input: CreateAssetInput): Promise<Asset> {
    const now = new Date();
    const result = await this.database
      .query()
      .insertInto('itAssets')
      .values({
        assetNumber: input.assetNumber,
        name: input.name,
        type: input.type,
        brandModel: input.brandModel,
        status: input.status,
        currentEmployeeId: null,
        purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : null,
        remark: input.remark ?? null,
        createdAt: now,
      })
      .execute();
    const id = Number(result.insertId);
    const asset = await this.getAsset(id, { $and: [] });
    if (!asset) {
      throw new AssetDomainError('Asset was not created.', 'ASSET_NOT_FOUND');
    }
    return asset;
  }

  async updateAsset(
    id: number,
    input: UpdateAssetInput,
    scope: DatabaseFilter,
  ): Promise<Asset | undefined> {
    const existing = await this.getAsset(id, scope);
    if (!existing) {
      return undefined;
    }
    const values: Record<string, unknown> = {};
    if (input.assetNumber !== undefined) values.assetNumber = input.assetNumber;
    if (input.name !== undefined) values.name = input.name;
    if (input.type !== undefined) values.type = input.type;
    if (input.brandModel !== undefined) values.brandModel = input.brandModel;
    if (input.status !== undefined) values.status = input.status;
    if (input.purchasedAt !== undefined) {
      values.purchasedAt = input.purchasedAt
        ? new Date(input.purchasedAt)
        : null;
    }
    if (input.remark !== undefined) values.remark = input.remark;
    if (Object.keys(values).length === 0) {
      return existing;
    }
    await this.database
      .query()
      .updateTable('itAssets')
      .set(values)
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, scope))
      .execute();
    return this.getAsset(id, scope);
  }

  async deleteAsset(id: number, scope: DatabaseFilter): Promise<boolean> {
    const result = await this.database
      .query()
      .deleteFrom('itAssets')
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, scope))
      .execute();
    return (result.deletedCount ?? 0) > 0;
  }

  async claimAsset(
    id: number,
    employeeId: number,
    remark: string | null,
    scope: DatabaseFilter,
  ): Promise<Asset> {
    const now = new Date();
    return this.database.transaction(async (connection) => {
      const asset = (await connection.query
        .selectFrom('itAssets')
        .select(['id', 'status'])
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, scope))
        .executeTakeFirst()) as unknown as
        { id: number; status: string } | undefined;
      if (!asset) {
        throw new AssetDomainError('Asset not found.', 'ASSET_NOT_FOUND');
      }
      if (asset.status !== 'available') {
        throw new AssetDomainError(
          `Asset cannot be claimed while its status is "${asset.status}".`,
          'ASSET_NOT_CLAIMABLE',
        );
      }
      const employee = await connection.query
        .selectFrom('itEmployees')
        .select(['id'])
        .where('id', '=', employeeId)
        .executeTakeFirst();
      if (!employee) {
        throw new AssetDomainError('Employee not found.', 'EMPLOYEE_NOT_FOUND');
      }

      await connection.query
        .insertInto('itAssetRecords')
        .values({
          assetId: id,
          employeeId,
          claimedAt: now,
          returnedAt: null,
          status: 'claimed',
          remark,
          createdAt: now,
        })
        .execute();
      await connection.query
        .updateTable('itAssets')
        .set({ status: 'inUse', currentEmployeeId: employeeId })
        .where('id', '=', id)
        .execute();

      const updated = await connection.query
        .selectFrom('itAssets')
        .leftJoin('itEmployees', 'itEmployees.id', 'itAssets.currentEmployeeId')
        .select([
          'itAssets.id',
          'itAssets.assetNumber',
          'itAssets.name',
          'itAssets.type',
          'itAssets.brandModel',
          'itAssets.status',
          'itAssets.currentEmployeeId',
          'itAssets.purchasedAt',
          'itAssets.remark',
          'itAssets.createdAt',
          'itEmployees.name as currentEmployeeName',
        ])
        .where('itAssets.id', '=', id)
        .executeTakeFirst();
      if (!updated) {
        throw new AssetDomainError('Asset not found.', 'ASSET_NOT_FOUND');
      }
      return toAsset(updated as unknown as AssetRow);
    });
  }

  async returnAsset(
    id: number,
    remark: string | null,
    scope: DatabaseFilter,
  ): Promise<Asset> {
    const now = new Date();
    return this.database.transaction(async (connection) => {
      const asset = (await connection.query
        .selectFrom('itAssets')
        .select(['id', 'status'])
        .where('id', '=', id)
        .where((eb) => compileFilter(eb, scope))
        .executeTakeFirst()) as unknown as
        { id: number; status: string } | undefined;
      if (!asset) {
        throw new AssetDomainError('Asset not found.', 'ASSET_NOT_FOUND');
      }
      if (asset.status !== 'inUse') {
        throw new AssetDomainError(
          `Asset cannot be returned while its status is "${asset.status}".`,
          'ASSET_NOT_RETURNABLE',
        );
      }

      const openRecord = await connection.query
        .selectFrom('itAssetRecords')
        .select(['id'])
        .where('assetId', '=', id)
        .where('status', '=', 'claimed')
        .where('returnedAt', 'is', null)
        .orderBy('claimedAt', 'desc')
        .executeTakeFirst();
      if (!openRecord) {
        throw new AssetDomainError(
          'Asset has no open claim record to return.',
          'NO_OPEN_RECORD',
        );
      }

      await connection.query
        .updateTable('itAssetRecords')
        .set({ status: 'returned', returnedAt: now, remark })
        .where('id', '=', Number(openRecord.id))
        .execute();
      await connection.query
        .updateTable('itAssets')
        .set({ status: 'available', currentEmployeeId: null })
        .where('id', '=', id)
        .execute();

      const updated = await connection.query
        .selectFrom('itAssets')
        .leftJoin('itEmployees', 'itEmployees.id', 'itAssets.currentEmployeeId')
        .select([
          'itAssets.id',
          'itAssets.assetNumber',
          'itAssets.name',
          'itAssets.type',
          'itAssets.brandModel',
          'itAssets.status',
          'itAssets.currentEmployeeId',
          'itAssets.purchasedAt',
          'itAssets.remark',
          'itAssets.createdAt',
          'itEmployees.name as currentEmployeeName',
        ])
        .where('itAssets.id', '=', id)
        .executeTakeFirst();
      if (!updated) {
        throw new AssetDomainError('Asset not found.', 'ASSET_NOT_FOUND');
      }
      return toAsset(updated as unknown as AssetRow);
    });
  }

  async listRecords(
    filters: RecordListFilters,
    scope: DatabaseFilter,
  ): Promise<AssetRecord[]> {
    let query = this.database
      .query()
      .selectFrom('itAssetRecords')
      .innerJoin('itAssets', 'itAssets.id', 'itAssetRecords.assetId')
      .innerJoin('itEmployees', 'itEmployees.id', 'itAssetRecords.employeeId')
      .select([
        'itAssetRecords.id',
        'itAssetRecords.assetId',
        'itAssetRecords.employeeId',
        'itAssetRecords.claimedAt',
        'itAssetRecords.returnedAt',
        'itAssetRecords.status',
        'itAssetRecords.remark',
        'itAssets.assetNumber',
        'itAssets.name as assetName',
        'itEmployees.name as employeeName',
        'itEmployees.department',
      ])
      .where((eb) => compileFilter(eb, scope));

    if (filters.status) {
      query = query.where('itAssetRecords.status', '=', filters.status);
    }
    if (filters.assetId) {
      query = query.where(
        'itAssetRecords.assetId',
        '=',
        Number(filters.assetId),
      );
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      query = query.where((eb) =>
        eb.or([
          eb('itAssets.assetNumber', 'like', term),
          eb('itAssets.name', 'like', term),
          eb('itEmployees.name', 'like', term),
        ]),
      );
    }

    const rows = await query
      .orderBy('itAssetRecords.claimedAt', 'desc')
      .execute();
    return rows.map((row) => toRecord(row as unknown as RecordRow));
  }

  async listEmployees(scope: DatabaseFilter): Promise<Employee[]> {
    const rows = (await this.database
      .query()
      .selectFrom('itEmployees')
      .select(['id', 'name', 'department', 'email', 'isAdmin'])
      .where((eb) => compileFilter(eb, scope))
      .orderBy('id', 'asc')
      .execute()) as unknown as EmployeeRow[];
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      department: String(row.department),
      email: row.email == null ? null : String(row.email),
      isAdmin: Boolean(row.isAdmin),
    }));
  }
}

// ---------------------------------------------------------------------------
// Provider: registers the service, the authorization collections and the
// permission sets that let employees claim/return and the admin manage assets.
// ---------------------------------------------------------------------------

export default class AssetProvider extends ServiceProvider<Application> {
  public readonly name: string = `${APP_PACKAGE_NAME}/asset-provider`;

  public override register(): void {
    this.app.container.instance(
      assetServiceToken,
      new DatabaseAssetService(
        this.app.container.resolve(databaseManagerToken),
      ),
    );
  }

  public override async boot(): Promise<void> {
    const authz = this.app.container.resolve(authorizationToken);
    const database = this.app.container.resolve(databaseManagerToken);
    await provisionAssetAuthorization(authz, database);
  }
}

/**
 * Registers the IT asset authorization collections and permission sets and
 * assigns them to the default administrator and to every signed-in user.
 * Extracted from the provider so tests can exercise the exact provisioning
 * the application runs at boot.
 */
export async function provisionAssetAuthorization(
  authz: AppAuthorization,
  database: DatabaseManager,
): Promise<void> {
  authz.database.collections.add({
    name: 'itAssets',
    title: 'IT Assets',
    actions: ['read', 'create', 'update', 'delete', 'claim', 'return'],
    fields: [
      'id',
      'assetNumber',
      'name',
      'type',
      'brandModel',
      'status',
      'currentEmployeeId',
      'purchasedAt',
      'remark',
      'createdAt',
    ],
  });
  authz.database.collections.add({
    name: 'itAssetRecords',
    title: 'IT Asset Claim Records',
    actions: ['read'],
    fields: [
      'id',
      'assetId',
      'employeeId',
      'claimedAt',
      'returnedAt',
      'status',
      'remark',
      'createdAt',
    ],
  });
  authz.database.collections.add({
    name: 'itEmployees',
    title: 'IT Employees',
    actions: ['read'],
    fields: ['id', 'name', 'department', 'email', 'isAdmin'],
  });

  // Page access: the assets list, records and detail pages are part of the
  // application's own navigation, so both the admin and every signed-in
  // employee need the matching `page` grants. The system-administrator role
  // already carries `page *`; the employee set is what opens the pages to
  // regular users (it is assigned to `authenticated:*` below).
  const pageGrants = [
    {
      resource: { type: 'page', id: 'assets' },
      actions: [{ action: 'access' }],
    },
    {
      resource: { type: 'page', id: 'assetRecords' },
      actions: [{ action: 'access' }],
    },
    {
      resource: { type: 'page', id: 'assetDetail' },
      actions: [{ action: 'access' }],
    },
  ];

  const adminGrants = [
    ...pageGrants,
    authz.database.grant('itAssets', {
      read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
      create: { fields: { input: '*' }, recordAccess: ['allRecords'] },
      update: { fields: { input: '*' }, recordAccess: ['allRecords'] },
      delete: { recordAccess: ['allRecords'] },
      claim: { recordAccess: ['allRecords'] },
      return: { recordAccess: ['allRecords'] },
    }),
    authz.database.grant('itAssetRecords', {
      read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
    }),
    authz.database.grant('itEmployees', {
      read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
    }),
  ];
  const employeeGrants = [
    ...pageGrants,
    authz.database.grant('itAssets', {
      read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
      claim: { recordAccess: ['allRecords'] },
      return: { recordAccess: ['allRecords'] },
    }),
    authz.database.grant('itAssetRecords', {
      read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
    }),
    authz.database.grant('itEmployees', {
      read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
    }),
  ];

  // Create or refresh the business permission sets on every boot so an
  // existing database (e.g. one seeded by an earlier build) converges to the
  // same grants, including the page grants above. The sets are owned by this
  // provider, so the boot-time grants are the source of truth.
  const adminSet = await authz.permissionSets.get('it-asset-admin');
  if (adminSet) {
    await authz.permissionSets.update('it-asset-admin', {
      key: 'it-asset-admin',
      title: 'IT Asset Administrator',
      grants: adminGrants,
    });
  } else {
    await authz.permissionSets.create({
      key: 'it-asset-admin',
      title: 'IT Asset Administrator',
      grants: adminGrants,
    });
  }
  const employeeSet = await authz.permissionSets.get('it-asset-employee');
  if (employeeSet) {
    await authz.permissionSets.update('it-asset-employee', {
      key: 'it-asset-employee',
      title: 'IT Asset Employee',
      grants: employeeGrants,
    });
  } else {
    await authz.permissionSets.create({
      key: 'it-asset-employee',
      title: 'IT Asset Employee',
      grants: employeeGrants,
    });
  }

  // The default administrator (admin@nocobase.com) manages assets.
  const adminUser = await database
    .query()
    .selectFrom('user')
    .select(['id'])
    .where('email', '=', 'admin@nocobase.com')
    .executeTakeFirst();
  if (adminUser) {
    const assignments =
      await authz.permissionSets.listAssignments('it-asset-admin');
    const assigned = assignments.some(
      (assignment) =>
        assignment.subject.type === 'user' &&
        assignment.subject.id === String(adminUser.id),
    );
    if (!assigned) {
      await authz.permissionSets.assign({
        permissionSet: 'it-asset-admin',
        subject: { type: 'user', id: String(adminUser.id) },
      });
    }
  }

  // Every signed-in user may view assets and claim/return them.
  const employeeAssignments =
    await authz.permissionSets.listAssignments('it-asset-employee');
  const assignedToAll = employeeAssignments.some(
    (assignment) =>
      assignment.subject.type === 'authenticated' &&
      assignment.subject.id === '*',
  );
  if (!assignedToAll) {
    await authz.permissionSets.assign({
      permissionSet: 'it-asset-employee',
      subject: { type: 'authenticated', id: '*' },
    });
  }
}
