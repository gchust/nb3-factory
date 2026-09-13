import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type QueryAdapter,
  type Row,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * Domain logic for the IT operations suite. Routes own HTTP concerns and authorization; every rule
 * that must hold regardless of who calls — asset-code uniqueness, one open checkout per asset, and
 * the ticket status sequence — lives here so it can be tested directly.
 */

export type AssetCategory = 'computer' | 'monitor' | 'network' | 'office';
export type AssetStatus = 'in_use' | 'idle' | 'repairing' | 'scrapped';
export type WorkOrderPriority = 'low' | 'medium' | 'high';
export type WorkOrderStatus =
  'pending' | 'in_progress' | 'completed' | 'closed';

export interface ItFileView {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface ItAssetView {
  readonly id: number;
  readonly assetCode: string;
  readonly name: string;
  readonly category: string;
  readonly brandModel: string | null;
  readonly purchaseDate: string | null;
  readonly purchaseAmount: number | null;
  readonly status: string;
  readonly currentHolder: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly files: readonly ItFileView[];
  readonly openAssignment: ItAssignmentView | null;
}

export interface ItAssignmentView {
  readonly id: number;
  readonly assetId: number;
  readonly assetCode: string | null;
  readonly assetName: string | null;
  readonly employeeName: string;
  readonly assignedAt: string | null;
  readonly returnedAt: string | null;
  readonly note: string | null;
}

export interface ItWorkOrderLogView {
  readonly id: number;
  readonly workOrderId: number;
  readonly content: string;
  readonly authorName: string;
  readonly createdAt: string | null;
}

export interface ItWorkOrderView {
  readonly id: number;
  readonly orderNo: string;
  readonly reporterName: string;
  readonly reporterId: string;
  readonly assetId: number | null;
  readonly assetCode: string | null;
  readonly assetName: string | null;
  readonly location: string | null;
  readonly description: string;
  readonly priority: string;
  readonly status: string;
  readonly assignee: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly files: readonly ItFileView[];
  readonly logs: readonly ItWorkOrderLogView[];
}

export interface ItDashboard {
  readonly assetsByStatus: Readonly<Record<string, number>>;
  readonly workOrdersByPriority: Readonly<Record<string, number>>;
  readonly completedWorkOrders: number;
  readonly averageCompletionHours: number | null;
}

export interface CreateAssetInput {
  readonly assetCode: string;
  readonly name: string;
  readonly category: string;
  readonly brandModel?: string | null;
  readonly purchaseDate?: string | null;
  readonly purchaseAmount?: number | null;
  readonly status?: string;
  readonly currentHolder?: string | null;
  readonly fileIds?: readonly string[];
}

export type UpdateAssetInput = Partial<CreateAssetInput>;

export interface CreateAssignmentInput {
  readonly assetId: number;
  readonly employeeName: string;
  readonly assignedAt?: string | null;
  readonly note?: string | null;
}

export interface CreateWorkOrderInput {
  readonly reporterName: string;
  readonly reporterId: string;
  readonly assetId?: number | null;
  readonly location?: string | null;
  readonly description: string;
  readonly priority: string;
  readonly fileIds?: readonly string[];
}

export interface AssetFilter {
  readonly category?: string;
  readonly status?: string;
  readonly search?: string;
}

export class ItError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ItError';
    this.code = code;
    this.status = status;
  }
}

export interface ItService {
  listAssets(filter?: AssetFilter): Promise<readonly ItAssetView[]>;
  getAsset(id: number): Promise<ItAssetView>;
  createAsset(input: CreateAssetInput): Promise<ItAssetView>;
  updateAsset(id: number, input: UpdateAssetInput): Promise<ItAssetView>;
  deleteAsset(id: number): Promise<void>;
  listAssignments(options?: {
    assetId?: number;
  }): Promise<readonly ItAssignmentView[]>;
  createAssignment(input: CreateAssignmentInput): Promise<ItAssignmentView>;
  returnAssignment(
    id: number,
    returnedAt?: string | null,
  ): Promise<ItAssignmentView>;
  listWorkOrders(options?: {
    reporterId?: string;
  }): Promise<readonly ItWorkOrderView[]>;
  getWorkOrder(id: number): Promise<ItWorkOrderView>;
  createWorkOrder(input: CreateWorkOrderInput): Promise<ItWorkOrderView>;
  transitionWorkOrder(
    id: number,
    nextStatus: string,
    actorName: string,
  ): Promise<ItWorkOrderView>;
  addWorkOrderLog(
    id: number,
    content: string,
    authorName: string,
  ): Promise<ItWorkOrderLogView>;
  dashboard(): Promise<ItDashboard>;
}

