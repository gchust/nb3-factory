import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
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

/** Roles are Authorization Permission Sets assigned directly to users. */
export const QUALITY_SUPERVISOR_ROLE = 'quality-supervisor';
export const INSPECTOR_ROLE = 'inspector';
export const PRODUCTION_LEAD_ROLE = 'production-lead';
export const SYSTEM_ADMINISTRATOR_ROLE = 'system-administrator';

export type QualityTaskStatus = 'pending' | 'in_progress' | 'submitted';
export type QualityTaskResult = 'qualified' | 'unqualified';
export type QualityItemResult = 'pending' | 'qualified' | 'unqualified';
export type QualityNonconformanceStatus =
  'open' | 'processing' | 'pending_review' | 'closed' | 'returned';

export interface QualityActor {
  readonly id: string;
  readonly name: string;
  readonly roles: readonly string[];
}

export class QualityError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'QualityError';
  }
}

export interface ProductView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly specification: string | null;
  readonly unit: string;
  readonly status: string;
}

export interface BatchView {
  readonly id: string;
  readonly batchNo: string;
  readonly productId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly quantity: number;
  readonly productionLine: string | null;
  readonly producedAt: string;
  readonly status: string;
  readonly remark: string | null;
}

export interface InspectionItemView {
  readonly id: string;
  readonly seq: number;
  readonly name: string;
  readonly method: string | null;
  readonly standard: string | null;
  readonly unit: string | null;
  readonly result: QualityItemResult;
  readonly measuredValue: string | null;
  readonly remark: string | null;
}

export interface InspectionTaskView {
  readonly id: string;
  readonly taskNo: string;
  readonly batchId: string;
  readonly batchNo: string;
  readonly productId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly inspectorId: string;
  readonly inspectorName: string;
  readonly assignedLeadId: string | null;
  readonly assignedLeadName: string | null;
  readonly sampleSize: number;
  readonly status: QualityTaskStatus;
  readonly result: QualityTaskResult | null;
  readonly remark: string | null;
  readonly submittedAt: string | null;
  readonly createdAt: string;
  readonly itemCount: number;
  readonly completedItemCount: number;
  readonly failedItemCount: number;
}

export interface InspectionTaskDetail extends InspectionTaskView {
  readonly items: readonly InspectionItemView[];
  readonly nonconformances: readonly NonconformanceView[];
}

export type QualityReviewDecision = 'close' | 'return';

export interface NonconformanceReviewView {
  readonly id: string;
  readonly round: number;
  readonly decision: QualityReviewDecision;
  readonly comment: string | null;
  readonly reviewedById: string;
  readonly reviewedByName: string;
  readonly reviewedAt: string;
}

export interface NonconformanceView {
  readonly id: string;
  readonly code: string;
  readonly taskId: string;
  readonly taskNo: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly batchId: string;
  readonly batchNo: string;
  readonly productName: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: QualityNonconformanceStatus;
  readonly assignedToId: string;
  readonly assignedToName: string;
  /** Current handling round; starts at 1 and advances on every return. */
  readonly round: number;
  readonly reason: string | null;
  readonly measure: string | null;
  readonly handledAt: string | null;
  readonly reviewedById: string | null;
  readonly reviewedByName: string | null;
  readonly reviewedAt: string | null;
  readonly reviewComment: string | null;
  /** Every review decision, oldest first, retained after a return or close. */
  readonly reviews: readonly NonconformanceReviewView[];
  readonly createdAt: string;
}

export interface PassRateGroup {
  readonly productId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly total: number;
  readonly qualified: number;
  readonly unqualified: number;
  readonly passRate: number;
}

export interface PassRateSummary {
  readonly total: number;
  readonly qualified: number;
  readonly unqualified: number;
  readonly passRate: number;
  readonly groups: readonly PassRateGroup[];
}

export interface QualityCapabilities {
  readonly supervise: boolean;
  readonly inspect: boolean;
  readonly produce: boolean;
}

export interface QualitySession {
  readonly user: { readonly id: string; readonly name: string };
  readonly roles: readonly string[];
  readonly capabilities: QualityCapabilities;
}

export interface QualityUserOption {
  readonly id: string;
  readonly name: string;
}

/** Resolves a user's roles and account names without touching plugin internals. */
export interface QualityDirectory {
  rolesForUser(userId: string): Promise<readonly string[]>;
  listUsers(): Promise<readonly QualityUserOption[]>;
}

