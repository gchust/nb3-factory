import type { DatabaseManager, Row } from '@nocobase/db';

/** Built-in super administrator. Grants every application page. */
export const ROLE_SYSTEM_ADMINISTRATOR = 'system-administrator';
/** Equipment manager: equipment, templates, task assignment, repair review. */
export const ROLE_EQUIPMENT_MANAGER = 'equipment-manager';
/** Inspector: executes only the tasks assigned to them. */
export const ROLE_INSPECTOR = 'inspector';
/** Repairer: handles only the work orders assigned to them. */
export const ROLE_REPAIRER = 'repairer';

export const TASK_PENDING = 'pending';
export const TASK_IN_PROGRESS = 'in_progress';
export const TASK_SUBMITTED = 'submitted';

export const REPAIR_PENDING = 'pending';
export const REPAIR_PROCESSING = 'processing';
export const REPAIR_REVIEW = 'review';
export const REPAIR_CLOSED = 'closed';
export const REPAIR_RETURNED = 'returned';

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const EQUIPMENT_STATUSES = [
  'running',
  'idle',
  'maintenance',
  'retired',
] as const;

export interface Actor {
  readonly userId: string;
  readonly roles: ReadonlySet<string>;
}

export class BusinessError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
    this.status = status;
  }
}

const notFound: (message: string) => never = (message) => {
  throw new BusinessError('NOT_FOUND', message, 404);
};
const forbidden: (message: string) => never = (message) => {
  throw new BusinessError('FORBIDDEN', message, 403);
};
const invalid: (message: string) => never = (message) => {
  throw new BusinessError('VALIDATION', message, 400);
};
const conflict: (message: string) => never = (message) => {
  throw new BusinessError('CONFLICT', message, 409);
};

export function isManagerLike(actor: Actor): boolean {
  return (
    actor.roles.has(ROLE_SYSTEM_ADMINISTRATOR) ||
    actor.roles.has(ROLE_EQUIPMENT_MANAGER)
  );
}

export interface FileInput {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number | string;
  readonly ext: string;
}

export interface EquipmentView extends Row {
  id: number;
  code: string;
  name: string;
  model: string | null;
  location: string | null;
  commissionedAt: string | null;
  status: string;
  photoFileId: string | null;
  remark: string | null;
}

export interface TemplateItemView {
  id: number;
  seq: number;
  title: string;
  standard: string;
}

export interface TemplateView {
  id: number;
  name: string;
  description: string | null;
  items: TemplateItemView[];
}

export interface TaskView extends Row {
  id: number;
  code: string;
  equipmentId: number;
  equipmentCode: string | null;
  equipmentName: string | null;
  templateId: number;
  templateName: string | null;
  assigneeId: string;
  assigneeName: string | null;
  plannedDate: string | null;
  status: string;
  submittedAt: string | null;
  abnormalCount: number;
  resultCount: number;
  answeredCount: number;
  overdue: boolean;
}

export interface AttachmentView {
  id: number;
  fileId: string;
  filename: string;
  mimeType: string;
  ext: string;
  size: number;
  note: string | null;
  uploadedById: string;
  uploadedByName: string | null;
  createdAt: string | null;
  stage?: string;
  contentUrl: string;
}

export interface ResultView {
  id: number;
  templateItemId: number;
  seq: number;
  title: string;
  standard: string;
  result: string | null;
  remark: string | null;
  attachments: AttachmentView[];
}

export interface TaskDetail extends TaskView {
  equipment: EquipmentView | null;
  results: ResultView[];
}

export interface RepairView extends Row {
  id: number;
  code: string;
  equipmentId: number;
  equipmentCode: string | null;
  equipmentName: string | null;
  sourceResultId: number;
  sourceTitle: string | null;
  sourceRemark: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  priority: string;
  status: string;
  description: string | null;
  reviewRemark: string | null;
  createdAt: string | null;
  closedAt: string | null;
  recordCount: number;
  beforeCount: number;
  afterCount: number;
}

export interface RepairDetail extends RepairView {
  records: RepairRecordView[];
  beforeFiles: AttachmentView[];
  afterFiles: AttachmentView[];
  taskId: number | null;
}

export interface RepairRecordView {
  id: number;
  authorId: string;
  authorName: string | null;
  content: string;
  createdAt: string | null;
}

export interface DashboardCounts {
  pending: number;
  overdue: number;
  abnormal: number;
  pendingReview: number;
}

export interface NewEquipmentInput {
  code?: unknown;
  name?: unknown;
  model?: unknown;
  location?: unknown;
  commissionedAt?: unknown;
  status?: unknown;
  remark?: unknown;
}

export interface NewTemplateInput {
  name?: unknown;
  description?: unknown;
  items?: unknown;
}

export interface NewTaskInput {
  equipmentId?: unknown;
  templateId?: unknown;
  assigneeId?: unknown;
  plannedDate?: unknown;
}

export interface ResultEntryInput {
  resultId?: unknown;
  result?: unknown;
  remark?: unknown;
}

/**
 * Domain service for the equipment inspection and repair workflow.
 *
 * Authorization is enforced here (not only in the route) so the rules can be
 * tested directly against a real database: an inspector reaches only their own
 * tasks, a repairer only their own work orders, and only an equipment manager
 * reviews and closes a work order.
 */
export class InspectionService {
  constructor(private readonly database: DatabaseManager) {}

  private get query() {
    return this.database.query();
  }

  // ---------------------------------------------------------------- equipment

  async listEquipment(): Promise<EquipmentView[]> {
    const rows = await this.query
      .selectFrom('equipment')
      .selectAll()
      .orderBy('code', 'asc')
      .execute();
    return rows.map((row) => row as EquipmentView);
  }

  async getEquipment(id: number): Promise<EquipmentView> {
    const row = await this.query
      .selectFrom('equipment')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return (row as EquipmentView | undefined) ?? notFound('设备不存在。');
  }