export const itServiceToken: ServiceToken<ItService> =
  createServiceToken<ItService>('app/it-service');

const ASSET_STATUSES = ['in_use', 'idle', 'repairing', 'scrapped'] as const;
const ASSET_CATEGORIES = ['computer', 'monitor', 'network', 'office'] as const;
const PRIORITIES = ['low', 'medium', 'high'] as const;
const STATUS_FLOW: Readonly<Record<string, string | undefined>> = {
  pending: 'in_progress',
  in_progress: 'completed',
  completed: 'closed',
};

export default class ItServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/it-service';

  public override register(): void {
    this.app.container.singleton(itServiceToken, () =>
      createItService(this.app.container.resolve(databaseManagerToken)),
    );
  }
}

export function createItService(database: DatabaseManager): ItService {
  return new ItServiceImpl(database);
}

class ItServiceImpl implements ItService {
  constructor(private readonly database: DatabaseManager) {}

  public async listAssets(
    filter: AssetFilter = {},
  ): Promise<readonly ItAssetView[]> {
    let query = this.database.query().selectFrom('itAssets').selectAll();
    if (filter.category) {
      query = query.where('category', '=', filter.category);
    }
    if (filter.status) {
      query = query.where('status', '=', filter.status);
    }
    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      query = query.where((eb) =>
        eb.or([eb('assetCode', 'like', term), eb('name', 'like', term)]),
      );
    }
    const rows = await query.orderBy('id', 'desc').execute();
    const files = await loadFiles(
      this.database.query(),
      'itAssetFiles',
      'assetId',
      rows.map((row) => numberValue(row.id)),
    );
    const openAssignments = await loadOpenAssignments(
      this.database.query(),
      rows.map((row) => numberValue(row.id)),
    );
    return rows.map((row) =>
      mapAsset(
        row,
        files.get(numberValue(row.id)) ?? [],
        openAssignments.get(numberValue(row.id)) ?? null,
      ),
    );
  }

  public async getAsset(id: number): Promise<ItAssetView> {
    const row = await this.database
      .query()
      .selectFrom('itAssets')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new ItError('ASSET_NOT_FOUND', 'Asset not found.', 404);
    const files = await loadFiles(
      this.database.query(),
      'itAssetFiles',
      'assetId',
      [id],
    );
    const openAssignments = await loadOpenAssignments(this.database.query(), [
      id,
    ]);
    return mapAsset(row, files.get(id) ?? [], openAssignments.get(id) ?? null);
  }

  public async createAsset(input: CreateAssetInput): Promise<ItAssetView> {
    const normalized = normalizeAssetInput(input);
    return this.database.transaction(async (connection) => {
      const query = connection.query;
      const duplicate = await query
        .selectFrom('itAssets')
        .select('id')
        .where('assetCode', '=', normalized.assetCode)
        .executeTakeFirst();
      if (duplicate) {
        throw new ItError(
          'ASSET_CODE_EXISTS',
          `资产编号 ${normalized.assetCode} 已存在，请更换编号后重试。`,
          409,
        );
      }
      const now = new Date();
      await query
        .insertInto('itAssets')
        .values({
          assetCode: normalized.assetCode,
          name: normalized.name,
          category: normalized.category,
          brandModel: normalized.brandModel ?? null,
          purchaseDate: parseDate(normalized.purchaseDate),
          purchaseAmount: normalized.purchaseAmount ?? null,
          status: normalized.status,
          currentHolder: normalized.currentHolder ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const created = await query
        .selectFrom('itAssets')
        .select('id')
        .where('assetCode', '=', normalized.assetCode)
        .executeTakeFirstOrThrow();
      const id = numberValue(created.id);
      await replaceLinks(query, 'itAssetFiles', 'assetId', id, input.fileIds);
      return this.getAssetWith(connection.query, id);
    });
  }

  public async updateAsset(
    id: number,
    input: UpdateAssetInput,
  ): Promise<ItAssetView> {
    return this.database.transaction(async (connection) => {
      const query = connection.query;
      const existing = await query
        .selectFrom('itAssets')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!existing) {
        throw new ItError('ASSET_NOT_FOUND', 'Asset not found.', 404);
      }
      const patch: Row = { updatedAt: new Date() };
      if (input.assetCode !== undefined) {
        const code = requiredText(input.assetCode, 'assetCode');
        const duplicate = await query
          .selectFrom('itAssets')
          .select('id')
          .where('assetCode', '=', code)
          .where('id', '!=', id)
          .executeTakeFirst();
        if (duplicate) {
          throw new ItError(
            'ASSET_CODE_EXISTS',
            `资产编号 ${code} 已存在，请更换编号后重试。`,
            409,
          );
        }
        patch.assetCode = code;
      }
      if (input.name !== undefined) {
        patch.name = requiredText(input.name, 'name');
      }
      if (input.category !== undefined) {
        patch.category = validateCategory(input.category);
      }
      if (input.brandModel !== undefined) {
        patch.brandModel = optionalText(input.brandModel);
      }
      if (input.purchaseDate !== undefined) {
        patch.purchaseDate = parseDate(input.purchaseDate);
      }
      if (input.purchaseAmount !== undefined) {
        patch.purchaseAmount = parseAmount(input.purchaseAmount);
      }
      if (input.status !== undefined) {
        patch.status = validateAssetStatus(input.status);
      }
      if (input.currentHolder !== undefined) {
        patch.currentHolder = optionalText(input.currentHolder);
      }
      await query
        .updateTable('itAssets')
        .set(patch)
        .where('id', '=', id)
        .execute();
      if (input.fileIds !== undefined) {
        await replaceLinks(query, 'itAssetFiles', 'assetId', id, input.fileIds);
      }
      if (input.status === 'idle' || input.status === 'scrapped') {
        await query
          .updateTable('itAssets')
          .set({ currentHolder: null })
          .where('id', '=', id)
          .execute();
      }
      return this.getAssetWith(connection.query, id);
    });
  }

  public async deleteAsset(id: number): Promise<void> {
    const result = await this.database
      .query()
      .deleteFrom('itAssets')
      .where('id', '=', id)
      .execute();
    if ((result.deletedCount ?? 0) === 0) {
      throw new ItError('ASSET_NOT_FOUND', 'Asset not found.', 404);
    }
    await this.database
      .query()
      .deleteFrom('itAssetFiles')
      .where('assetId', '=', id)
      .execute();
  }

  public async listAssignments(options?: {
    assetId?: number;
  }): Promise<readonly ItAssignmentView[]> {
    let query = this.database
      .query()
      .selectFrom('itAssetAssignments')
      .selectAll();
    if (options?.assetId !== undefined) {
      query = query.where('assetId', '=', options.assetId);
    }
    const rows = await query.orderBy('id', 'desc').execute();
    const assets = await loadAssetIndex(
      this.database.query(),
      rows.map((row) => numberValue(row.assetId)),
    );
    return rows.map((row) => mapAssignment(row, assets));
  }

  public async createAssignment(
    input: CreateAssignmentInput,
  ): Promise<ItAssignmentView> {
    if (!Number.isFinite(input.assetId)) {
      throw new ItError('INVALID_INPUT', '必须选择资产。');
    }
    const employeeName = requiredText(input.employeeName, 'employeeName');
    return this.database.transaction(async (connection) => {
      const query = connection.query;
      const asset = await query
        .selectFrom('itAssets')
        .select(['id', 'assetCode', 'name'])
        .where('id', '=', input.assetId)
        .executeTakeFirst();
      if (!asset) throw new ItError('ASSET_NOT_FOUND', '资产不存在。', 404);
      const open = await query
        .selectFrom('itAssetAssignments')
        .select('id')
        .where('assetId', '=', input.assetId)
        .where('returnedAt', 'is', null)
        .executeTakeFirst();
      if (open) {
        throw new ItError(
          'ASSIGNMENT_ALREADY_OPEN',
          '该资产存在未归还的领用记录，请先登记归还后再领用。',
          409,
        );
      }
      const now = new Date();
      await query
        .insertInto('itAssetAssignments')
        .values({
          assetId: input.assetId,
          employeeName,
          assignedAt: parseDate(input.assignedAt) ?? now,
          returnedAt: null,
          note: optionalText(input.note),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .updateTable('itAssets')
        .set({
          status: 'in_use',
          currentHolder: employeeName,
          updatedAt: now,
        })
        .where('id', '=', input.assetId)
        .execute();
      const created = await query
        .selectFrom('itAssetAssignments')
        .selectAll()
        .where('assetId', '=', input.assetId)
        .where('returnedAt', 'is', null)
        .orderBy('id', 'desc')
        .executeTakeFirstOrThrow();
      return mapAssignment(
        created,
        await loadAssetIndex(query, [input.assetId]),
      );
    });
  }

  public async returnAssignment(
    id: number,
    returnedAt?: string | null,
  ): Promise<ItAssignmentView> {
    return this.database.transaction(async (connection) => {
      const query = connection.query;
      const existing = await query
        .selectFrom('itAssetAssignments')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!existing) {
        throw new ItError('ASSIGNMENT_NOT_FOUND', '领用记录不存在。', 404);
      }
      const now = new Date();
      await query
        .updateTable('itAssetAssignments')
        .set({ returnedAt: parseDate(returnedAt) ?? now, updatedAt: now })
        .where('id', '=', id)
        .execute();
      const assetId = numberValue(existing.assetId);
      const stillOpen = await query
        .selectFrom('itAssetAssignments')
        .select('id')
        .where('assetId', '=', assetId)
        .where('returnedAt', 'is', null)
        .executeTakeFirst();
      if (!stillOpen) {
        await query
          .updateTable('itAssets')
          .set({ status: 'idle', currentHolder: null, updatedAt: now })
          .where('id', '=', assetId)
          .execute();
      }
      const updated = await query
        .selectFrom('itAssetAssignments')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      return mapAssignment(updated, await loadAssetIndex(query, [assetId]));
    });
  }

  public async listWorkOrders(options?: {
    reporterId?: string;
  }): Promise<readonly ItWorkOrderView[]> {
    let query = this.database.query().selectFrom('itWorkOrders').selectAll();
    if (options?.reporterId !== undefined) {
      query = query.where('reporterId', '=', options.reporterId);
    }
    const rows = await query.orderBy('id', 'desc').execute();
    const ids = rows.map((row) => numberValue(row.id));
    const [files, logs, assets] = await Promise.all([
      loadFiles(this.database.query(), 'itWorkOrderFiles', 'workOrderId', ids),
      loadLogs(this.database.query(), ids),
      loadAssetIndex(
        this.database.query(),
        rows
          .map((row) => optionalNumber(row.assetId))
          .filter((value): value is number => value !== null),
      ),
    ]);
    return rows.map((row) =>
      mapWorkOrder(
        row,
        files.get(numberValue(row.id)) ?? [],
        logs.get(numberValue(row.id)) ?? [],
        assets,
      ),
    );
  }

  public async getWorkOrder(id: number): Promise<ItWorkOrderView> {
    const row = await this.database
      .query()
      .selectFrom('itWorkOrders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      throw new ItError('WORK_ORDER_NOT_FOUND', 'Work order not found.', 404);
    }
    const [files, logs, assets] = await Promise.all([
      loadFiles(this.database.query(), 'itWorkOrderFiles', 'workOrderId', [id]),
      loadLogs(this.database.query(), [id]),
      loadAssetIndex(
        this.database.query(),
        optionalNumber(row.assetId) === null ? [] : [numberValue(row.assetId)],
      ),
    ]);
    return mapWorkOrder(row, files.get(id) ?? [], logs.get(id) ?? [], assets);
  }

  public async createWorkOrder(
    input: CreateWorkOrderInput,
  ): Promise<ItWorkOrderView> {
    const description = requiredText(input.description, 'description');
    const priority = validatePriority(input.priority);
    const reporterName = requiredText(input.reporterName, 'reporterName');
    const reporterId = requiredText(input.reporterId, 'reporterId');
    const assetId = optionalNumber(input.assetId ?? null);
    if (assetId !== null) {
      const asset = await this.database
        .query()
        .selectFrom('itAssets')
        .select('id')
        .where('id', '=', assetId)
        .executeTakeFirst();
      if (!asset) throw new ItError('ASSET_NOT_FOUND', '资产不存在。', 404);
    }
    return this.database.transaction(async (connection) => {
      const query = connection.query;
      const now = new Date();
      const orderNo = await nextOrderNo(query);
      await query
        .insertInto('itWorkOrders')
        .values({
          orderNo,
          reporterName,
          reporterId,
          assetId,
          location: optionalText(input.location),
          description,
          priority,
          status: 'pending',
          assignee: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const created = await query
        .selectFrom('itWorkOrders')
        .selectAll()
        .where('orderNo', '=', orderNo)
        .executeTakeFirstOrThrow();
      const id = numberValue(created.id);
      await replaceLinks(
        query,
        'itWorkOrderFiles',
        'workOrderId',
        id,
        input.fileIds,
      );
      const [files, logs, assets] = await Promise.all([
        loadFiles(query, 'itWorkOrderFiles', 'workOrderId', [id]),
        loadLogs(query, [id]),
        loadAssetIndex(query, assetId === null ? [] : [assetId]),
      ]);
      return mapWorkOrder(
        created,
        files.get(id) ?? [],
        logs.get(id) ?? [],
        assets,
      );
    });
  }

  public async transitionWorkOrder(
    id: number,
    nextStatus: string,
    actorName: string,
  ): Promise<ItWorkOrderView> {
    return this.database.transaction(async (connection) => {
      const query = connection.query;
      const existing = await query
        .selectFrom('itWorkOrders')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!existing) {
        throw new ItError('WORK_ORDER_NOT_FOUND', 'Work order not found.', 404);
      }
      const current = String(existing.status);
      const allowed = STATUS_FLOW[current];
      if (nextStatus !== current && nextStatus !== allowed) {
        throw new ItError(
          'INVALID_STATUS_TRANSITION',
          `工单状态只能按 待受理 → 处理中 → 已完成 → 已关闭 的顺序推进，不能从“${statusLabel(current)}”直接变为“${statusLabel(nextStatus)}”。`,
          409,
        );
      }
      const now = new Date();
      const patch: Row = { status: nextStatus, updatedAt: now };
      if (nextStatus === 'in_progress' && !existing.assignee) {
        patch.assignee = actorName;
      }
      if (nextStatus === 'completed') {
        patch.completedAt = now;
      }
      await query
        .updateTable('itWorkOrders')
        .set(patch)
        .where('id', '=', id)
        .execute();
      const updated = await query
        .selectFrom('itWorkOrders')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      const [files, logs, assets] = await Promise.all([
        loadFiles(query, 'itWorkOrderFiles', 'workOrderId', [id]),
        loadLogs(query, [id]),
        loadAssetIndex(
          query,
          optionalNumber(updated.assetId) === null
            ? []
            : [numberValue(updated.assetId)],
        ),
      ]);
      return mapWorkOrder(
        updated,
        files.get(id) ?? [],
        logs.get(id) ?? [],
        assets,
      );
    });
  }

  public async addWorkOrderLog(
    id: number,
    content: string,
    authorName: string,
  ): Promise<ItWorkOrderLogView> {
    const text = requiredText(content, 'content');
    const order = await this.database
      .query()
      .selectFrom('itWorkOrders')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!order) {
      throw new ItError('WORK_ORDER_NOT_FOUND', 'Work order not found.', 404);
    }
    const now = new Date();
    await this.database
      .query()
      .insertInto('itWorkOrderLogs')
      .values({
        workOrderId: id,
        content: text,
        authorName: requiredText(authorName, 'authorName'),
        createdAt: now,
      })
      .execute();
    const created = await this.database
      .query()
      .selectFrom('itWorkOrderLogs')
      .selectAll()
      .where('workOrderId', '=', id)
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    return mapLog(created);
  }

  public async dashboard(): Promise<ItDashboard> {
    const [assetRows, orderRows] = await Promise.all([
      this.database.query().selectFrom('itAssets').select(['status']).execute(),
      this.database
        .query()
        .selectFrom('itWorkOrders')
        .select(['priority', 'status', 'createdAt', 'completedAt'])
        .execute(),
    ]);

    const assetsByStatus: Record<string, number> = {};
    for (const status of ASSET_STATUSES) assetsByStatus[status] = 0;
    for (const row of assetRows) {
      const status = String(row.status);
      assetsByStatus[status] = (assetsByStatus[status] ?? 0) + 1;
    }

    const workOrdersByPriority: Record<string, number> = {};
    for (const priority of PRIORITIES) workOrdersByPriority[priority] = 0;
    for (const row of orderRows) {
      const priority = String(row.priority);
      workOrdersByPriority[priority] =
        (workOrdersByPriority[priority] ?? 0) + 1;
    }

    const durations: number[] = [];
    for (const row of orderRows) {
      if (row.status !== 'completed' && row.status !== 'closed') continue;
      const start = toDate(row.createdAt);
      const end = toDate(row.completedAt);
      if (start && end) durations.push(end.getTime() - start.getTime());
    }
    const averageCompletionHours =
      durations.length === 0
        ? null
        : round(
            durations.reduce((sum, value) => sum + value, 0) /
              durations.length /
              (1000 * 60 * 60),
          );

    return {
      assetsByStatus,
      workOrdersByPriority,
      completedWorkOrders: durations.length,
      averageCompletionHours,
    };
  }

  private async getAssetWith(
    query: QueryAdapter,
    id: number,
  ): Promise<ItAssetView> {
    const row = await query
      .selectFrom('itAssets')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    const files = await loadFiles(query, 'itAssetFiles', 'assetId', [id]);
    const openAssignments = await loadOpenAssignments(query, [id]);
    return mapAsset(row, files.get(id) ?? [], openAssignments.get(id) ?? null);
  }
}

function normalizeAssetInput(input: CreateAssetInput): {
  assetCode: string;
  name: string;
  category: string;
  brandModel: string | null;
  purchaseDate: string | null;
  purchaseAmount: number | null;
  status: string;
  currentHolder: string | null;
} {
  return {
    assetCode: requiredText(input.assetCode, 'assetCode'),
    name: requiredText(input.name, 'name'),
    category: validateCategory(input.category),
    brandModel: optionalText(input.brandModel),
    purchaseDate: input.purchaseDate ?? null,
    purchaseAmount: parseAmount(input.purchaseAmount),
    status: validateAssetStatus(input.status ?? 'idle'),
    currentHolder: optionalText(input.currentHolder),
  };
}

async function nextOrderNo(query: QueryAdapter): Promise<string> {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `WO-${stamp}-${String(
      Math.floor(Math.random() * 10_000),
    ).padStart(4, '0')}`;
    const existing = await query
      .selectFrom('itWorkOrders')
      .select('id')
      .where('orderNo', '=', candidate)
      .executeTakeFirst();
    if (!existing) return candidate;
  }
  return `WO-${stamp}-${Date.now().toString(36).toUpperCase()}`;
}