export interface QualityService {
  resolveActor(userId: string, userName: string): Promise<QualityActor>;
  session(actor: QualityActor): QualitySession;
  listProducts(): Promise<readonly ProductView[]>;
  createProduct(
    actor: QualityActor,
    input: Record<string, unknown>,
  ): Promise<ProductView>;
  listBatches(filter: BatchFilter): Promise<readonly BatchView[]>;
  createBatch(
    actor: QualityActor,
    input: Record<string, unknown>,
  ): Promise<BatchView>;
  listTasks(
    actor: QualityActor,
    filter: TaskFilter,
  ): Promise<readonly InspectionTaskView[]>;
  getTask(actor: QualityActor, taskId: string): Promise<InspectionTaskDetail>;
  createTask(
    actor: QualityActor,
    input: Record<string, unknown>,
  ): Promise<InspectionTaskDetail>;
  recordItem(
    actor: QualityActor,
    taskId: string,
    itemId: string,
    input: Record<string, unknown>,
  ): Promise<InspectionTaskDetail>;
  submitTask(
    actor: QualityActor,
    taskId: string,
  ): Promise<InspectionTaskDetail>;
  listNonconformances(
    actor: QualityActor,
    filter: NonconformanceFilter,
  ): Promise<readonly NonconformanceView[]>;
  getNonconformance(
    actor: QualityActor,
    id: string,
  ): Promise<NonconformanceView>;
  updateNonconformance(
    actor: QualityActor,
    id: string,
    input: Record<string, unknown>,
  ): Promise<NonconformanceView>;
  reviewNonconformance(
    actor: QualityActor,
    id: string,
    input: Record<string, unknown>,
  ): Promise<NonconformanceView>;
  /**
   * Supervision reassignment: moving a task to another inspector or a
   * rectification to another production lead. Access is resolved live from the
   * record, so the previous assignee loses access as soon as this succeeds.
   */
  reassignTask(
    actor: QualityActor,
    taskId: string,
    input: Record<string, unknown>,
  ): Promise<InspectionTaskDetail>;
  reassignNonconformance(
    actor: QualityActor,
    id: string,
    input: Record<string, unknown>,
  ): Promise<NonconformanceView>;
  passRate(actor: QualityActor): Promise<PassRateSummary>;
  assignableUsers(actor: QualityActor): Promise<{
    readonly inspectors: readonly QualityUserOption[];
    readonly productionLeads: readonly QualityUserOption[];
  }>;
}

export interface BatchFilter {
  readonly search?: string;
  readonly productId?: string;
  readonly status?: string;
}

export interface TaskFilter {
  readonly search?: string;
  readonly status?: string;
  readonly result?: string;
  readonly productId?: string;
  readonly submittedOnly?: boolean;
}

export interface NonconformanceFilter {
  readonly search?: string;
  readonly status?: string;
}

export const qualityServiceToken: ServiceToken<QualityService> =
  createServiceToken<QualityService>('app/quality-service');

export default class QualityProvider extends ServiceProvider<Application> {
  public readonly name = 'app/quality-provider';

  public override register(): void {
    this.app.container.singleton(qualityServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const directory = this.app.container.has(authorizationToken)
        ? createAuthorizationDirectory(
            this.app.container.resolve(authorizationToken),
          )
        : emptyDirectory();
      return createQualityService({ database, directory });
    });
  }
}

export function createAuthorizationDirectory(
  authorization: Pick<AppAuthorization, 'permissionSets' | 'administration'>,
): QualityDirectory {
  return {
    async rolesForUser(userId: string): Promise<readonly string[]> {
      const assignments = await authorization.permissionSets.listAssignments();
      return assignments
        .filter(
          (assignment) =>
            assignment.subject.type === 'user' &&
            assignment.subject.id === userId,
        )
        .map((assignment) => assignment.permissionSet);
    },
    async listUsers(): Promise<readonly QualityUserOption[]> {
      const users = await authorization.administration.listUsers();
      return users.map((user) => ({
        id: user.id,
        name: user.name || user.username || user.email,
      }));
    },
  };
}