  private async requireEquipmentManager(actor: Actor): Promise<void> {
    if (!isManagerLike(actor)) forbidden('只有设备管理员可以执行该操作。');
  }

  async createEquipment(
    actor: Actor,
    input: NewEquipmentInput,
  ): Promise<EquipmentView> {
    await this.requireEquipmentManager(actor);
    const code = requireString(input.code, '设备编号', 64);
    const name = requireString(input.name, '设备名称', 128);
    const status = requireEnum(input.status, EQUIPMENT_STATUSES, '运行状态');
    const existing = await this.query
      .selectFrom('equipment')
      .select('id')
      .where('code', '=', code)
      .executeTakeFirst();
    if (existing) conflict(`设备编号 ${code} 已存在。`);

    const now = new Date();
    const result = await this.query
      .insertInto('equipment')
      .values({
        code,
        name,
        model: optionalString(input.model, 128),
        location: optionalString(input.location, 128),
        commissionedAt: optionalDate(input.commissionedAt),
        status,
        photoFileId: null,
        remark: optionalString(input.remark, 1000),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const id = Number(result.insertId);
    return this.getEquipment(id);
  }

  async updateEquipment(
    actor: Actor,
    id: number,
    input: NewEquipmentInput,
  ): Promise<EquipmentView> {
    await this.requireEquipmentManager(actor);
    await this.getEquipment(id);
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (input.code !== undefined) {
      const code = requireString(input.code, '设备编号', 64);
      const existing = await this.query
        .selectFrom('equipment')
        .select('id')
        .where('code', '=', code)
        .where('id', '!=', id)
        .executeTakeFirst();
      if (existing) conflict(`设备编号 ${code} 已存在。`);
      values.code = code;
    }
    if (input.name !== undefined)
      values.name = requireString(input.name, '设备名称', 128);
    if (input.model !== undefined)
      values.model = optionalString(input.model, 128);
    if (input.location !== undefined)
      values.location = optionalString(input.location, 128);
    if (input.commissionedAt !== undefined)
      values.commissionedAt = optionalDate(input.commissionedAt);
    if (input.status !== undefined)
      values.status = requireEnum(input.status, EQUIPMENT_STATUSES, '运行状态');
    if (input.remark !== undefined)
      values.remark = optionalString(input.remark, 1000);

    await this.query
      .updateTable('equipment')
      .set(values)
      .where('id', '=', id)
      .execute();
    return this.getEquipment(id);
  }

  async deleteEquipment(actor: Actor, id: number): Promise<void> {
    await this.requireEquipmentManager(actor);
    await this.getEquipment(id);
    const task = await this.query
      .selectFrom('inspectionTasks')
      .select('id')
      .where('equipmentId', '=', id)
      .limit(1)
      .executeTakeFirst();
    if (task) conflict('该设备已有巡检任务，不能删除。');
    await this.query.deleteFrom('equipment').where('id', '=', id).execute();
  }

  async setEquipmentPhoto(
    actor: Actor,
    id: number,
    fileId: string | null,
  ): Promise<EquipmentView> {
    await this.requireEquipmentManager(actor);
    await this.getEquipment(id);
    await this.query
      .updateTable('equipment')
      .set({ photoFileId: fileId, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
    return this.getEquipment(id);
  }

  // ---------------------------------------------------------------- templates

  async listTemplates(): Promise<TemplateView[]> {
    const [templates, items] = await Promise.all([
      this.query
        .selectFrom('inspectionTemplates')
        .selectAll()
        .orderBy('id', 'asc')
        .execute(),
      this.query
        .selectFrom('inspectionTemplateItems')
        .selectAll()
        .orderBy('seq', 'asc')
        .execute(),
    ]);
    return templates.map((template) => ({
      id: Number(template.id),
      name: String(template.name),
      description: (template.description as string | null) ?? null,
      items: items
        .filter((item) => Number(item.templateId) === Number(template.id))
        .map((item) => ({
          id: Number(item.id),
          seq: Number(item.seq),
          title: String(item.title),
          standard: String(item.standard),
        })),
    }));
  }

  async getTemplate(id: number): Promise<TemplateView> {
    const templates = await this.listTemplates();
    return (
      templates.find((template) => template.id === id) ??
      notFound('巡检模板不存在。')
    );
  }

  async createTemplate(
    actor: Actor,
    input: NewTemplateInput,
  ): Promise<TemplateView> {
    await this.requireEquipmentManager(actor);
    const name = requireString(input.name, '模板名称', 128);
    const items = parseTemplateItems(input.items);
    const existing = await this.query
      .selectFrom('inspectionTemplates')
      .select('id')
      .where('name', '=', name)
      .executeTakeFirst();
    if (existing) conflict(`模板名称 ${name} 已存在。`);
    const now = new Date();
    const result = await this.query
      .insertInto('inspectionTemplates')
      .values({
        name,
        description: optionalString(input.description, 1000),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const id = Number(result.insertId);
    await this.insertTemplateItems(id, items, now);
    return this.getTemplate(id);
  }

  async updateTemplate(
    actor: Actor,
    id: number,
    input: NewTemplateInput,
  ): Promise<TemplateView> {
    await this.requireEquipmentManager(actor);
    await this.getTemplate(id);
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const name = requireString(input.name, '模板名称', 128);
      const existing = await this.query
        .selectFrom('inspectionTemplates')
        .select('id')
        .where('name', '=', name)
        .where('id', '!=', id)
        .executeTakeFirst();
      if (existing) conflict(`模板名称 ${name} 已存在。`);
      values.name = name;
    }
    if (input.description !== undefined)
      values.description = optionalString(input.description, 1000);
    await this.query
      .updateTable('inspectionTemplates')
      .set(values)
      .where('id', '=', id)
      .execute();
    if (input.items !== undefined) {
      const items = parseTemplateItems(input.items);
      await this.query
        .deleteFrom('inspectionTemplateItems')
        .where('templateId', '=', id)
        .execute();
      await this.insertTemplateItems(id, items, new Date());
    }
    return this.getTemplate(id);
  }

  async deleteTemplate(actor: Actor, id: number): Promise<void> {
    await this.requireEquipmentManager(actor);
    await this.getTemplate(id);
    const task = await this.query
      .selectFrom('inspectionTasks')
      .select('id')
      .where('templateId', '=', id)
      .limit(1)
      .executeTakeFirst();
    if (task) conflict('该模板已被巡检任务使用，不能删除。');
    await this.query
      .deleteFrom('inspectionTemplateItems')
      .where('templateId', '=', id)
      .execute();
    await this.query
      .deleteFrom('inspectionTemplates')
      .where('id', '=', id)
      .execute();
  }

  private async insertTemplateItems(
    templateId: number,
    items: readonly ParsedTemplateItem[],
    now: Date,
  ): Promise<void> {
    if (items.length === 0) return;
    await this.query
      .insertInto('inspectionTemplateItems')
      .values(
        items.map((item, index) => ({
          templateId,
          seq: index + 1,
          title: item.title,
          standard: item.standard,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .execute();
  }

  // -------------------------------------------------------------------- tasks

  async listTasks(actor: Actor): Promise<TaskView[]> {
    const base = this.query
      .selectFrom('inspectionTasks')
      .selectAll()
      .orderBy('plannedDate', 'desc')
      .orderBy('id', 'desc');
    const scoped = isManagerLike(actor)
      ? base
      : actor.roles.has(ROLE_INSPECTOR)
        ? base.where('assigneeId', '=', actor.userId)
        : forbidden('没有查看巡检任务的权限。');
    const rows = await scoped.execute();
    return this.decorateTasks(rows);
  }

  private async decorateTasks(rows: readonly Row[]): Promise<TaskView[]> {
    if (rows.length === 0) return [];
    const [equipment, templates, users, results] = await Promise.all([
      this.query
        .selectFrom('equipment')
        .select(['id', 'code', 'name'])
        .execute(),
      this.query
        .selectFrom('inspectionTemplates')
        .select(['id', 'name'])
        .execute(),
      this.query
        .selectFrom('user')
        .select(['id', 'name', 'username'])
        .execute(),
      this.query
        .selectFrom('inspectionResults')
        .select(['id', 'taskId', 'result'])
        .execute(),
    ]);
    const equipmentMap = new Map(equipment.map((row) => [Number(row.id), row]));
    const templateMap = new Map(templates.map((row) => [Number(row.id), row]));
    const userMap = new Map(
      users.map((row) => [text(row.id), displayName(row)]),
    );
    // A task is overdue once its planned calendar day has passed, so a task
    // planned for today is still on time.
    const dayStart = startOfUtcDay().getTime();

    return rows.map((row) => {
      const taskResults = results.filter(
        (item) => Number(item.taskId) === Number(row.id),
      );
      const status = String(row.status);
      const plannedDate = toIso(row.plannedDate);
      return {
        id: Number(row.id),
        code: String(row.code),
        equipmentId: Number(row.equipmentId),
        equipmentCode:
          (equipmentMap.get(Number(row.equipmentId))?.code as
            string | undefined) ?? null,
        equipmentName:
          (equipmentMap.get(Number(row.equipmentId))?.name as
            string | undefined) ?? null,
        templateId: Number(row.templateId),
        templateName:
          (templateMap.get(Number(row.templateId))?.name as
            string | undefined) ?? null,
        assigneeId: String(row.assigneeId),
        assigneeName: userMap.get(String(row.assigneeId)) ?? null,
        plannedDate,
        status,
        submittedAt: toIso(row.submittedAt),
        abnormalCount: taskResults.filter((item) => item.result === 'abnormal')
          .length,
        resultCount: taskResults.length,
        answeredCount: taskResults.filter((item) => item.result !== null)
          .length,
        overdue:
          status !== TASK_SUBMITTED &&
          plannedDate !== null &&
          new Date(plannedDate).getTime() < dayStart,
      } satisfies TaskView;
    });
  }

  async getTask(actor: Actor, id: number): Promise<TaskDetail> {
    const row = await this.query
      .selectFrom('inspectionTasks')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) notFound('巡检任务不存在。');
    this.assertTaskAccess(actor, row);

    const [view] = await this.decorateTasks([row]);
    const [results, equipment, attachments] = await Promise.all([
      this.query
        .selectFrom('inspectionResults')
        .selectAll()
        .where('taskId', '=', id)
        .orderBy('id', 'asc')
        .execute(),
      this.query
        .selectFrom('equipment')
        .selectAll()
        .where('id', '=', Number(row.equipmentId))
        .executeTakeFirst(),
      this.query
        .selectFrom('inspectionResultAttachments')
        .selectAll()
        .where('taskId', '=', id)
        .orderBy('id', 'asc')
        .execute(),
    ]);
    const enriched = await this.decorateAttachments(attachments);
    const attachmentsByResult = groupBy(enriched, (item) =>
      Number(item.resultId),
    );

    return {
      ...view,
      equipment: (equipment as EquipmentView | undefined) ?? null,
      results: results.map((item) => ({
        id: Number(item.id),
        templateItemId: Number(item.templateItemId),
        seq: 0,
        title: String(item.title),
        standard: String(item.standard),
        result: (item.result as string | null) ?? null,
        remark: (item.remark as string | null) ?? null,
        attachments: attachmentsByResult.get(Number(item.id)) ?? [],
      })),
    };
  }

  private assertTaskAccess(actor: Actor, row: Row): void {
    if (isManagerLike(actor)) return;
    if (
      actor.roles.has(ROLE_INSPECTOR) &&
      String(row.assigneeId) === actor.userId
    )
      return;
    forbidden('无权访问该巡检任务。');
  }

  private assertTaskEditable(actor: Actor, row: Row): void {
    if (
      !actor.roles.has(ROLE_INSPECTOR) ||
      String(row.assigneeId) !== actor.userId
    ) {
      forbidden('只有任务执行人可以填写巡检结果。');
    }
    if (String(row.status) === TASK_SUBMITTED) {
      conflict('任务已提交，不能再次修改或提交。');
    }
  }

  async createTask(actor: Actor, input: NewTaskInput): Promise<TaskView> {
    await this.requireEquipmentManager(actor);
    const equipmentId = requirePositiveInt(input.equipmentId, '设备');
    const templateId = requirePositiveInt(input.templateId, '巡检模板');
    const assigneeId = requireString(input.assigneeId, '执行人', 64);
    const plannedDate = requireDate(input.plannedDate, '计划日期');
    await this.getEquipment(equipmentId);
    const template = await this.getTemplate(templateId);
    if (template.items.length === 0) invalid('巡检模板没有检查项目。');

    const now = new Date();
    const code = await this.nextTaskCode(now);
    const result = await this.query
      .insertInto('inspectionTasks')
      .values({
        code,
        equipmentId,
        templateId,
        assigneeId,
        plannedDate,
        status: TASK_PENDING,
        submittedAt: null,
        createdById: actor.userId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const id = Number(result.insertId);
    await this.query
      .insertInto('inspectionResults')
      .values(
        template.items.map((item) => ({
          taskId: id,
          templateItemId: item.id,
          title: item.title,
          standard: item.standard,
          result: null,
          remark: null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .execute();
    return (
      await this.decorateTasks([
        await this.query
          .selectFrom('inspectionTasks')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirstOrThrow(),
      ])
    )[0];
  }

  private async nextTaskCode(now: Date): Promise<string> {
    const prefix = `IT-${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
    const existing = await this.query
      .selectFrom('inspectionTasks')
      .select('code')
      .where('code', 'like', `${prefix}%`)
      .orderBy('code', 'desc')
      .limit(1)
      .executeTakeFirst();
    const last = existing
      ? Number(String(existing.code).slice(prefix.length + 1))
      : 0;
    return `${prefix}-${String(Number.isFinite(last) ? last + 1 : 1).padStart(3, '0')}`;
  }

  async saveTaskResults(
    actor: Actor,
    id: number,
    entries: readonly ResultEntryInput[],
  ): Promise<void> {
    const task = await this.query
      .selectFrom('inspectionTasks')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!task) notFound('巡检任务不存在。');
    this.assertTaskAccess(actor, task);
    this.assertTaskEditable(actor, task);

    const now = new Date();
    for (const entry of entries) {
      const resultId = requirePositiveInt(entry.resultId, '检查项');
      const result = normalizeResult(entry.result);
      const remark = optionalString(entry.remark, 2000);
      const row = await this.query
        .selectFrom('inspectionResults')
        .select('id')
        .where('id', '=', resultId)
        .where('taskId', '=', id)
        .executeTakeFirst();
      if (!row) invalid('检查项不属于该任务。');
      await this.query
        .updateTable('inspectionResults')
        .set({ result, remark, updatedAt: now })
        .where('id', '=', resultId)
        .execute();
    }
    await this.query
      .updateTable('inspectionTasks')
      .set({ status: TASK_IN_PROGRESS, updatedAt: now })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Submit a task. Every item must be answered and every abnormal item needs a
   * remark. Each abnormal item creates exactly one repair order: the unique
   * `sourceResultId` makes a repeated submission fail instead of duplicating.
   *
   * The new orders are handed to a repairer right away so the maintenance side
   * receives them without a separate manager step. `defaultAssigneeIds` lists
   * the eligible repairers (resolved by the route from the authorization
   * assignments); the least busy one is chosen. A manager can still reassign.
   */
  async submitTask(
    actor: Actor,
    id: number,
    options: { readonly defaultAssigneeIds?: readonly string[] } = {},
  ): Promise<{ repairOrders: number }> {
    const task = await this.query
      .selectFrom('inspectionTasks')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!task) notFound('巡检任务不存在。');
    this.assertTaskAccess(actor, task);
    this.assertTaskEditable(actor, task);

    const results = await this.query
      .selectFrom('inspectionResults')
      .selectAll()
      .where('taskId', '=', id)
      .execute()
      .then((rows) => rows);
    if (results.length === 0) invalid('任务没有检查项目。');
    const missing = results.filter(
      (row) => row.result !== 'normal' && row.result !== 'abnormal',
    );
    if (missing.length > 0) {
      invalid(`还有 ${missing.length} 个检查项未填写，不能提交。`);
    }
    const blankRemarks = results.filter(
      (row) => row.result === 'abnormal' && !text(row.remark).trim(),
    );
    if (blankRemarks.length > 0) {
      invalid(`有 ${blankRemarks.length} 个异常项缺少说明，不能提交。`);
    }

    const abnormal = results.filter((row) => row.result === 'abnormal');
    const defaultAssigneeId = await this.pickDefaultAssignee(
      options.defaultAssigneeIds ?? [],
    );
    const now = new Date();
    let created = 0;
    await this.database.transaction(async (connection) => {
      for (const item of abnormal) {
        const existing = await connection.query
          .selectFrom('repairOrders')
          .select('id')
          .where('sourceResultId', '=', Number(item.id))
          .executeTakeFirst();
        if (existing) continue;
        await connection.query
          .insertInto('repairOrders')
          .values({
            code: repairCode(Number(item.id), now),
            equipmentId: Number(task.equipmentId),
            sourceResultId: Number(item.id),
            assigneeId: defaultAssigneeId,
            priority: 'normal',
            status: REPAIR_PENDING,
            description: text(item.remark),
            createdById: actor.userId,
            reviewedById: null,
            reviewRemark: null,
            closedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        created += 1;
      }
      await connection.query
        .updateTable('inspectionTasks')
        .set({ status: TASK_SUBMITTED, submittedAt: now, updatedAt: now })
        .where('id', '=', id)
        .execute();
    });
    return { repairOrders: created };
  }

  /**
   * Pick the eligible repairer carrying the fewest open work orders, so new
   * anomalies are spread across the team instead of all landing on one person.
   * Ties break on the id for a stable, explainable choice.
   */
  private async pickDefaultAssignee(
    candidateIds: readonly string[],
  ): Promise<string | null> {
    const ids = [...new Set(candidateIds.filter((id) => id.length > 0))].sort();
    const [first] = ids;
    if (first === undefined) return null;
    const open = await this.query
      .selectFrom('repairOrders')
      .select('assigneeId')
      .where('assigneeId', 'in', ids)
      .where('status', '!=', REPAIR_CLOSED)
      .execute();
    const load = new Map(ids.map((id) => [id, 0]));
    for (const row of open) {
      const id = row.assigneeId === null ? '' : text(row.assigneeId);
      if (load.has(id)) load.set(id, (load.get(id) ?? 0) + 1);
    }
    let best = first;
    for (const id of ids) {
      if ((load.get(id) ?? 0) < (load.get(best) ?? 0)) best = id;
    }
    return best;
  }

  async deleteTask(actor: Actor, id: number): Promise<void> {
    await this.requireEquipmentManager(actor);
    const task = await this.query
      .selectFrom('inspectionTasks')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!task) notFound('巡检任务不存在。');
    if (String(task.status) === TASK_SUBMITTED) {
      conflict('已提交的巡检任务不能删除。');
    }
    await this.query
      .deleteFrom('inspectionResultAttachments')
      .where('taskId', '=', id)
      .execute();
    await this.query
      .deleteFrom('inspectionResults')
      .where('taskId', '=', id)
      .execute();
    await this.query
      .deleteFrom('inspectionTasks')
      .where('id', '=', id)
      .execute();
  }

  // -------------------------------------------------- inspection attachments

  async addInspectionFiles(
    actor: Actor,
    taskId: number,
    resultId: number,
    files: readonly FileInput[],
    note: string | null,
  ): Promise<void> {
    const task = await this.query
      .selectFrom('inspectionTasks')
      .selectAll()
      .where('id', '=', taskId)
      .executeTakeFirst();
    if (!task) notFound('巡检任务不存在。');
    this.assertTaskAccess(actor, task);
    this.assertTaskEditable(actor, task);
    const result = await this.query
      .selectFrom('inspectionResults')
      .select('id')
      .where('id', '=', resultId)
      .where('taskId', '=', taskId)
      .executeTakeFirst();
    if (!result) notFound('检查项不存在。');
    const now = new Date();
    if (files.length === 0) return;
    await this.query
      .insertInto('inspectionResultAttachments')
      .values(
        files.map((file) => ({
          taskId,
          resultId,
          fileId: file.id,
          note,
          uploadedById: actor.userId,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .execute();
  }

  async removeInspectionAttachment(
    actor: Actor,
    attachmentId: number,
  ): Promise<void> {
    const attachment = await this.query
      .selectFrom('inspectionResultAttachments')
      .selectAll()
      .where('id', '=', attachmentId)
      .executeTakeFirst();
    if (!attachment) notFound('附件不存在。');
    const task = await this.query
      .selectFrom('inspectionTasks')
      .selectAll()
      .where('id', '=', Number(attachment.taskId))
      .executeTakeFirst();
    if (!task) notFound('巡检任务不存在。');
    this.assertTaskAccess(actor, task);
    this.assertTaskEditable(actor, task);
    await this.query
      .deleteFrom('inspectionResultAttachments')
      .where('id', '=', attachmentId)
      .execute();
  }

  // ------------------------------------------------------------------ repairs

  async listRepairs(actor: Actor): Promise<RepairView[]> {
    const base = this.query
      .selectFrom('repairOrders')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc');
    const scoped = isManagerLike(actor)
      ? base
      : actor.roles.has(ROLE_REPAIRER)
        ? base.where('assigneeId', '=', actor.userId)
        : forbidden('没有查看维修工单的权限。');
    return this.decorateRepairs(await scoped.execute());
  }

  private async decorateRepairs(rows: readonly Row[]): Promise<RepairView[]> {
    if (rows.length === 0) return [];
    const [equipment, users, results, records, attachments] = await Promise.all(
      [
        this.query
          .selectFrom('equipment')
          .select(['id', 'code', 'name'])
          .execute(),
        this.query
          .selectFrom('user')
          .select(['id', 'name', 'username'])
          .execute(),
        this.query
          .selectFrom('inspectionResults')
          .select(['id', 'title', 'remark'])
          .execute(),
        this.query
          .selectFrom('repairOrderRecords')
          .select(['id', 'repairOrderId'])
          .execute(),
        this.query
          .selectFrom('repairOrderAttachments')
          .select(['id', 'repairOrderId', 'stage'])
          .execute(),
      ],
    );
    const equipmentMap = new Map(equipment.map((row) => [Number(row.id), row]));
    const userMap = new Map(
      users.map((row) => [String(row.id), displayName(row)]),
    );
    const resultMap = new Map(results.map((row) => [Number(row.id), row]));

    return rows.map((row) => {
      const source = resultMap.get(Number(row.sourceResultId));
      return {
        id: Number(row.id),
        code: String(row.code),
        equipmentId: Number(row.equipmentId),
        equipmentCode:
          (equipmentMap.get(Number(row.equipmentId))?.code as
            string | undefined) ?? null,
        equipmentName:
          (equipmentMap.get(Number(row.equipmentId))?.name as
            string | undefined) ?? null,
        sourceResultId: Number(row.sourceResultId),
        sourceTitle: (source?.title as string | undefined) ?? null,
        sourceRemark: (source?.remark as string | undefined) ?? null,
        assigneeId: (row.assigneeId as string | null) ?? null,
        assigneeName: row.assigneeId
          ? (userMap.get(text(row.assigneeId)) ?? null)
          : null,
        priority: String(row.priority),
        status: String(row.status),
        description: (row.description as string | null) ?? null,
        reviewRemark: (row.reviewRemark as string | null) ?? null,
        createdAt: toIso(row.createdAt),
        closedAt: toIso(row.closedAt),
        recordCount: records.filter(
          (item) => Number(item.repairOrderId) === Number(row.id),
        ).length,
        beforeCount: attachments.filter(
          (item) =>
            Number(item.repairOrderId) === Number(row.id) &&
            item.stage === 'before',
        ).length,
        afterCount: attachments.filter(
          (item) =>
            Number(item.repairOrderId) === Number(row.id) &&
            item.stage === 'after',
        ).length,
      } satisfies RepairView;
    });
  }

  async getRepair(actor: Actor, id: number): Promise<RepairDetail> {
    const row = await this.query
      .selectFrom('repairOrders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) notFound('维修工单不存在。');
    this.assertRepairAccess(actor, row);

    const [view] = await this.decorateRepairs([row]);
    const [records, attachments, users, task] = await Promise.all([
      this.query
        .selectFrom('repairOrderRecords')
        .selectAll()
        .where('repairOrderId', '=', id)
        .orderBy('id', 'asc')
        .execute(),
      this.query
        .selectFrom('repairOrderAttachments')
        .selectAll()
        .where('repairOrderId', '=', id)
        .orderBy('id', 'asc')
        .execute(),
      this.query
        .selectFrom('user')
        .select(['id', 'name', 'username'])
        .execute(),
      this.query
        .selectFrom('inspectionResults')
        .select('taskId')
        .where('id', '=', Number(row.sourceResultId))
        .executeTakeFirst(),
    ]);
    const userMap = new Map(
      users.map((item) => [String(item.id), displayName(item)]),
    );
    const enriched = await this.decorateAttachments(attachments);
    return {
      ...view,
      records: records.map((item) => ({
        id: Number(item.id),
        authorId: String(item.authorId),
        authorName: userMap.get(String(item.authorId)) ?? null,
        content: String(item.content),
        createdAt: toIso(item.createdAt),
      })),
      beforeFiles: enriched.filter((item) => item.stage === 'before'),
      afterFiles: enriched.filter((item) => item.stage === 'after'),
      taskId: task ? Number(task.taskId) : null,
    };
  }

  private assertRepairAccess(actor: Actor, row: Row): void {
    if (isManagerLike(actor)) return;
    if (
      actor.roles.has(ROLE_REPAIRER) &&
      row.assigneeId !== null &&
      text(row.assigneeId) === actor.userId
    ) {
      return;
    }
    forbidden('无权访问该维修工单。');
  }

  private assertRepairAssignee(actor: Actor, row: Row): void {
    if (
      !actor.roles.has(ROLE_REPAIRER) ||
      String(row.assigneeId) !== actor.userId
    ) {
      forbidden('只有该工单的维修员可以执行此操作。');
    }
  }

  async assignRepair(
    actor: Actor,
    id: number,
    assigneeId: unknown,
  ): Promise<RepairView> {
    await this.requireEquipmentManager(actor);
    const row = await this.query
      .selectFrom('repairOrders')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) notFound('维修工单不存在。');
    const value =
      assigneeId === null || assigneeId === undefined || assigneeId === ''
        ? null
        : requireString(assigneeId, '维修负责人', 64);
    await this.query
      .updateTable('repairOrders')
      .set({ assigneeId: value, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
    return (
      await this.decorateRepairs([
        await this.query
          .selectFrom('repairOrders')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirstOrThrow(),
      ])
    )[0];
  }

  async setRepairPriority(
    actor: Actor,
    id: number,
    priority: unknown,
  ): Promise<RepairView> {
    await this.requireEquipmentManager(actor);
    const value = requireEnum(priority, PRIORITIES, '优先级');
    const row = await this.query
      .selectFrom('repairOrders')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) notFound('维修工单不存在。');
    await this.query
      .updateTable('repairOrders')
      .set({ priority: value, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
    return (
      await this.decorateRepairs([
        await this.query
          .selectFrom('repairOrders')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirstOrThrow(),
      ])
    )[0];
  }

  async addRepairRecord(
    actor: Actor,
    id: number,
    content: unknown,
  ): Promise<void> {
    const row = await this.query
      .selectFrom('repairOrders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) notFound('维修工单不存在。');
    this.assertRepairAccess(actor, row);
    const text = requireString(content, '处理记录', 4000);
    const now = new Date();
    await this.query
      .insertInto('repairOrderRecords')
      .values({
        repairOrderId: id,
        authorId: actor.userId,
        content: text,
        createdAt: now,
      })
      .execute();
    await this.query
      .updateTable('repairOrders')
      .set({ updatedAt: now })
      .where('id', '=', id)
      .execute();
  }

  async startRepair(actor: Actor, id: number): Promise<void> {
    const row = await this.query
      .selectFrom('repairOrders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) notFound('维修工单不存在。');
    this.assertRepairAssignee(actor, row);
    const status = String(row.status);
    if (status !== REPAIR_PENDING && status !== REPAIR_RETURNED) {
      conflict('该工单当前状态不能开始处理。');
    }
    await this.query
      .updateTable('repairOrders')
      .set({ status: REPAIR_PROCESSING, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async submitRepairReview(actor: Actor, id: number): Promise<void> {
    const row = await this.query
      .selectFrom('repairOrders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) notFound('维修工单不存在。');
    this.assertRepairAssignee(actor, row);
    if (String(row.status) !== REPAIR_PROCESSING) {
      conflict('只有处理中的工单可以提交复核。');
    }
    const record = await this.query
      .selectFrom('repairOrderRecords')
      .select('id')
      .where('repairOrderId', '=', id)
      .limit(1)
      .executeTakeFirst();
    if (!record) invalid('请先填写处理记录，再提交复核。');
    await this.query
      .updateTable('repairOrders')
      .set({ status: REPAIR_REVIEW, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  /** Only an equipment manager may close or return a work order for review. */
  async reviewRepair(
    actor: Actor,
    id: number,
    decision: unknown,
    remark: unknown,
  ): Promise<void> {
    await this.requireEquipmentManager(actor);
    const row = await this.query
      .selectFrom('repairOrders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) notFound('维修工单不存在。');
    if (String(row.status) !== REPAIR_REVIEW) {
      conflict('只有待复核的工单可以复核。');
    }
    if (decision !== 'close' && decision !== 'return') {
      invalid('复核决定必须是关闭或退回。');
    }
    const text = optionalString(remark, 2000);
    if (decision === 'return' && !text) invalid('退回时必须填写原因。');
    const now = new Date();
    await this.query
      .updateTable('repairOrders')
      .set({
        status: decision === 'close' ? REPAIR_CLOSED : REPAIR_RETURNED,
        reviewedById: actor.userId,
        reviewRemark: text,
        closedAt: decision === 'close' ? now : null,
        updatedAt: now,
      })
      .where('id', '=', id)
      .execute();
  }

  private assertRepairFilesEditable(actor: Actor, row: Row): void {
    if (!isManagerLike(actor)) {
      this.assertRepairAssignee(actor, row);
    }
    const status = String(row.status);
    if (status === REPAIR_REVIEW || status === REPAIR_CLOSED) {
      conflict('工单已提交复核或关闭，资料只读。');
    }
  }

  async addRepairFiles(
    actor: Actor,
    id: number,
    stage: unknown,
    files: readonly FileInput[],
    note: string | null,
  ): Promise<void> {
    const row = await this.query
      .selectFrom('repairOrders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) notFound('维修工单不存在。');
    this.assertRepairFilesEditable(actor, row);
    if (stage !== 'before' && stage !== 'after')
      invalid('资料分组必须是维修前或维修后。');
    if (files.length === 0) return;
    const now = new Date();
    await this.query
      .insertInto('repairOrderAttachments')
      .values(
        files.map((file) => ({
          repairOrderId: id,
          stage,
          fileId: file.id,
          note,
          uploadedById: actor.userId,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .execute();
  }

  async removeRepairAttachment(
    actor: Actor,
    attachmentId: number,
  ): Promise<void> {
    const attachment = await this.query
      .selectFrom('repairOrderAttachments')
      .selectAll()
      .where('id', '=', attachmentId)
      .executeTakeFirst();
    if (!attachment) notFound('附件不存在。');
    const row = await this.query
      .selectFrom('repairOrders')
      .selectAll()
      .where('id', '=', Number(attachment.repairOrderId))
      .executeTakeFirst();
    if (!row) notFound('维修工单不存在。');
    this.assertRepairFilesEditable(actor, row);
    await this.query
      .deleteFrom('repairOrderAttachments')
      .where('id', '=', attachmentId)
      .execute();
  }

  // ---------------------------------------------------------------- dashboard

  async dashboard(actor: Actor): Promise<DashboardCounts> {
    const dayStart = startOfUtcDay();
    const dayStartValue = dayStart.toISOString().slice(0, -1);
    if (isManagerLike(actor)) {
      const [pending, overdue, abnormal, pendingReview] = await Promise.all([
        this.query
          .selectFrom('inspectionTasks')
          .select('id')
          .where('status', '!=', TASK_SUBMITTED)
          .execute()
          .then((rows) => rows.length),
        this.query
          .selectFrom('inspectionTasks')
          .select('id')
          .where('status', '!=', TASK_SUBMITTED)
          .where('plannedDate', '<', dayStartValue)
          .execute()
          .then((rows) => rows.length),
        this.query
          .selectFrom('inspectionResults')
          .select('id')
          .where('result', '=', 'abnormal')
          .execute()
          .then((rows) => rows.length),
        this.query
          .selectFrom('repairOrders')
          .select('id')
          .where('status', '=', REPAIR_REVIEW)
          .execute()
          .then((rows) => rows.length),
      ]);
      return { pending, overdue, abnormal, pendingReview };
    }
    if (actor.roles.has(ROLE_INSPECTOR)) {
      const tasks = await this.query
        .selectFrom('inspectionTasks')
        .selectAll()
        .where('assigneeId', '=', actor.userId)
        .execute();
      const open = tasks.filter(
        (task) => String(task.status) !== TASK_SUBMITTED,
      );
      return {
        pending: open.length,
        overdue: open.filter(
          (task) => toTimestamp(task.plannedDate) < dayStart.getTime(),
        ).length,
        abnormal: 0,
        pendingReview: 0,
      };
    }
    if (actor.roles.has(ROLE_REPAIRER)) {
      const orders = await this.query
        .selectFrom('repairOrders')
        .select(['id', 'status'])
        .where('assigneeId', '=', actor.userId)
        .execute();
      return {
        pending: orders.filter(
          (order) => String(order.status) !== REPAIR_CLOSED,
        ).length,
        overdue: 0,
        abnormal: orders.length,
        pendingReview: orders.filter(
          (order) => String(order.status) === REPAIR_REVIEW,
        ).length,
      };
    }
    return { pending: 0, overdue: 0, abnormal: 0, pendingReview: 0 };
  }

  // -------------------------------------------------------------------- files

  /**
   * Files are not public: a caller must be able to reach the business record a
   * file is attached to, even when they have the link.
   */
  async canAccessFile(actor: Actor, fileId: string): Promise<boolean> {
    if (isManagerLike(actor)) return true;

    const equipment = await this.query
      .selectFrom('equipment')
      .select('id')
      .where('photoFileId', '=', fileId)
      .executeTakeFirst();
    if (equipment) {
      return actor.roles.has(ROLE_INSPECTOR) || actor.roles.has(ROLE_REPAIRER);
    }

    const inspection = await this.query
      .selectFrom('inspectionResultAttachments')
      .select(['taskId', 'uploadedById'])
      .where('fileId', '=', fileId)
      .executeTakeFirst();
    if (inspection) {
      if (String(inspection.uploadedById) === actor.userId) return true;
      const task = await this.query
        .selectFrom('inspectionTasks')
        .select('assigneeId')
        .where('id', '=', Number(inspection.taskId))
        .executeTakeFirst();
      return task !== undefined && String(task.assigneeId) === actor.userId;
    }

    const repair = await this.query
      .selectFrom('repairOrderAttachments')
      .select(['repairOrderId', 'uploadedById'])
      .where('fileId', '=', fileId)
      .executeTakeFirst();
    if (repair) {
      if (String(repair.uploadedById) === actor.userId) return true;
      const order = await this.query
        .selectFrom('repairOrders')
        .select('assigneeId')
        .where('id', '=', Number(repair.repairOrderId))
        .executeTakeFirst();
      return (
        order !== undefined &&
        order.assigneeId !== null &&
        text(order.assigneeId) === actor.userId
      );
    }

    return false;
  }

  async getFileRecord(fileId: string): Promise<Row | undefined> {
    return this.query
      .selectFrom('appFiles')
      .selectAll()
      .where('id', '=', fileId)
      .executeTakeFirst();
  }

  private async decorateAttachments(
    rows: readonly Row[],
  ): Promise<(AttachmentView & { resultId: number })[]> {
    if (rows.length === 0) return [];
    const fileIds = rows.map((row) => String(row.fileId));
    const [files, users] = await Promise.all([
      this.query
        .selectFrom('appFiles')
        .selectAll()
        .where('id', 'in', fileIds)
        .execute(),
      this.query
        .selectFrom('user')
        .select(['id', 'name', 'username'])
        .execute(),
    ]);
    const fileMap = new Map(files.map((row) => [String(row.id), row]));
    const userMap = new Map(
      users.map((row) => [String(row.id), displayName(row)]),
    );
    return rows.map((row) => {
      const file = fileMap.get(String(row.fileId));
      return {
        id: Number(row.id),
        resultId: Number(row.resultId ?? row.repairOrderId ?? 0),
        fileId: String(row.fileId),
        filename: (file?.filename as string | undefined) ?? '（文件已丢失）',
        mimeType:
          (file?.mimeType as string | undefined) ?? 'application/octet-stream',
        ext: (file?.ext as string | undefined) ?? '',
        size: Number(file?.size ?? 0),
        note: (row.note as string | null) ?? null,
        uploadedById: String(row.uploadedById),
        uploadedByName: userMap.get(String(row.uploadedById)) ?? null,
        createdAt: toIso(row.createdAt),
        stage: (row.stage as string | undefined) ?? undefined,
        contentUrl: `/api/app-files/${encodeURIComponent(String(row.fileId))}/content`,
      };
    });
  }
}

// ------------------------------------------------------------------- helpers

function displayName(row: Row): string {
  const name = row.name;
  if (typeof name === 'string' && name.trim()) return name;
  const username = row.username;
  return typeof username === 'string' ? username : String(row.id);
}

function groupBy<T>(
  items: readonly T[],
  key: (item: T) => number,
): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const id = key(item);
    const list = map.get(id);
    if (list) list.push(item);
    else map.set(id, [item]);
  }
  return map;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const timestamp = toTimestamp(value);
  if (!Number.isNaN(timestamp)) return new Date(timestamp).toISOString();
  return text(value);
}

/**
 * Stored datetimes are UTC wall-clock strings without a timezone suffix
 * (`2026-09-19T01:00:00.000`), so a bare `new Date()` would read them as
 * local time. Normalize before parsing.
 */
function toTimestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
      ? value
      : `${value}Z`;
    const time = new Date(normalized).getTime();
    return Number.isNaN(time) ? NaN : time;
  }
  return NaN;
}

/** Midnight UTC of the current day, comparable with stored datetimes. */
function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Narrow an unknown row value to a display string. */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return '';
}

function requireString(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BusinessError('VALIDATION', `${label}不能为空。`, 400);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new BusinessError(
      'VALIDATION',
      `${label}不能超过 ${max} 个字符。`,
      400,
    );
  }
  return text;
}

function optionalString(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

function requirePositiveInt(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BusinessError('VALIDATION', `${label}选择不正确。`, 400);
  }
  return parsed;
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BusinessError('VALIDATION', `${label}不正确。`, 400);
  }
  return value as T;
}

function optionalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) {
    throw new BusinessError('VALIDATION', '日期格式不正确。', 400);
  }
  return date;
}

function requireDate(value: unknown, label: string): Date {
  const date = optionalDate(value);
  if (!date) throw new BusinessError('VALIDATION', `${label}不能为空。`, 400);
  return date;
}

function normalizeResult(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value !== 'normal' && value !== 'abnormal') {
    throw new BusinessError('VALIDATION', '检查结果只能是正常或异常。', 400);
  }
  return value;
}

interface ParsedTemplateItem {
  readonly title: string;
  readonly standard: string;
}

function parseTemplateItems(value: unknown): ParsedTemplateItem[] {
  if (!Array.isArray(value)) {
    throw new BusinessError('VALIDATION', '检查项目格式不正确。', 400);
  }
  const items = value.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    return {
      title: requireString(item.title, '检查项目', 200),
      standard: requireString(item.standard, '正常标准', 2000),
    };
  });
  if (items.length === 0) {
    throw new BusinessError('VALIDATION', '至少需要一个检查项目。', 400);
  }
  return items;
}

/**
 * Deterministic work-order code derived from the source result id, so a second
 * submit of the same task can never mint a second code for the same abnormal.
 */
function repairCode(sourceResultId: number, now: Date): string {
  return `RO-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(sourceResultId).padStart(4, '0')}`;
}