async function replaceLinks(
  query: QueryAdapter,
  table: string,
  column: string,
  recordId: number,
  fileIds: readonly string[] | undefined,
): Promise<void> {
  if (fileIds === undefined) return;
  await query.deleteFrom(table).where(column, '=', recordId).execute();
  const unique = [
    ...new Set(
      fileIds.filter(
        (id): id is string => typeof id === 'string' && id.trim().length > 0,
      ),
    ),
  ];
  if (unique.length === 0) return;
  const now = new Date();
  await query
    .insertInto(table)
    .values(
      unique.map((fileId) => ({
        [column]: recordId,
        fileId,
        createdAt: now,
      })),
    )
    .execute();
}

async function loadFiles(
  query: QueryAdapter,
  linkTable: string,
  column: string,
  recordIds: readonly number[],
): Promise<Map<number, ItFileView[]>> {
  const result = new Map<number, ItFileView[]>();
  if (recordIds.length === 0) return result;
  const links = await query
    .selectFrom(linkTable)
    .selectAll()
    .where(column, 'in', [...recordIds])
    .execute();
  if (links.length === 0) return result;
  const fileIds = [...new Set(links.map((link) => String(link.fileId)))];
  const files = await query
    .selectFrom('itFiles')
    .selectAll()
    .where('id', 'in', fileIds)
    .execute();
  const byId = new Map(files.map((file) => [String(file.id), mapFile(file)]));
  for (const link of links) {
    const recordId = numberValue(link[column]);
    const file = byId.get(String(link.fileId));
    if (!file) continue;
    const list = result.get(recordId) ?? [];
    list.push(file);
    result.set(recordId, list);
  }
  return result;
}