function emptyDirectory(): QualityDirectory {
  return {
    rolesForUser: () => Promise.resolve([]),
    listUsers: () => Promise.resolve([]),
  };
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

interface QualityServiceOptions {
  readonly database: DatabaseManager;
  readonly directory: QualityDirectory;
}

interface ProductRow extends Row {
  id: string;
  code: string;
  name: string;
  specification: string | null;
  unit: string;
  status: string;
}

interface BatchRow extends Row {
  id: string;
  batchNo: string;
  productId: string;
  quantity: number;
  productionLine: string | null;
  producedAt: Date | string;
  status: string;
  remark: string | null;
}

interface TaskRow extends Row {
  id: string;
  taskNo: string;
  batchId: string;
  productId: string;
  inspectorId: string;
  supervisorId: string;
  assignedLeadId: string | null;
  sampleSize: number;
  status: QualityTaskStatus;
  result: QualityTaskResult | null;
  remark: string | null;
  submittedAt: Date | string | null;
  createdAt: Date | string;
}

interface ItemRow extends Row {
  id: string;
  taskId: string;
  seq: number;
  name: string;
  method: string | null;
  standard: string | null;
  unit: string | null;
  result: QualityItemResult;
  measuredValue: string | null;
  remark: string | null;
}

interface NonconformanceRow extends Row {
  id: string;
  code: string;
  taskId: string;
  itemId: string;
  batchId: string;
  productId: string;
  title: string;
  description: string | null;
  status: QualityNonconformanceStatus;
  assignedToId: string;
  round: number;
  reason: string | null;
  measure: string | null;
  handledAt: Date | string | null;
  reviewedById: string | null;
  reviewedAt: Date | string | null;
  reviewComment: string | null;
  createdAt: Date | string;
}

interface ReviewRow extends Row {
  id: string;
  nonconformanceId: string;
  round: number;
  decision: QualityReviewDecision;
  comment: string | null;
  reviewedById: string;
  reviewedAt: Date | string;
}

export function createQualityService(
  options: QualityServiceOptions,
): QualityService {
  const { database, directory } = options;

  const rolesOf = (actor: QualityActor): readonly string[] => actor.roles;
  const isSupervisor = (actor: QualityActor): boolean =>
    rolesOf(actor).includes(QUALITY_SUPERVISOR_ROLE) ||
    rolesOf(actor).includes(SYSTEM_ADMINISTRATOR_ROLE);
  const isInspector = (actor: QualityActor): boolean =>
    rolesOf(actor).includes(INSPECTOR_ROLE);
  const isProductionLead = (actor: QualityActor): boolean =>
    rolesOf(actor).includes(PRODUCTION_LEAD_ROLE);

  function requireSupervisor(actor: QualityActor): void {
    if (!isSupervisor(actor)) {
      throw new QualityError(
        'FORBIDDEN',
        'Only the quality supervisor may perform this action.',
        403,
      );
    }
  }

  async function userMap(): Promise<Map<string, string>> {
    const users = await directory.listUsers();
    return new Map(users.map((user) => [user.id, user.name]));
  }

  function nameOf(map: Map<string, string>, id: string | null): string {
    if (!id) return '';
    return map.get(id) ?? id;
  }

  async function assertTaskAccess(
    actor: QualityActor,
    task: TaskRow,
  ): Promise<void> {
    if (isSupervisor(actor)) return;
    if (isInspector(actor) && task.inspectorId === actor.id) return;
    if (isProductionLead(actor)) {
      const assigned = await database
        .query()
        .selectFrom('nonconformances')
        .select('id')
        .where('taskId', '=', task.id)
        .where('assignedToId', '=', actor.id)
        .limit(1)
        .executeTakeFirst();
      if (assigned) return;
    }
    throw new QualityError(
      'FORBIDDEN',
      'You do not have access to this inspection task.',
      403,
    );
  }

  async function assertNonconformanceAccess(
    actor: QualityActor,
    row: NonconformanceRow,
  ): Promise<void> {
    if (isSupervisor(actor)) return;
    if (isProductionLead(actor) && row.assignedToId === actor.id) return;
    if (isInspector(actor)) {
      const task = await database
        .query()
        .selectFrom('inspectionTasks')
        .select('inspectorId')
        .where('id', '=', row.taskId)
        .executeTakeFirst<{ inspectorId: string }>();
      if (task?.inspectorId === actor.id) return;
    }
    throw new QualityError(
      'FORBIDDEN',
      'You do not have access to this nonconformance.',
      403,
    );
  }

  async function findTask(taskId: string): Promise<TaskRow | undefined> {
    return database
      .query()
      .selectFrom('inspectionTasks')
      .selectAll()
      .where('id', '=', taskId)
      .executeTakeFirst<TaskRow>();
  }

  async function findNonconformance(
    id: string,
  ): Promise<NonconformanceRow | undefined> {
    return database
      .query()
      .selectFrom('nonconformances')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<NonconformanceRow>();
  }

  async function enrichTasks(
    rows: readonly TaskRow[],
  ): Promise<readonly InspectionTaskView[]> {
    if (rows.length === 0) return [];
    const products = await database
      .query()
      .selectFrom('products')
      .selectAll()
      .execute<ProductRow>();
    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );
    const batches = await database
      .query()
      .selectFrom('productionBatches')
      .selectAll()
      .execute<BatchRow>();
    const batchMap = new Map(batches.map((batch) => [batch.id, batch]));
    const names = await userMap();

    const taskIds = rows.map((row) => row.id);
    const items = await database
      .query()
      .selectFrom('inspectionItems')
      .selectAll()
      .where('taskId', 'in', taskIds)
      .execute<ItemRow>();
    const counts = new Map<
      string,
      { total: number; completed: number; failed: number }
    >();
    for (const item of items) {
      const entry = counts.get(item.taskId) ?? {
        total: 0,
        completed: 0,
        failed: 0,
      };
      entry.total += 1;
      if (item.result !== 'pending') entry.completed += 1;
      if (item.result === 'unqualified') entry.failed += 1;
      counts.set(item.taskId, entry);
    }

    return rows.map((row) => {
      const product = productMap.get(row.productId);
      const batch = batchMap.get(row.batchId);
      const count = counts.get(row.id) ?? {
        total: 0,
        completed: 0,
        failed: 0,
      };
      return {
        id: row.id,
        taskNo: row.taskNo,
        batchId: row.batchId,
        batchNo: batch?.batchNo ?? row.batchId,
        productId: row.productId,
        productCode: product?.code ?? row.productId,
        productName: product?.name ?? row.productId,
        inspectorId: row.inspectorId,
        inspectorName: nameOf(names, row.inspectorId),
        assignedLeadId: row.assignedLeadId,
        assignedLeadName: nameOf(names, row.assignedLeadId),
        sampleSize: row.sampleSize,
        status: row.status,
        result: row.result,
        remark: row.remark,
        submittedAt: toIso(row.submittedAt),
        createdAt: toIso(row.createdAt) ?? '',
        itemCount: count.total,
        completedItemCount: count.completed,
        failedItemCount: count.failed,
      };
    });
  }

  async function detailOf(task: TaskRow): Promise<InspectionTaskDetail> {
    const [view] = await enrichTasks([task]);
    const items = await database
      .query()
      .selectFrom('inspectionItems')
      .selectAll()
      .where('taskId', '=', task.id)
      .orderBy('seq', 'asc')
      .execute<ItemRow>();
    const ncRows = await database
      .query()
      .selectFrom('nonconformances')
      .selectAll()
      .where('taskId', '=', task.id)
      .orderBy('createdAt', 'asc')
      .execute<NonconformanceRow>();
    return {
      ...view,
      items: items.map(toItemView),
      nonconformances: await enrichNonconformances(ncRows),
    };
  }

  async function enrichNonconformances(
    rows: readonly NonconformanceRow[],
  ): Promise<readonly NonconformanceView[]> {
    if (rows.length === 0) return [];
    const tasks = await database
      .query()
      .selectFrom('inspectionTasks')
      .selectAll()
      .where(
        'id',
        'in',
        rows.map((row) => row.taskId),
      )
      .execute<TaskRow>();
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    const batches = await database
      .query()
      .selectFrom('productionBatches')
      .selectAll()
      .execute<BatchRow>();
    const batchMap = new Map(batches.map((batch) => [batch.id, batch]));
    const products = await database
      .query()
      .selectFrom('products')
      .selectAll()
      .execute<ProductRow>();
    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );
    const items = await database
      .query()
      .selectFrom('inspectionItems')
      .selectAll()
      .where(
        'id',
        'in',
        rows.map((row) => row.itemId),
      )
      .execute<ItemRow>();
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const reviews = await database
      .query()
      .selectFrom('nonconformanceReviews')
      .selectAll()
      .where(
        'nonconformanceId',
        'in',
        rows.map((row) => row.id),
      )
      .orderBy('round', 'asc')
      .orderBy('reviewedAt', 'asc')
      .execute<ReviewRow>();
    const reviewsByNonconformance = new Map<string, ReviewRow[]>();
    for (const review of reviews) {
      const list = reviewsByNonconformance.get(review.nonconformanceId) ?? [];
      list.push(review);
      reviewsByNonconformance.set(review.nonconformanceId, list);
    }
    const names = await userMap();

    return rows.map((row) => {
      const task = taskMap.get(row.taskId);
      const batch = batchMap.get(row.batchId);
      const product = productMap.get(row.productId);
      return {
        id: row.id,
        code: row.code,
        taskId: row.taskId,
        taskNo: task?.taskNo ?? row.taskId,
        itemId: row.itemId,
        itemName: itemMap.get(row.itemId)?.name ?? row.itemId,
        batchId: row.batchId,
        batchNo: batch?.batchNo ?? row.batchId,
        productName: product?.name ?? row.productId,
        title: row.title,
        description: row.description,
        status: row.status,
        assignedToId: row.assignedToId,
        assignedToName: nameOf(names, row.assignedToId),
        round: Number(row.round ?? 1),
        reason: row.reason,
        measure: row.measure,
        handledAt: toIso(row.handledAt),
        reviewedById: row.reviewedById,
        reviewedByName: nameOf(names, row.reviewedById),
        reviewedAt: toIso(row.reviewedAt),
        reviewComment: row.reviewComment,
        reviews: (reviewsByNonconformance.get(row.id) ?? []).map((review) => ({
          id: review.id,
          round: Number(review.round),
          decision: review.decision,
          comment: review.comment,
          reviewedById: review.reviewedById,
          reviewedByName: nameOf(names, review.reviewedById),
          reviewedAt: toIso(review.reviewedAt) ?? '',
        })),
        createdAt: toIso(row.createdAt) ?? '',
      };
    });
  }

  async function ensureNonconformances(
    query: QueryAdapter,
    task: TaskRow,
    items: readonly ItemRow[],
  ): Promise<void> {
    const failed = items.filter((item) => item.result === 'unqualified');
    if (failed.length === 0) return;

    const existing = await query
      .selectFrom('nonconformances')
      .select('itemId')
      .where('taskId', '=', task.id)
      .execute<{ itemId: string }>();
    const existingItems = new Set(existing.map((row) => row.itemId));
    const missing = failed.filter((item) => !existingItems.has(item.id));
    if (missing.length === 0) return;

    const now = new Date();
    const leadId = task.assignedLeadId ?? (await firstProductionLead());
    await query
      .insertInto('nonconformances')
      .values(
        missing.map((item, index) => ({
          id: crypto.randomUUID(),
          code: `NC-${task.taskNo}-${String(index + 1).padStart(2, '0')}`,
          taskId: task.id,
          itemId: item.id,
          batchId: task.batchId,
          productId: task.productId,
          title: `${item.name}不合格（${task.taskNo}）`,
          description: item.remark ?? item.standard ?? null,
          status: 'open',
          assignedToId: leadId,
          round: 1,
          reason: null,
          measure: null,
          handledAt: null,
          reviewedById: null,
          reviewedAt: null,
          reviewComment: null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .execute();
  }

  async function firstProductionLead(): Promise<string> {
    const users = await directory.listUsers();
    for (const user of users) {
      const roles = await directory.rolesForUser(user.id);
      if (roles.includes(PRODUCTION_LEAD_ROLE)) return user.id;
    }
    throw new QualityError(
      'VALIDATION',
      'No production lead is available to receive the nonconformance.',
      400,
    );
  }

  return {
    async resolveActor(
      userId: string,
      userName: string,
    ): Promise<QualityActor> {
      const roles = await directory.rolesForUser(userId);
      return { id: userId, name: userName, roles };
    },

    session(actor: QualityActor): QualitySession {
      return {
        user: { id: actor.id, name: actor.name },
        roles: [...actor.roles],
        capabilities: {
          supervise: isSupervisor(actor),
          inspect: isInspector(actor),
          produce: isProductionLead(actor),
        },
      };
    },

    async listProducts(): Promise<readonly ProductView[]> {
      const rows = await database
        .query()
        .selectFrom('products')
        .selectAll()
        .orderBy('code', 'asc')
        .execute<ProductRow>();
      return rows.map(toProductView);
    },

    async createProduct(actor, input): Promise<ProductView> {
      requireSupervisor(actor);
      const code = requireString(input.code, 'code');
      const name = requireString(input.name, 'name');
      const unit = requireString(input.unit, 'unit');
      const specification = optionalString(input.specification);
      const existing = await database
        .query()
        .selectFrom('products')
        .select('id')
        .where('code', '=', code)
        .executeTakeFirst();
      if (existing) {
        throw new QualityError('CONFLICT', 'Product code already exists.', 409);
      }
      const now = new Date();
      const id = crypto.randomUUID();
      await database
        .query()
        .insertInto('products')
        .values({
          id,
          code,
          name,
          specification,
          unit,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return {
        id,
        code,
        name,
        specification,
        unit,
        status: 'active',
      };
    },

    async listBatches(filter: BatchFilter): Promise<readonly BatchView[]> {
      let query = database.query().selectFrom('productionBatches').selectAll();
      if (filter.productId) {
        query = query.where('productId', '=', filter.productId);
      }
      if (filter.status) {
        query = query.where('status', '=', filter.status);
      }
      if (filter.search) {
        query = query.where('batchNo', 'like', `%${filter.search}%`);
      }
      const rows = await query
        .orderBy('producedAt', 'desc')
        .execute<BatchRow>();
      return enrichBatches(rows);
    },

    async createBatch(actor, input): Promise<BatchView> {
      requireSupervisor(actor);
      const batchNo = requireString(input.batchNo, 'batchNo');
      const productId = requireString(input.productId, 'productId');
      const quantity = requirePositiveInteger(input.quantity, 'quantity');
      const productionLine = optionalString(input.productionLine);
      const producedAt = requireDate(input.producedAt, 'producedAt');
      const remark = optionalString(input.remark);
      const product = await database
        .query()
        .selectFrom('products')
        .selectAll()
        .where('id', '=', productId)
        .executeTakeFirst<ProductRow>();
      if (!product) {
        throw new QualityError('NOT_FOUND', 'Product not found.', 404);
      }
      const existing = await database
        .query()
        .selectFrom('productionBatches')
        .select('id')
        .where('batchNo', '=', batchNo)
        .executeTakeFirst();
      if (existing) {
        throw new QualityError('CONFLICT', 'Batch number already exists.', 409);
      }
      const now = new Date();
      const id = crypto.randomUUID();
      await database
        .query()
        .insertInto('productionBatches')
        .values({
          id,
          batchNo,
          productId,
          quantity,
          productionLine,
          producedAt,
          status: 'completed',
          createdById: actor.id,
          remark,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return {
        id,
        batchNo,
        productId,
        productCode: product.code,
        productName: product.name,
        quantity,
        productionLine,
        producedAt: producedAt.toISOString(),
        status: 'completed',
        remark,
      };
    },

    async listTasks(
      actor: QualityActor,
      filter: TaskFilter,
    ): Promise<readonly InspectionTaskView[]> {
      let query = database.query().selectFrom('inspectionTasks').selectAll();
      if (isSupervisor(actor)) {
        // no scope restriction
      } else if (isInspector(actor)) {
        query = query.where('inspectorId', '=', actor.id);
      } else if (isProductionLead(actor)) {
        const taskIds = await assignedTaskIds(actor.id);
        if (taskIds.length === 0) return [];
        query = query.where('id', 'in', taskIds);
      } else {
        throw new QualityError(
          'FORBIDDEN',
          'No inspection role assigned.',
          403,
        );
      }
      if (filter.status) query = query.where('status', '=', filter.status);
      if (filter.result) query = query.where('result', '=', filter.result);
      if (filter.productId)
        query = query.where('productId', '=', filter.productId);
      if (filter.submittedOnly) query = query.where('status', '=', 'submitted');
      if (filter.search)
        query = query.where('taskNo', 'like', `%${filter.search}%`);
      const rows = await query.orderBy('createdAt', 'desc').execute<TaskRow>();
      return enrichTasks(rows);
    },

    async getTask(actor, taskId): Promise<InspectionTaskDetail> {
      const task = await findTask(taskId);
      if (!task) {
        throw new QualityError('NOT_FOUND', 'Inspection task not found.', 404);
      }
      await assertTaskAccess(actor, task);
      return detailOf(task);
    },

    async createTask(actor, input): Promise<InspectionTaskDetail> {
      requireSupervisor(actor);
      const batchId = requireString(input.batchId, 'batchId');
      const inspectorId = requireString(input.inspectorId, 'inspectorId');
      const assignedLeadId = requireString(
        input.assignedLeadId,
        'assignedLeadId',
      );
      const sampleSize = requirePositiveInteger(input.sampleSize, 'sampleSize');
      const remark = optionalString(input.remark);
      const items = requireItems(input.items);

      const batch = await database
        .query()
        .selectFrom('productionBatches')
        .selectAll()
        .where('id', '=', batchId)
        .executeTakeFirst<BatchRow>();
      if (!batch) {
        throw new QualityError('NOT_FOUND', 'Production batch not found.', 404);
      }
      const inspectorRoles = await directory.rolesForUser(inspectorId);
      if (!inspectorRoles.includes(INSPECTOR_ROLE)) {
        throw new QualityError(
          'VALIDATION',
          'The selected inspector does not have the inspector role.',
          400,
        );
      }
      const leadRoles = await directory.rolesForUser(assignedLeadId);
      if (!leadRoles.includes(PRODUCTION_LEAD_ROLE)) {
        throw new QualityError(
          'VALIDATION',
          'The selected production lead does not have that role.',
          400,
        );
      }

      const now = new Date();
      const taskId = crypto.randomUUID();
      const taskNo = await nextTaskNo(now);
      await database.transaction(async (connection) => {
        await connection.query
          .insertInto('inspectionTasks')
          .values({
            id: taskId,
            taskNo,
            batchId,
            productId: batch.productId,
            inspectorId,
            supervisorId: actor.id,
            assignedLeadId,
            sampleSize,
            status: 'pending',
            result: null,
            remark,
            submittedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await connection.query
          .insertInto('inspectionItems')
          .values(
            items.map((entry, index) => ({
              id: crypto.randomUUID(),
              taskId,
              seq: index + 1,
              name: entry.name,
              method: entry.method,
              standard: entry.standard,
              unit: entry.unit,
              result: 'pending',
              measuredValue: null,
              remark: null,
              inspectedAt: null,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .execute();
      });
      return this.getTask(actor, taskId);
    },

    async recordItem(
      actor,
      taskId,
      itemId,
      input,
    ): Promise<InspectionTaskDetail> {
      const task = await findTask(taskId);
      if (!task) {
        throw new QualityError('NOT_FOUND', 'Inspection task not found.', 404);
      }
      if (!isInspector(actor) || task.inspectorId !== actor.id) {
        throw new QualityError(
          'FORBIDDEN',
          'Only the assigned inspector may record this item.',
          403,
        );
      }
      if (task.status === 'submitted') {
        throw new QualityError(
          'CONFLICT',
          'A submitted inspection cannot be changed.',
          409,
        );
      }
      const item = await database
        .query()
        .selectFrom('inspectionItems')
        .selectAll()
        .where('id', '=', itemId)
        .where('taskId', '=', taskId)
        .executeTakeFirst<ItemRow>();
      if (!item) {
        throw new QualityError('NOT_FOUND', 'Inspection item not found.', 404);
      }
      const result = requireItemResult(input.result);
      const measuredValue = optionalString(input.measuredValue);
      const remark = optionalString(input.remark);
      if (result === 'unqualified' && !remark) {
        throw new QualityError(
          'VALIDATION',
          'An unqualified item requires a remark describing the deviation.',
          400,
        );
      }
      const now = new Date();
      await database
        .query()
        .updateTable('inspectionItems')
        .set({
          result,
          measuredValue,
          remark,
          inspectedAt: now,
          updatedAt: now,
        })
        .where('id', '=', itemId)
        .execute();
      if (task.status === 'pending') {
        await database
          .query()
          .updateTable('inspectionTasks')
          .set({ status: 'in_progress', updatedAt: now })
          .where('id', '=', taskId)
          .execute();
      }
      const updated = await findTask(taskId);
      return detailOf(updated ?? task);
    },

    async submitTask(actor, taskId): Promise<InspectionTaskDetail> {
      const task = await findTask(taskId);
      if (!task) {
        throw new QualityError('NOT_FOUND', 'Inspection task not found.', 404);
      }
      if (!isInspector(actor) || task.inspectorId !== actor.id) {
        throw new QualityError(
          'FORBIDDEN',
          'Only the assigned inspector may submit this inspection.',
          403,
        );
      }
      const items = await database
        .query()
        .selectFrom('inspectionItems')
        .selectAll()
        .where('taskId', '=', taskId)
        .orderBy('seq', 'asc')
        .execute<ItemRow>();

      if (task.status !== 'submitted') {
        if (items.some((item) => item.result === 'pending')) {
          throw new QualityError(
            'INCOMPLETE_ITEMS',
            'Every check item must be recorded before submission.',
            400,
          );
        }
        const result: QualityTaskResult = items.some(
          (item) => item.result === 'unqualified',
        )
          ? 'unqualified'
          : 'qualified';
        const now = new Date();
        await database.transaction(async (connection) => {
          await connection.query
            .updateTable('inspectionTasks')
            .set({
              status: 'submitted',
              result,
              submittedAt: now,
              updatedAt: now,
            })
            .where('id', '=', taskId)
            .execute();
          await ensureNonconformances(
            connection.query,
            { ...task, result, submittedAt: now },
            items,
          );
        });
        const submitted = await findTask(taskId);
        return detailOf(submitted ?? { ...task, status: 'submitted', result });
      }

      // A repeated submission must not create a second rectification: the
      // (taskId, itemId) uniqueness and the existence check keep it idempotent.
      await ensureNonconformances(database.query(), task, items);
      return detailOf(task);
    },

    async listNonconformances(
      actor: QualityActor,
      filter: NonconformanceFilter,
    ): Promise<readonly NonconformanceView[]> {
      let query = database.query().selectFrom('nonconformances').selectAll();
      if (isSupervisor(actor)) {
        // no scope restriction
      } else if (isProductionLead(actor)) {
        query = query.where('assignedToId', '=', actor.id);
      } else if (isInspector(actor)) {
        const taskIds = await inspectorTaskIds(actor.id);
        if (taskIds.length === 0) return [];
        query = query.where('taskId', 'in', taskIds);
      } else {
        throw new QualityError(
          'FORBIDDEN',
          'No inspection role assigned.',
          403,
        );
      }
      if (filter.status) query = query.where('status', '=', filter.status);
      if (filter.search)
        query = query.where('code', 'like', `%${filter.search}%`);
      const rows = await query
        .orderBy('createdAt', 'desc')
        .execute<NonconformanceRow>();
      return enrichNonconformances(rows);
    },

    async getNonconformance(actor, id): Promise<NonconformanceView> {
      const row = await findNonconformance(id);
      if (!row) {
        throw new QualityError('NOT_FOUND', 'Nonconformance not found.', 404);
      }
      await assertNonconformanceAccess(actor, row);
      const [view] = await enrichNonconformances([row]);
      return view;
    },

    async updateNonconformance(actor, id, input): Promise<NonconformanceView> {
      const row = await findNonconformance(id);
      if (!row) {
        throw new QualityError('NOT_FOUND', 'Nonconformance not found.', 404);
      }
      if (!isProductionLead(actor) || row.assignedToId !== actor.id) {
        throw new QualityError(
          'FORBIDDEN',
          'Only the assigned production lead may handle this nonconformance.',
          403,
        );
      }
      if (!['open', 'processing', 'returned'].includes(row.status)) {
        throw new QualityError(
          'INVALID_STATUS',
          'This nonconformance is not open for handling.',
          409,
        );
      }
      const reason = requireString(input.reason, 'reason');
      const measure = requireString(input.measure, 'measure');
      const submit = input.submit === true;
      const now = new Date();
      await database
        .query()
        .updateTable('nonconformances')
        .set({
          reason,
          measure,
          status: submit ? 'pending_review' : 'processing',
          handledAt: submit ? now : row.handledAt,
          updatedAt: now,
        })
        .where('id', '=', id)
        .execute();
      return this.getNonconformance(actor, id);
    },

    async reviewNonconformance(actor, id, input): Promise<NonconformanceView> {
      requireSupervisor(actor);
      const row = await findNonconformance(id);
      if (!row) {
        throw new QualityError('NOT_FOUND', 'Nonconformance not found.', 404);
      }
      if (row.status !== 'pending_review') {
        throw new QualityError(
          'INVALID_STATUS',
          'Only a nonconformance awaiting review can be reviewed.',
          409,
        );
      }
      const decision = input.decision;
      if (decision !== 'close' && decision !== 'return') {
        throw new QualityError(
          'VALIDATION',
          'The review decision must be "close" or "return".',
          400,
        );
      }
      const comment = optionalString(input.comment);
      if (decision === 'return' && !comment) {
        throw new QualityError(
          'VALIDATION',
          'Returning a nonconformance requires a comment.',
          400,
        );
      }
      const now = new Date();
      // Every decision is appended to the review history so a returned round's
      // comment survives the next review. Returning ends the current round and
      // opens the next one for the production lead's new evidence.
      const currentRound = Number(row.round ?? 1);
      const nextRound = decision === 'return' ? currentRound + 1 : currentRound;
      await database.transaction(async (connection) => {
        await connection.query
          .insertInto('nonconformanceReviews')
          .values({
            id: crypto.randomUUID(),
            nonconformanceId: id,
            round: currentRound,
            decision,
            comment,
            reviewedById: actor.id,
            reviewedAt: now,
            createdAt: now,
          })
          .execute();
        await connection.query
          .updateTable('nonconformances')
          .set({
            status: decision === 'close' ? 'closed' : 'returned',
            round: nextRound,
            reviewedById: actor.id,
            reviewedAt: now,
            reviewComment: comment,
            updatedAt: now,
          })
          .where('id', '=', id)
          .execute();
      });
      return this.getNonconformance(actor, id);
    },

    async reassignTask(actor, taskId, input): Promise<InspectionTaskDetail> {
      requireSupervisor(actor);
      const task = await findTask(taskId);
      if (!task) {
        throw new QualityError('NOT_FOUND', 'Inspection task not found.', 404);
      }
      const inspectorId = optionalString(input.inspectorId);
      const assignedLeadId = optionalString(input.assignedLeadId);
      if (!inspectorId && !assignedLeadId) {
        throw new QualityError(
          'VALIDATION',
          'Provide an inspector or a production lead to reassign.',
          400,
        );
      }
      if (inspectorId) {
        const roles = await directory.rolesForUser(inspectorId);
        if (!roles.includes(INSPECTOR_ROLE)) {
          throw new QualityError(
            'VALIDATION',
            'The selected inspector does not have the inspector role.',
            400,
          );
        }
      }
      if (assignedLeadId) {
        const roles = await directory.rolesForUser(assignedLeadId);
        if (!roles.includes(PRODUCTION_LEAD_ROLE)) {
          throw new QualityError(
            'VALIDATION',
            'The selected production lead does not have that role.',
            400,
          );
        }
      }
      const now = new Date();
      await database
        .query()
        .updateTable('inspectionTasks')
        .set({
          ...(inspectorId ? { inspectorId } : {}),
          ...(assignedLeadId ? { assignedLeadId } : {}),
          updatedAt: now,
        })
        .where('id', '=', taskId)
        .execute();
      const updated = await findTask(taskId);
      return detailOf(updated ?? task);
    },

    async reassignNonconformance(
      actor,
      id,
      input,
    ): Promise<NonconformanceView> {
      requireSupervisor(actor);
      const row = await findNonconformance(id);
      if (!row) {
        throw new QualityError('NOT_FOUND', 'Nonconformance not found.', 404);
      }
      const assignedToId = requireString(input.assignedToId, 'assignedToId');
      const roles = await directory.rolesForUser(assignedToId);
      if (!roles.includes(PRODUCTION_LEAD_ROLE)) {
        throw new QualityError(
          'VALIDATION',
          'The selected production lead does not have that role.',
          400,
        );
      }
      if (assignedToId !== row.assignedToId) {
        await database
          .query()
          .updateTable('nonconformances')
          .set({ assignedToId, updatedAt: new Date() })
          .where('id', '=', id)
          .execute();
      }
      return this.getNonconformance(actor, id);
    },

    async passRate(actor: QualityActor): Promise<PassRateSummary> {
      requireSupervisor(actor);
      const tasks = await database
        .query()
        .selectFrom('inspectionTasks')
        .selectAll()
        .where('status', '=', 'submitted')
        .execute<TaskRow>();
      const products = await database
        .query()
        .selectFrom('products')
        .selectAll()
        .execute<ProductRow>();
      const productMap = new Map(
        products.map((product) => [product.id, product]),
      );
      const groups = new Map<
        string,
        { total: number; qualified: number; unqualified: number }
      >();
      for (const task of tasks) {
        const entry = groups.get(task.productId) ?? {
          total: 0,
          qualified: 0,
          unqualified: 0,
        };
        entry.total += 1;
        if (task.result === 'qualified') entry.qualified += 1;
        if (task.result === 'unqualified') entry.unqualified += 1;
        groups.set(task.productId, entry);
      }
      const total = tasks.length;
      const qualified = tasks.filter(
        (task) => task.result === 'qualified',
      ).length;
      const unqualified = total - qualified;
      return {
        total,
        qualified,
        unqualified,
        passRate: total === 0 ? 0 : qualified / total,
        groups: [...groups.entries()]
          .map(([productId, entry]) => {
            const product = productMap.get(productId);
            return {
              productId,
              productCode: product?.code ?? productId,
              productName: product?.name ?? productId,
              total: entry.total,
              qualified: entry.qualified,
              unqualified: entry.unqualified,
              passRate: entry.total === 0 ? 0 : entry.qualified / entry.total,
            };
          })
          .sort((left, right) =>
            left.productCode.localeCompare(right.productCode),
          ),
      };
    },

    async assignableUsers(actor: QualityActor) {
      requireSupervisor(actor);
      const users = await directory.listUsers();
      const withRoles = await Promise.all(
        users.map(async (user) => ({
          user,
          roles: await directory.rolesForUser(user.id),
        })),
      );
      return {
        inspectors: withRoles
          .filter(({ roles }) => roles.includes(INSPECTOR_ROLE))
          .map(({ user }) => user),
        productionLeads: withRoles
          .filter(({ roles }) => roles.includes(PRODUCTION_LEAD_ROLE))
          .map(({ user }) => user),
      };
    },
  };

  async function assignedTaskIds(userId: string): Promise<string[]> {
    const rows = await database
      .query()
      .selectFrom('nonconformances')
      .select('taskId')
      .where('assignedToId', '=', userId)
      .execute<{ taskId: string }>();
    return [...new Set(rows.map((row) => row.taskId))];
  }

  async function inspectorTaskIds(userId: string): Promise<string[]> {
    const rows = await database
      .query()
      .selectFrom('inspectionTasks')
      .select('id')
      .where('inspectorId', '=', userId)
      .execute<{ id: string }>();
    return rows.map((row) => row.id);
  }

  async function nextTaskNo(now: Date): Promise<string> {
    const stamp = formatDate(now).replace(/-/g, '');
    const count = await database
      .query()
      .selectFrom('inspectionTasks')
      .select('id')
      .execute();
    return `QC-${stamp}-${String(count.length + 1).padStart(3, '0')}`;
  }

  async function enrichBatches(
    rows: readonly BatchRow[],
  ): Promise<readonly BatchView[]> {
    if (rows.length === 0) return [];
    const products = await database
      .query()
      .selectFrom('products')
      .selectAll()
      .execute<ProductRow>();
    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );
    return rows.map((row) => {
      const product = productMap.get(row.productId);
      return {
        id: row.id,
        batchNo: row.batchNo,
        productId: row.productId,
        productCode: product?.code ?? row.productId,
        productName: product?.name ?? row.productId,
        quantity: Number(row.quantity),
        productionLine: row.productionLine,
        producedAt: toIso(row.producedAt) ?? '',
        status: row.status,
        remark: row.remark,
      };
    });
  }

  function requireItems(value: unknown): readonly {
    name: string;
    method: string | null;
    standard: string | null;
    unit: string | null;
  }[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new QualityError(
        'VALIDATION',
        'At least one check item is required.',
        400,
      );
    }
    return value.map((entry, index) => {
      if (typeof entry !== 'object' || entry === null) {
        throw new QualityError(
          'VALIDATION',
          `Check item ${index + 1} is invalid.`,
          400,
        );
      }
      const record = entry as Record<string, unknown>;
      return {
        name: requireString(record.name, `items[${index}].name`),
        method: optionalString(record.method),
        standard: optionalString(record.standard),
        unit: optionalString(record.unit),
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function toProductView(row: ProductRow): ProductView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    specification: row.specification,
    unit: row.unit,
    status: row.status,
  };
}

function toItemView(row: ItemRow): InspectionItemView {
  return {
    id: row.id,
    seq: Number(row.seq),
    name: row.name,
    method: row.method,
    standard: row.standard,
    unit: row.unit,
    result: row.result,
    measuredValue: row.measuredValue,
    remark: row.remark,
  };
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new QualityError('VALIDATION', `${field} is required.`, 400);
  }
  return value.trim();
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new QualityError('VALIDATION', 'Expected a text value.', 400);
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function requirePositiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new QualityError(
      'VALIDATION',
      `${field} must be a positive integer.`,
      400,
    );
  }
  return parsed;
}

function requireDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new QualityError('VALIDATION', `${field} must be a date.`, 400);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new QualityError('VALIDATION', `${field} must be a valid date.`, 400);
  }
  return date;
}

function requireItemResult(value: unknown): 'qualified' | 'unqualified' {
  if (value !== 'qualified' && value !== 'unqualified') {
    throw new QualityError(
      'VALIDATION',
      'The check result must be qualified or unqualified.',
      400,
    );
  }
  return value;
}
