import type { DatabaseManager, Row } from '@nocobase/db';

import {
  DELIVERY_DUPLICATE_TIMESHEET,
  DELIVERY_TASK_HAS_TIMESHEETS,
  DeliveryRuleError,
  MILESTONE_STATUSES,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  assertMemberTaskUpdate,
  assertTaskStatusChangeAllowed,
  canManageDelivery,
  coerceDate,
  completionRate,
  forbiddenError,
  isProjectStatus,
  isTaskStatus,
  notFoundError,
  optionalString,
  parseBudgetHours,
  parseDate,
  parseEnum,
  parseHours,
  parseIdentifier,
  requireIdentifier,
  requireString,
  startOfUtcDay,
  taskTimeliness,
  type DeliveryRole,
  type MilestoneStatus,
  type ProjectStatus,
  type TaskPriority,
  type TaskStatus,
  type TaskTimeliness,
} from './delivery-rules.js';

export interface DeliveryActor {
  readonly userId: string;
  readonly role: DeliveryRole;
}

export interface ProjectDto {
  id: number;
  name: string;
  clientName: string;
  managerId: string | null;
  managerName: string | null;
  startDate: string | null;
  endDate: string | null;
  budgetHours: number | null;
  status: ProjectStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MilestoneDto {
  id: number;
  name: string;
  projectId: number;
  projectName: string | null;
  plannedDate: string | null;
  actualDate: string | null;
  status: MilestoneStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TaskDto {
  id: number;
  name: string;
  projectId: number;
  projectName: string | null;
  milestoneId: number | null;
  milestoneName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  plannedDate: string | null;
  actualDate: string | null;
  description: string | null;
  timeliness: TaskTimeliness | null;
  overdue: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TimesheetDto {
  id: number;
  userId: string;
  userName: string | null;
  taskId: number;
  taskName: string | null;
  projectId: number;
  projectName: string | null;
  workDate: string;
  hours: number;
  description: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DashboardProjectDto {
  id: number;
  name: string;
  clientName: string;
  status: ProjectStatus;
  hours: number;
  taskCount: number;
  completedTaskCount: number;
  completionRate: number;
  overdueCount: number;
}

export interface DashboardDto {
  projects: DashboardProjectDto[];
  overdueTasks: TaskDto[];
  totalHours: number;
}

interface ProjectRow extends Row {
  id: number;
  name: string;
  clientName: string;
  managerId: string | null;
  startDate: unknown;
  endDate: unknown;
  budgetHours: unknown;
  status: string;
  createdAt: unknown;
  updatedAt: unknown;
}

interface MilestoneRow extends Row {
  id: number;
  name: string;
  projectId: number;
  plannedDate: unknown;
  actualDate: unknown;
  status: string;
  createdAt: unknown;
  updatedAt: unknown;
}

interface TaskRow extends Row {
  id: number;
  name: string;
  projectId: number;
  milestoneId: number | null;
  assigneeId: string | null;
  priority: string;
  status: string;
  plannedDate: unknown;
  actualDate: unknown;
  description: string | null;
  createdAt: unknown;
  updatedAt: unknown;
}

interface TimesheetRow extends Row {
  id: number;
  userId: string;
  taskId: number;
  projectId: number;
  workDate: unknown;
  hours: unknown;
  description: string;
  createdAt: unknown;
  updatedAt: unknown;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return '';
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoOrNull(value: unknown): string | null {
  const date = coerceDate(value);
  return date ? date.toISOString() : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

const DATE_FIELDS = new Set([
  'startDate',
  'endDate',
  'plannedDate',
  'actualDate',
  'workDate',
]);

/**
 * The database stores datetimes as text, so every Date is written as an ISO
 * 8601 string. Comparisons and the per-day uniqueness constraint then use the
 * same representation.
 */
function serializeDates(values: object): Record<string, unknown> {
  const serialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    serialized[key] =
      DATE_FIELDS.has(key) && value instanceof Date
        ? value.toISOString()
        : value;
  }
  return serialized;
}

function toProjectStatus(value: unknown): ProjectStatus {
  return isProjectStatus(value) ? value : 'planning';
}

function toMilestoneStatus(value: unknown): MilestoneStatus {
  return MILESTONE_STATUSES.includes(value as MilestoneStatus)
    ? (value as MilestoneStatus)
    : 'not_started';
}

function toTaskStatus(value: unknown): TaskStatus {
  return isTaskStatus(value) ? value : 'todo';
}

function toTaskPriority(value: unknown): TaskPriority {
  return TASK_PRIORITIES.includes(value as TaskPriority)
    ? (value as TaskPriority)
    : 'medium';
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT') {
    return true;
  }
  if (code === '23505' || code === 'ER_DUP_ENTRY') return true;
  return /unique constraint|duplicate key|UNIQUE constraint failed/i.test(
    error.message,
  );
}

export class DeliveryService {
  constructor(private readonly database: DatabaseManager) {}

  private get db() {
    return this.database.query();
  }

  // ---------------------------------------------------------------- projects

  async listProjects(status?: string): Promise<ProjectDto[]> {
    let query = this.db.selectFrom<ProjectRow>('deliveryProjects').selectAll();
    if (status) {
      query = query.where('status', '=', status);
    }
    const rows = await query.orderBy('id', 'desc').execute<ProjectRow>();
    const names = await this.userNames(rows.map((row) => row.managerId));
    return rows.map((row) => this.toProject(row, names));
  }

  async getProject(id: number): Promise<ProjectDto> {
    const row = await this.db
      .selectFrom<ProjectRow>('deliveryProjects')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<ProjectRow>();
    if (!row) throw notFoundError('Project not found');
    const names = await this.userNames([row.managerId]);
    return this.toProject(row, names);
  }

  async createProject(input: Record<string, unknown>): Promise<ProjectDto> {
    const values = parseProjectCreate(input);
    const now = nowIso();
    const result = await this.db
      .insertInto('deliveryProjects')
      .values({ ...serializeDates(values), createdAt: now, updatedAt: now })
      .execute();
    return this.getProject(Number(result.insertId));
  }

  async updateProject(
    id: number,
    input: Record<string, unknown>,
  ): Promise<ProjectDto> {
    await this.getProject(id);
    const patch = parseProjectUpdate(input);
    if (Object.keys(patch).length > 0) {
      await this.db
        .updateTable('deliveryProjects')
        .set({ ...serializeDates(patch), updatedAt: nowIso() })
        .where('id', '=', id)
        .execute();
    }
    return this.getProject(id);
  }

  async deleteProject(id: number): Promise<{ fileIds: string[] }> {
    await this.getProject(id);
    const taskRows = await this.db
      .selectFrom('deliveryTasks')
      .select('id')
      .where('projectId', '=', id)
      .execute();
    const taskIds = taskRows.map((row) => Number(row.id));
    if (taskIds.length > 0) {
      await this.db
        .deleteFrom('deliveryTimesheets')
        .where('taskId', 'in', taskIds)
        .execute();
    }
    await this.db
      .deleteFrom('deliveryTasks')
      .where('projectId', '=', id)
      .execute();
    await this.db
      .deleteFrom('deliveryMilestones')
      .where('projectId', '=', id)
      .execute();
    const links = await this.db
      .selectFrom('deliveryProjectFileLinks')
      .select('fileId')
      .where('projectId', '=', id)
      .execute();
    await this.db
      .deleteFrom('deliveryProjectFileLinks')
      .where('projectId', '=', id)
      .execute();
    await this.db.deleteFrom('deliveryProjects').where('id', '=', id).execute();
    return { fileIds: links.map((row) => text(row.fileId)) };
  }

  // -------------------------------------------------------------- milestones

  async listMilestones(projectId?: number): Promise<MilestoneDto[]> {
    let query = this.db
      .selectFrom<MilestoneRow>('deliveryMilestones')
      .selectAll();
    if (projectId !== undefined) {
      query = query.where('projectId', '=', projectId);
    }
    const rows = await query
      .orderBy('plannedDate', 'asc')
      .execute<MilestoneRow>();
    const projects = await this.projectNames(rows.map((row) => row.projectId));
    return rows.map((row) => ({
      id: Number(row.id),
      name: text(row.name),
      projectId: Number(row.projectId),
      projectName: projects.get(Number(row.projectId)) ?? null,
      plannedDate: isoOrNull(row.plannedDate),
      actualDate: isoOrNull(row.actualDate),
      status: toMilestoneStatus(row.status),
      createdAt: isoOrNull(row.createdAt),
      updatedAt: isoOrNull(row.updatedAt),
    }));
  }

  async createMilestone(input: Record<string, unknown>): Promise<MilestoneDto> {
    const values = parseMilestoneCreate(input);
    await this.requireProject(values.projectId);
    const now = nowIso();
    const result = await this.db
      .insertInto('deliveryMilestones')
      .values({ ...serializeDates(values), createdAt: now, updatedAt: now })
      .execute();
    const created = await this.getMilestone(Number(result.insertId));
    return created;
  }

  async getMilestone(id: number): Promise<MilestoneDto> {
    const row = await this.db
      .selectFrom<MilestoneRow>('deliveryMilestones')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<MilestoneRow>();
    if (!row) throw notFoundError('Milestone not found');
    const projects = await this.projectNames([row.projectId]);
    return {
      id: Number(row.id),
      name: text(row.name),
      projectId: Number(row.projectId),
      projectName: projects.get(Number(row.projectId)) ?? null,
      plannedDate: isoOrNull(row.plannedDate),
      actualDate: isoOrNull(row.actualDate),
      status: toMilestoneStatus(row.status),
      createdAt: isoOrNull(row.createdAt),
      updatedAt: isoOrNull(row.updatedAt),
    };
  }

  async updateMilestone(
    id: number,
    input: Record<string, unknown>,
  ): Promise<MilestoneDto> {
    await this.getMilestone(id);
    const patch = parseMilestoneUpdate(input);
    if (patch.projectId !== undefined) {
      await this.requireProject(patch.projectId);
    }
    if (Object.keys(patch).length > 0) {
      await this.db
        .updateTable('deliveryMilestones')
        .set({ ...serializeDates(patch), updatedAt: nowIso() })
        .where('id', '=', id)
        .execute();
    }
    return this.getMilestone(id);
  }

  async deleteMilestone(id: number): Promise<void> {
    await this.getMilestone(id);
    await this.db
      .updateTable('deliveryTasks')
      .set({ milestoneId: null, updatedAt: nowIso() })
      .where('milestoneId', '=', id)
      .execute();
    await this.db
      .deleteFrom('deliveryMilestones')
      .where('id', '=', id)
      .execute();
  }

  // ------------------------------------------------------------------- tasks

  async listTasks(
    filter: {
      projectId?: number;
      milestoneId?: number;
      assigneeId?: string;
    } = {},
  ): Promise<TaskDto[]> {
    let query = this.db.selectFrom<TaskRow>('deliveryTasks').selectAll();
    if (filter.projectId !== undefined) {
      query = query.where('projectId', '=', filter.projectId);
    }
    if (filter.milestoneId !== undefined) {
      query = query.where('milestoneId', '=', filter.milestoneId);
    }
    if (filter.assigneeId !== undefined) {
      query = query.where('assigneeId', '=', filter.assigneeId);
    }
    const rows = await query.orderBy('id', 'desc').execute<TaskRow>();
    return this.enrichTasks(rows);
  }

  async getTask(id: number): Promise<TaskDto> {
    const rows = await this.enrichTasks(
      await this.db
        .selectFrom<TaskRow>('deliveryTasks')
        .selectAll()
        .where('id', '=', id)
        .execute<TaskRow>(),
    );
    const task = rows[0];
    if (!task) throw notFoundError('Task not found');
    return task;
  }

  async createTask(
    input: Record<string, unknown>,
    actorId: string,
  ): Promise<TaskDto> {
    const values = parseTaskCreate(input);
    await this.requireProject(values.projectId);
    if (values.milestoneId !== null) {
      await this.requireMilestone(values.milestoneId, values.projectId);
    }
    await this.requireUsers([values.assigneeId]);
    const now = nowIso();
    const result = await this.db
      .insertInto('deliveryTasks')
      .values({
        ...serializeDates(values),
        createdById: actorId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.getTask(Number(result.insertId));
  }

  async updateTask(
    id: number,
    input: Record<string, unknown>,
    actor: DeliveryActor,
  ): Promise<TaskDto> {
    const existing = await this.getTask(id);
    assertMemberTaskUpdate(
      actor.role,
      actor.userId,
      existing,
      Object.keys(input),
    );
    assertTaskStatusChangeAllowed(existing.status, input.status);
    const patch = parseTaskUpdate(input);
    if (patch.projectId !== undefined) {
      await this.requireProject(patch.projectId);
    }
    const milestoneId =
      patch.milestoneId !== undefined
        ? patch.milestoneId
        : existing.milestoneId;
    const projectId = patch.projectId ?? existing.projectId;
    if (milestoneId !== null) {
      await this.requireMilestone(milestoneId, projectId);
    }
    if (patch.assigneeId !== undefined) {
      await this.requireUsers([patch.assigneeId]);
    }
    if (patch.status === 'completed' && patch.actualDate === undefined) {
      patch.actualDate = new Date();
    }
    if (
      patch.status !== undefined &&
      patch.status !== 'completed' &&
      patch.actualDate === undefined
    ) {
      patch.actualDate = null;
    }
    if (Object.keys(patch).length > 0) {
      await this.db
        .updateTable('deliveryTasks')
        .set({ ...serializeDates(patch), updatedAt: nowIso() })
        .where('id', '=', id)
        .execute();
    }
    return this.getTask(id);
  }

  async deleteTask(id: number): Promise<void> {
    await this.getTask(id);
    const existing = await this.db
      .selectFrom('deliveryTimesheets')
      .select('id')
      .where('taskId', '=', id)
      .executeTakeFirst();
    if (existing) {
      throw new DeliveryRuleError(
        DELIVERY_TASK_HAS_TIMESHEETS,
        'A task with timesheet records cannot be deleted',
        409,
      );
    }
    await this.db.deleteFrom('deliveryTasks').where('id', '=', id).execute();
  }

  // -------------------------------------------------------------- timesheets

  async listTimesheets(
    filter: { taskId?: number; projectId?: number; userId?: string },
    actor: DeliveryActor,
  ): Promise<TimesheetDto[]> {
    let query = this.db
      .selectFrom<TimesheetRow>('deliveryTimesheets')
      .selectAll();
    // Members may only ever see their own registrations.
    const userId = canManageDelivery(actor.role) ? filter.userId : actor.userId;
    if (userId) query = query.where('userId', '=', userId);
    if (filter.taskId !== undefined) {
      query = query.where('taskId', '=', filter.taskId);
    }
    if (filter.projectId !== undefined) {
      query = query.where('projectId', '=', filter.projectId);
    }
    const rows = await query
      .orderBy('workDate', 'desc')
      .orderBy('id', 'desc')
      .execute<TimesheetRow>();
    return this.enrichTimesheets(rows);
  }

  async createTimesheet(
    input: Record<string, unknown>,
    actor: DeliveryActor,
  ): Promise<TimesheetDto> {
    const values = parseTimesheetCreate(input);
    const task = await this.getTask(values.taskId);
    const userId = canManageDelivery(actor.role)
      ? (values.userId ?? actor.userId)
      : actor.userId;
    await this.requireUsers([userId]);
    const duplicate = await this.findDuplicate(
      userId,
      values.taskId,
      values.workDate,
    );
    if (duplicate) {
      throw new DeliveryRuleError(
        DELIVERY_DUPLICATE_TIMESHEET,
        'A timesheet for this task already exists on that day',
        409,
      );
    }
    const now = nowIso();
    try {
      const result = await this.db
        .insertInto('deliveryTimesheets')
        .values({
          userId,
          taskId: values.taskId,
          projectId: task.projectId,
          workDate: values.workDate.toISOString(),
          hours: values.hours,
          description: values.description,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return this.getTimesheet(Number(result.insertId));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DeliveryRuleError(
          DELIVERY_DUPLICATE_TIMESHEET,
          'A timesheet for this task already exists on that day',
          409,
        );
      }
      throw error;
    }
  }

  async getTimesheet(id: number): Promise<TimesheetDto> {
    const rows = await this.enrichTimesheets(
      await this.db
        .selectFrom<TimesheetRow>('deliveryTimesheets')
        .selectAll()
        .where('id', '=', id)
        .execute<TimesheetRow>(),
    );
    const timesheet = rows[0];
    if (!timesheet) throw notFoundError('Timesheet not found');
    return timesheet;
  }

  async updateTimesheet(
    id: number,
    input: Record<string, unknown>,
    actor: DeliveryActor,
  ): Promise<TimesheetDto> {
    const existing = await this.getTimesheet(id);
    if (!canManageDelivery(actor.role) && existing.userId !== actor.userId) {
      throw forbiddenError(
        'A project member may only update their own timesheet',
      );
    }
    const patch = parseTimesheetUpdate(input);
    const workDate =
      patch.workDate ?? coerceDate(existing.workDate) ?? new Date();
    if (patch.workDate !== undefined || patch.hours !== undefined) {
      const duplicate = await this.findDuplicate(
        existing.userId,
        existing.taskId,
        workDate,
        id,
      );
      if (duplicate) {
        throw new DeliveryRuleError(
          DELIVERY_DUPLICATE_TIMESHEET,
          'A timesheet for this task already exists on that day',
          409,
        );
      }
    }
    if (Object.keys(patch).length > 0) {
      try {
        await this.db
          .updateTable('deliveryTimesheets')
          .set({ ...serializeDates(patch), updatedAt: nowIso() })
          .where('id', '=', id)
          .execute();
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new DeliveryRuleError(
            DELIVERY_DUPLICATE_TIMESHEET,
            'A timesheet for this task already exists on that day',
            409,
          );
        }
        throw error;
      }
    }
    return this.getTimesheet(id);
  }

  async deleteTimesheet(id: number, actor: DeliveryActor): Promise<void> {
    const existing = await this.getTimesheet(id);
    if (!canManageDelivery(actor.role) && existing.userId !== actor.userId) {
      throw forbiddenError(
        'A project member may only delete their own timesheet',
      );
    }
    await this.db
      .deleteFrom('deliveryTimesheets')
      .where('id', '=', id)
      .execute();
  }

  // -------------------------------------------------------------- dashboard

  async dashboard(
    actor: DeliveryActor,
    now: Date = new Date(),
  ): Promise<DashboardDto> {
    const [projects, tasks] = await Promise.all([
      this.listProjects(),
      this.listTasks(),
    ]);
    const timesheets = await this.listTimesheets({}, actor);
    const hoursByProject = new Map<number, number>();
    for (const timesheet of timesheets) {
      hoursByProject.set(
        timesheet.projectId,
        (hoursByProject.get(timesheet.projectId) ?? 0) + timesheet.hours,
      );
    }
    const tasksByProject = new Map<number, TaskDto[]>();
    for (const task of tasks) {
      const list = tasksByProject.get(task.projectId) ?? [];
      list.push(task);
      tasksByProject.set(task.projectId, list);
    }
    const dashboardProjects = projects.map((project) => {
      const projectTasks = tasksByProject.get(project.id) ?? [];
      const completed = projectTasks.filter(
        (task) => task.status === 'completed',
      ).length;
      const overdue = projectTasks.filter(
        (task) => taskTimeliness(task, now) === 'overdue',
      ).length;
      return {
        id: project.id,
        name: project.name,
        clientName: project.clientName,
        status: project.status,
        hours: Math.round((hoursByProject.get(project.id) ?? 0) * 100) / 100,
        taskCount: projectTasks.length,
        completedTaskCount: completed,
        completionRate: completionRate(completed, projectTasks.length),
        overdueCount: overdue,
      };
    });
    const overdueTasks = tasks.filter(
      (task) => taskTimeliness(task, now) === 'overdue',
    );
    const totalHours =
      Math.round(
        [...hoursByProject.values()].reduce((sum, value) => sum + value, 0) *
          100,
      ) / 100;
    return { projects: dashboardProjects, overdueTasks, totalHours };
  }

  // ------------------------------------------------------------------ users

  async listMembers(): Promise<{ id: string; name: string }[]> {
    const rows = await this.db
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .orderBy('name', 'asc')
      .execute();
    return rows.map((row) => ({
      id: text(row.id),
      name: text(row.name ?? row.username),
    }));
  }

  // ------------------------------------------------------------ attachments

  async listAttachments(projectId: number): Promise<
    {
      id: string;
      filename: string;
      mimeType: string;
      size: number;
      createdAt: string | null;
    }[]
  > {
    await this.getProject(projectId);
    const links = await this.db
      .selectFrom('deliveryProjectFileLinks')
      .select('fileId')
      .where('projectId', '=', projectId)
      .orderBy('id', 'desc')
      .execute();
    const fileIds = links.map((row) => text(row.fileId));
    if (fileIds.length === 0) return [];
    const files = await this.db
      .selectFrom('deliveryProjectFiles')
      .select(['id', 'filename', 'mimeType', 'size', 'createdAt'])
      .where('id', 'in', fileIds)
      .execute();
    const byId = new Map(files.map((row) => [text(row.id), row]));
    return fileIds
      .map((fileId) => byId.get(fileId))
      .filter((row): row is Row => Boolean(row))
      .map((row) => ({
        id: text(row.id),
        filename: text(row.filename),
        mimeType: text(row.mimeType),
        size: numberOrNull(row.size) ?? 0,
        createdAt: isoOrNull(row.createdAt),
      }));
  }

  async linkAttachment(projectId: number, fileId: string): Promise<void> {
    await this.getProject(projectId);
    await this.db
      .insertInto('deliveryProjectFileLinks')
      .values({ projectId, fileId, createdAt: nowIso() })
      .execute();
  }

  async findAttachmentFile(fileId: string): Promise<{
    projectId: number;
    disk: string;
    key: string;
    filename: string;
    mimeType: string;
    size: number;
  } | null> {
    const link = await this.db
      .selectFrom('deliveryProjectFileLinks')
      .select('projectId')
      .where('fileId', '=', fileId)
      .executeTakeFirst();
    if (!link) return null;
    const file = await this.db
      .selectFrom('deliveryProjectFiles')
      .select(['disk', 'key', 'filename', 'mimeType', 'size'])
      .where('id', '=', fileId)
      .executeTakeFirst();
    if (!file) return null;
    return {
      projectId: Number(link.projectId),
      disk: text(file.disk),
      key: text(file.key),
      filename: text(file.filename),
      mimeType: text(file.mimeType),
      size: numberOrNull(file.size) ?? 0,
    };
  }

  async unlinkAttachment(
    projectId: number,
    fileId: string,
  ): Promise<{ disk: string; key: string } | null> {
    await this.getProject(projectId);
    const file = await this.db
      .selectFrom('deliveryProjectFiles')
      .select(['disk', 'key'])
      .where('id', '=', fileId)
      .executeTakeFirst();
    await this.db
      .deleteFrom('deliveryProjectFileLinks')
      .where('projectId', '=', projectId)
      .where('fileId', '=', fileId)
      .execute();
    if (!file) return null;
    await this.db
      .deleteFrom('deliveryProjectFiles')
      .where('id', '=', fileId)
      .execute();
    return { disk: text(file.disk), key: text(file.key) };
  }

  /** Removes file metadata rows and returns the stored objects to delete. */
  async removeFileMetadata(
    fileIds: readonly string[],
  ): Promise<{ disk: string; key: string }[]> {
    if (fileIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('deliveryProjectFiles')
      .select(['id', 'disk', 'key'])
      .where('id', 'in', [...fileIds])
      .execute();
    await this.db
      .deleteFrom('deliveryProjectFiles')
      .where('id', 'in', [...fileIds])
      .execute();
    return rows.map((row) => ({ disk: text(row.disk), key: text(row.key) }));
  }

  // -------------------------------------------------------------- internals

  private async findDuplicate(
    userId: string,
    taskId: number,
    workDate: Date,
    excludeId?: number,
  ): Promise<boolean> {
    let query = this.db
      .selectFrom('deliveryTimesheets')
      .select('id')
      .where('userId', '=', userId)
      .where('taskId', '=', taskId)
      .where('workDate', '=', workDate.toISOString());
    if (excludeId !== undefined) {
      query = query.where('id', '!=', excludeId);
    }
    return Boolean(await query.executeTakeFirst());
  }

  private async userNames(
    ids: readonly (string | null | undefined)[],
  ): Promise<Map<string, string>> {
    const unique = [
      ...new Set(
        ids.filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        ),
      ),
    ];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .where('id', 'in', unique)
      .execute();
    return new Map(
      rows.map((row) => [text(row.id), text(row.name ?? row.username)]),
    );
  }

  private async projectNames(
    ids: readonly number[],
  ): Promise<Map<number, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('deliveryProjects')
      .select(['id', 'name'])
      .where('id', 'in', unique)
      .execute();
    return new Map(rows.map((row) => [Number(row.id), text(row.name)]));
  }

  private async enrichTasks(rows: readonly TaskRow[]): Promise<TaskDto[]> {
    const [projects, milestones, users] = await Promise.all([
      this.projectNames(rows.map((row) => Number(row.projectId))),
      this.milestoneNames(
        rows
          .map((row) =>
            row.milestoneId == null ? null : Number(row.milestoneId),
          )
          .filter((id): id is number => id !== null),
      ),
      this.userNames(rows.map((row) => row.assigneeId)),
    ]);
    const now = new Date();
    return rows.map((row) => {
      const timeliness = taskTimeliness(row, now);
      return {
        id: Number(row.id),
        name: text(row.name),
        projectId: Number(row.projectId),
        projectName: projects.get(Number(row.projectId)) ?? null,
        milestoneId: row.milestoneId == null ? null : Number(row.milestoneId),
        milestoneName:
          row.milestoneId == null
            ? null
            : (milestones.get(Number(row.milestoneId)) ?? null),
        assigneeId: row.assigneeId ?? null,
        assigneeName:
          row.assigneeId != null ? (users.get(row.assigneeId) ?? null) : null,
        priority: toTaskPriority(row.priority),
        status: toTaskStatus(row.status),
        plannedDate: isoOrNull(row.plannedDate),
        actualDate: isoOrNull(row.actualDate),
        description: row.description ?? null,
        timeliness,
        overdue: timeliness === 'overdue',
        createdAt: isoOrNull(row.createdAt),
        updatedAt: isoOrNull(row.updatedAt),
      };
    });
  }

  private async milestoneNames(
    ids: readonly number[],
  ): Promise<Map<number, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('deliveryMilestones')
      .select(['id', 'name'])
      .where('id', 'in', unique)
      .execute();
    return new Map(rows.map((row) => [Number(row.id), text(row.name)]));
  }

  private async enrichTimesheets(
    rows: readonly TimesheetRow[],
  ): Promise<TimesheetDto[]> {
    const [tasks, projects, users] = await Promise.all([
      this.taskNames(rows.map((row) => Number(row.taskId))),
      this.projectNames(rows.map((row) => Number(row.projectId))),
      this.userNames(rows.map((row) => row.userId)),
    ]);
    return rows.map((row) => ({
      id: Number(row.id),
      userId: text(row.userId),
      userName: users.get(text(row.userId)) ?? null,
      taskId: Number(row.taskId),
      taskName: tasks.get(Number(row.taskId)) ?? null,
      projectId: Number(row.projectId),
      projectName: projects.get(Number(row.projectId)) ?? null,
      workDate: isoOrNull(row.workDate) ?? '',
      hours: numberOrNull(row.hours) ?? 0,
      description: text(row.description),
      createdAt: isoOrNull(row.createdAt),
      updatedAt: isoOrNull(row.updatedAt),
    }));
  }

  private async taskNames(
    ids: readonly number[],
  ): Promise<Map<number, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('deliveryTasks')
      .select(['id', 'name'])
      .where('id', 'in', unique)
      .execute();
    return new Map(rows.map((row) => [Number(row.id), text(row.name)]));
  }

  private toProject(row: ProjectRow, names: Map<string, string>): ProjectDto {
    return {
      id: Number(row.id),
      name: text(row.name),
      clientName: text(row.clientName),
      managerId: row.managerId ?? null,
      managerName:
        row.managerId != null ? (names.get(row.managerId) ?? null) : null,
      startDate: isoOrNull(row.startDate),
      endDate: isoOrNull(row.endDate),
      budgetHours: numberOrNull(row.budgetHours),
      status: toProjectStatus(row.status),
      createdAt: isoOrNull(row.createdAt),
      updatedAt: isoOrNull(row.updatedAt),
    };
  }

  private async requireProject(id: number): Promise<void> {
    const row = await this.db
      .selectFrom('deliveryProjects')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFoundError('Project not found');
  }

  private async requireMilestone(id: number, projectId: number): Promise<void> {
    const row = await this.db
      .selectFrom('deliveryMilestones')
      .select(['id', 'projectId'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFoundError('Milestone not found');
    if (Number(row.projectId) !== projectId) {
      throw new DeliveryRuleError(
        'DELIVERY_VALIDATION',
        'The milestone belongs to another project',
        400,
      );
    }
  }

  private async requireUsers(
    ids: readonly (string | null | undefined)[],
  ): Promise<void> {
    const unique = [
      ...new Set(
        ids.filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        ),
      ),
    ];
    if (unique.length === 0) return;
    const rows = await this.db
      .selectFrom('user')
      .select('id')
      .where('id', 'in', unique)
      .execute();
    if (rows.length !== unique.length) {
      throw new DeliveryRuleError('DELIVERY_VALIDATION', 'Unknown member', 400);
    }
  }
}

// ------------------------------------------------------------------ parsing

interface ProjectCreateValues {
  name: string;
  clientName: string;
  managerId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  budgetHours: number | null;
  status: ProjectStatus;
}
type ProjectUpdateValues = Partial<ProjectCreateValues>;

interface MilestoneCreateValues {
  name: string;
  projectId: number;
  plannedDate: Date | null;
  actualDate: Date | null;
  status: MilestoneStatus;
}
type MilestoneUpdateValues = Partial<MilestoneCreateValues>;

interface TaskCreateValues {
  name: string;
  projectId: number;
  milestoneId: number | null;
  assigneeId: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  plannedDate: Date | null;
  actualDate: Date | null;
  description: string | null;
}
interface TaskUpdateValues {
  name?: string;
  projectId?: number;
  milestoneId?: number | null;
  assigneeId?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  plannedDate?: Date | null;
  actualDate?: Date | null;
  description?: string | null;
}

function parseProjectCreate(
  input: Record<string, unknown>,
): ProjectCreateValues {
  return {
    name: requireString(input.name, 'name'),
    clientName: requireString(input.clientName, 'clientName'),
    managerId: optionalString(input.managerId, 'managerId', 64),
    startDate: parseDate(input.startDate, 'startDate'),
    endDate: parseDate(input.endDate, 'endDate'),
    budgetHours: parseBudgetHours(input.budgetHours),
    status:
      input.status === undefined
        ? 'planning'
        : parseEnum(input.status, PROJECT_STATUSES, 'status'),
  };
}

function parseProjectUpdate(
  input: Record<string, unknown>,
): ProjectUpdateValues {
  const patch: ProjectUpdateValues = {};
  if ('name' in input) patch.name = requireString(input.name, 'name');
  if ('clientName' in input) {
    patch.clientName = requireString(input.clientName, 'clientName');
  }
  if ('managerId' in input) {
    patch.managerId = optionalString(input.managerId, 'managerId', 64);
  }
  if ('startDate' in input)
    patch.startDate = parseDate(input.startDate, 'startDate');
  if ('endDate' in input) patch.endDate = parseDate(input.endDate, 'endDate');
  if ('budgetHours' in input) {
    patch.budgetHours = parseBudgetHours(input.budgetHours);
  }
  if ('status' in input) {
    patch.status = parseEnum(input.status, PROJECT_STATUSES, 'status');
  }
  return patch;
}

function parseMilestoneCreate(
  input: Record<string, unknown>,
): MilestoneCreateValues {
  return {
    name: requireString(input.name, 'name'),
    projectId: requireIdentifier(input.projectId, 'projectId'),
    plannedDate: parseDate(input.plannedDate, 'plannedDate'),
    actualDate: parseDate(input.actualDate, 'actualDate'),
    status:
      input.status === undefined
        ? 'not_started'
        : parseEnum(input.status, MILESTONE_STATUSES, 'status'),
  };
}

function parseMilestoneUpdate(
  input: Record<string, unknown>,
): MilestoneUpdateValues {
  const patch: MilestoneUpdateValues = {};
  if ('name' in input) patch.name = requireString(input.name, 'name');
  if ('projectId' in input) {
    patch.projectId = requireIdentifier(input.projectId, 'projectId');
  }
  if ('plannedDate' in input) {
    patch.plannedDate = parseDate(input.plannedDate, 'plannedDate');
  }
  if ('actualDate' in input) {
    patch.actualDate = parseDate(input.actualDate, 'actualDate');
  }
  if ('status' in input) {
    patch.status = parseEnum(input.status, MILESTONE_STATUSES, 'status');
  }
  return patch;
}

function parseTaskCreate(input: Record<string, unknown>): TaskCreateValues {
  return {
    name: requireString(input.name, 'name'),
    projectId: requireIdentifier(input.projectId, 'projectId'),
    milestoneId: parseIdentifier(input.milestoneId, 'milestoneId'),
    assigneeId: optionalString(input.assigneeId, 'assigneeId', 64),
    priority:
      input.priority === undefined
        ? 'medium'
        : parseEnum(input.priority, TASK_PRIORITIES, 'priority'),
    status:
      input.status === undefined
        ? 'todo'
        : parseEnum(input.status, TASK_STATUSES, 'status'),
    plannedDate: parseDate(input.plannedDate, 'plannedDate'),
    actualDate: parseDate(input.actualDate, 'actualDate'),
    description: optionalString(input.description, 'description', 4000),
  };
}

function parseTaskUpdate(input: Record<string, unknown>): TaskUpdateValues {
  const patch: TaskUpdateValues = {};
  if ('name' in input) patch.name = requireString(input.name, 'name');
  if ('projectId' in input) {
    patch.projectId = requireIdentifier(input.projectId, 'projectId');
  }
  if ('milestoneId' in input) {
    patch.milestoneId = parseIdentifier(input.milestoneId, 'milestoneId');
  }
  if ('assigneeId' in input) {
    patch.assigneeId = optionalString(input.assigneeId, 'assigneeId', 64);
  }
  if ('priority' in input) {
    patch.priority = parseEnum(input.priority, TASK_PRIORITIES, 'priority');
  }
  if ('status' in input) {
    patch.status = parseEnum(input.status, TASK_STATUSES, 'status');
  }
  if ('plannedDate' in input) {
    patch.plannedDate = parseDate(input.plannedDate, 'plannedDate');
  }
  if ('actualDate' in input) {
    patch.actualDate = parseDate(input.actualDate, 'actualDate');
  }
  if ('description' in input) {
    patch.description = optionalString(input.description, 'description', 4000);
  }
  return patch;
}

function parseTimesheetCreate(input: Record<string, unknown>): {
  taskId: number;
  userId: string | null;
  workDate: Date;
  hours: number;
  description: string;
} {
  const workDate = parseDate(input.workDate, 'workDate');
  if (!workDate)
    throw new DeliveryRuleError(
      'DELIVERY_VALIDATION',
      'workDate is required',
      400,
    );
  return {
    taskId: requireIdentifier(input.taskId, 'taskId'),
    userId: optionalString(input.userId, 'userId', 64),
    workDate: new Date(startOfUtcDay(workDate)),
    hours: parseHours(input.hours),
    description: requireString(input.description, 'description', 4000),
  };
}

function parseTimesheetUpdate(input: Record<string, unknown>): {
  workDate?: Date;
  hours?: number;
  description?: string;
} {
  const patch: { workDate?: Date; hours?: number; description?: string } = {};
  if ('workDate' in input) {
    const workDate = parseDate(input.workDate, 'workDate');
    if (!workDate) {
      throw new DeliveryRuleError(
        'DELIVERY_VALIDATION',
        'workDate is required',
        400,
      );
    }
    patch.workDate = new Date(startOfUtcDay(workDate));
  }
  if ('hours' in input) patch.hours = parseHours(input.hours);
  if ('description' in input) {
    patch.description = requireString(input.description, 'description', 4000);
  }
  return patch;
}

export function assertCanManage(role: DeliveryRole): void {
  if (!canManageDelivery(role)) {
    throw forbiddenError('Only a project manager or administrator may do this');
  }
}