async function loadOpenAssignments(
  query: QueryAdapter,
  assetIds: readonly number[],
): Promise<Map<number, ItAssignmentView>> {
  const result = new Map<number, ItAssignmentView>();
  if (assetIds.length === 0) return result;
  const rows = await query
    .selectFrom('itAssetAssignments')
    .selectAll()
    .where('assetId', 'in', [...assetIds])
    .where('returnedAt', 'is', null)
    .execute();
  const assets = await loadAssetIndex(query, assetIds);
  for (const row of rows) {
    result.set(numberValue(row.assetId), mapAssignment(row, assets));
  }
  return result;
}

async function loadAssetIndex(
  query: QueryAdapter,
  assetIds: readonly number[],
): Promise<Map<number, { assetCode: string; name: string }>> {
  const result = new Map<number, { assetCode: string; name: string }>();
  if (assetIds.length === 0) return result;
  const unique = [...new Set(assetIds)];
  const rows = await query
    .selectFrom('itAssets')
    .select(['id', 'assetCode', 'name'])
    .where('id', 'in', unique)
    .execute();
  for (const row of rows) {
    result.set(numberValue(row.id), {
      assetCode: String(row.assetCode),
      name: String(row.name),
    });
  }
  return result;
}

async function loadLogs(
  query: QueryAdapter,
  workOrderIds: readonly number[],
): Promise<Map<number, ItWorkOrderLogView[]>> {
  const result = new Map<number, ItWorkOrderLogView[]>();
  if (workOrderIds.length === 0) return result;
  const rows = await query
    .selectFrom('itWorkOrderLogs')
    .selectAll()
    .where('workOrderId', 'in', [...workOrderIds])
    .orderBy('id', 'asc')
    .execute();
  for (const row of rows) {
    const id = numberValue(row.workOrderId);
    const list = result.get(id) ?? [];
    list.push(mapLog(row));
    result.set(id, list);
  }
  return result;
}

function mapAsset(
  row: Row,
  files: readonly ItFileView[],
  openAssignment: ItAssignmentView | null,
): ItAssetView {
  return {
    id: numberValue(row.id),
    assetCode: String(row.assetCode),
    name: String(row.name),
    category: String(row.category),
    brandModel: textOrNull(row.brandModel),
    purchaseDate: isoOrNull(row.purchaseDate),
    purchaseAmount: optionalNumber(row.purchaseAmount),
    status: String(row.status),
    currentHolder: textOrNull(row.currentHolder),
    createdAt: isoOrNull(row.createdAt),
    updatedAt: isoOrNull(row.updatedAt),
    files,
    openAssignment,
  };
}

function mapAssignment(
  row: Row,
  assets: Map<number, { assetCode: string; name: string }>,
): ItAssignmentView {
  const assetId = numberValue(row.assetId);
  const asset = assets.get(assetId);
  return {
    id: numberValue(row.id),
    assetId,
    assetCode: asset?.assetCode ?? null,
    assetName: asset?.name ?? null,
    employeeName: String(row.employeeName),
    assignedAt: isoOrNull(row.assignedAt),
    returnedAt: isoOrNull(row.returnedAt),
    note: textOrNull(row.note),
  };
}

function mapWorkOrder(
  row: Row,
  files: readonly ItFileView[],
  logs: readonly ItWorkOrderLogView[],
  assets: Map<number, { assetCode: string; name: string }>,
): ItWorkOrderView {
  const assetId = optionalNumber(row.assetId);
  const asset = assetId === null ? undefined : assets.get(assetId);
  return {
    id: numberValue(row.id),
    orderNo: String(row.orderNo),
    reporterName: String(row.reporterName),
    reporterId: String(row.reporterId),
    assetId,
    assetCode: asset?.assetCode ?? null,
    assetName: asset?.name ?? null,
    location: textOrNull(row.location),
    description: String(row.description),
    priority: String(row.priority),
    status: String(row.status),
    assignee: textOrNull(row.assignee),
    completedAt: isoOrNull(row.completedAt),
    createdAt: isoOrNull(row.createdAt),
    updatedAt: isoOrNull(row.updatedAt),
    files,
    logs,
  };
}

function mapLog(row: Row): ItWorkOrderLogView {
  return {
    id: numberValue(row.id),
    workOrderId: numberValue(row.workOrderId),
    content: String(row.content),
    authorName: String(row.authorName),
    createdAt: isoOrNull(row.createdAt),
  };
}

function mapFile(row: Row): ItFileView {
  return {
    id: String(row.id),
    filename: String(row.filename),
    ext: String(row.ext),
    mimeType: String(row.mimeType),
    size: numberValue(row.size),
  };
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待受理',
    in_progress: '处理中',
    completed: '已完成',
    closed: '已关闭',
  };
  return labels[status] ?? status;
}

function requiredText(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new ItError('INVALID_INPUT', `缺少必填字段：${field}。`);
  }
  return text;
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function optionalText(value: unknown): string | null {
  const text = asText(value)?.trim() ?? '';
  return text.length > 0 ? text : null;
}

function validateCategory(value: unknown): string {
  const category = asText(value) ?? '';
  if (!(ASSET_CATEGORIES as readonly string[]).includes(category)) {
    throw new ItError('INVALID_INPUT', `未知的资产分类：${category}。`);
  }
  return category;
}

function validateAssetStatus(value: unknown): string {
  const status = asText(value) ?? '';
  if (!(ASSET_STATUSES as readonly string[]).includes(status)) {
    throw new ItError('INVALID_INPUT', `未知的资产状态：${status}。`);
  }
  return status;
}

function validatePriority(value: unknown): string {
  const priority = asText(value) ?? '';
  if (!(PRIORITIES as readonly string[]).includes(priority)) {
    throw new ItError('INVALID_INPUT', `未知的优先级：${priority}。`);
  }
  return priority;
}

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ItError('INVALID_INPUT', '采购金额必须是非负数字。');
  }
  return round(amount);
}

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = toDate(value);
  if (!date) {
    throw new ItError('INVALID_INPUT', `无效的日期：${asText(value) ?? ''}。`);
  }
  return date;
}

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const numeric = new Date(value);
    return Number.isNaN(numeric.getTime()) ? null : numeric;
  }
  const text = asText(value);
  if (text === null) return null;
  // SQLite stores datetimes as epoch milliseconds and returns them as strings.
  if (/^-?\d+(\.\d+)?$/.test(text.trim())) {
    const numeric = new Date(Number(text));
    return Number.isNaN(numeric.getTime()) ? null : numeric;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoOrNull(value: unknown): string | null {
  const date = toDate(value);
  if (date) return date.toISOString();
  const text = asText(value);
  return text ? text : null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: unknown): string | null {
  const text = asText(value);
  return text !== null && text.length > 0 ? text : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
