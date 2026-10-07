import { randomUUID } from 'node:crypto';

import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type FilterBuilder,
  type FilterNode,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * Task-and-deliverable project collaboration.
 *
 * Access is decided per record here rather than through a permission set: a user reaches a project only through
 * membership, a deliverable's file only as its submitter, the project owner, or the holder of an active share. The
 * service takes the caller's account id as an argument and never reads a request context, so the same rules are
 * testable in isolation and cannot be bypassed by a different route.
 */

export type ServiceStatus =
  | 'INVALID_ARGUMENT'
  | 'FAILED_PRECONDITION'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'ALREADY_EXISTS';

export class ProjectCollaborationError extends Error {
  public constructor(
    public readonly status: ServiceStatus,
    public readonly reason: string,
    message: string,
    public readonly fieldViolations: readonly {
      readonly field: string;
      readonly description: string;
    }[] = [],
  ) {
    super(message);
    this.name = 'ProjectCollaborationError';
  }
}

export type ProjectStatus = 'active' | 'completed' | 'archived';
export type MemberRole = 'owner' | 'member';
export type MilestoneStatus = 'open' | 'in_progress' | 'completed';
export type TaskStatus =
  'not_started' | 'in_progress' | 'pending_acceptance' | 'completed';
export type TaskPriority = 'low' | 'normal' | 'high';
export type DeliverableStatus = 'pending' | 'accepted' | 'rejected';

export interface ProjectView {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectStatus;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly memberCount: number;
  readonly taskCount: number;
  readonly completedTaskCount: number;
  readonly progress: number;
  readonly myRole: MemberRole;
}

export interface MemberView {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly role: MemberRole;
  readonly name: string | null;
  readonly email: string | null;
  readonly username: string | null;
  readonly createdAt: string;
}

export interface MilestoneView {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly status: MilestoneStatus;
  readonly position: number;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly taskCount: number;
  readonly completedTaskCount: number;
  readonly canComplete: boolean;
}

export interface TaskView {
  readonly id: string;
  readonly projectId: string;
  readonly milestoneId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly dueDate: string | null;
  readonly required: boolean;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deliverableCount: number;
  readonly pendingDeliverableCount: number;
  readonly overdue: boolean;
  readonly canUpdate: boolean;
}

export interface ShareView {
  readonly id: string;
  readonly deliverableId: string;
  readonly sharedWithId: string;
  readonly sharedWithName: string | null;
  readonly sharedWithEmail: string | null;
  readonly sharedById: string;
  readonly sharedByName: string | null;
  readonly createdAt: string;
}

export interface DeliverableView {
  readonly id: string;
  readonly taskId: string;
  readonly projectId: string;
  readonly submitterId: string;
  readonly submitterName: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: DeliverableStatus;
  readonly rejectReason: string | null;
  readonly reviewerId: string | null;
  readonly reviewerName: string | null;
  readonly reviewedAt: string | null;
  readonly fileId: string | null;
  readonly fileName: string | null;
  readonly fileExt: string | null;
  readonly fileMimeType: string | null;
  readonly fileSize: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly canSubmitterShare: boolean;
  readonly canReview: boolean;
  readonly shares: readonly ShareView[];
}

export interface ProjectDetailView {
  readonly project: ProjectView;
  readonly members: readonly MemberView[];
  readonly milestones: readonly MilestoneView[];
  readonly tasks: readonly TaskView[];
  readonly deliverables: readonly DeliverableView[];
}

export interface DashboardProjectView {
  readonly id: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly progress: number;
  readonly taskCount: number;
  readonly completedTaskCount: number;
  readonly overdueTaskCount: number;
  readonly pendingDeliverableCount: number;
  readonly endDate: string | null;
}

export interface DashboardView {
  readonly metrics: {
    readonly projectCount: number;
    readonly openTaskCount: number;
    readonly overdueTaskCount: number;
    readonly pendingAcceptanceCount: number;
  };
  readonly projects: readonly DashboardProjectView[];
  readonly todos: readonly TaskView[];
}

export interface CreateProjectInput {
  readonly name: string;
  readonly description?: string | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
}

export interface UpdateProjectInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly status?: ProjectStatus;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly ownerId?: string;
}

export interface CreateMilestoneInput {
  readonly name: string;
  readonly description?: string | null;
  readonly dueDate?: string | null;
  readonly position?: number;
}

export interface UpdateMilestoneInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly dueDate?: string | null;
  readonly position?: number;
}

export interface CreateTaskInput {
  readonly title: string;
  readonly description?: string | null;
  readonly assigneeId?: string | null;
  readonly milestoneId?: string | null;
  readonly priority?: TaskPriority;
  readonly dueDate?: string | null;
  readonly required?: boolean;
}

export interface UpdateTaskInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly assigneeId?: string | null;
  readonly milestoneId?: string | null;
  readonly priority?: TaskPriority;
  readonly dueDate?: string | null;
  readonly required?: boolean;
  readonly status?: TaskStatus;
}

export interface SubmitDeliverableInput {
  readonly title: string;
  readonly description?: string | null;
  readonly fileId?: string | null;
}

export interface ProjectsService {
  listProjects(userId: string): Promise<readonly ProjectView[]>;
  getProject(projectId: string, userId: string): Promise<ProjectDetailView>;
  createProject(
    userId: string,
    input: CreateProjectInput,
  ): Promise<ProjectView>;
  updateProject(
    projectId: string,
    userId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectView>;
  deleteProject(projectId: string, userId: string): Promise<void>;
  addMember(
    projectId: string,
    userId: string,
    targetUserId: string,
    role: MemberRole,
  ): Promise<MemberView>;
  removeMember(
    projectId: string,
    userId: string,
    targetUserId: string,
  ): Promise<void>;
  createMilestone(
    projectId: string,
    userId: string,
    input: CreateMilestoneInput,
  ): Promise<MilestoneView>;
  updateMilestone(
    milestoneId: string,
    userId: string,
    input: UpdateMilestoneInput,
  ): Promise<MilestoneView>;
  completeMilestone(
    milestoneId: string,
    userId: string,
  ): Promise<MilestoneView>;
  deleteMilestone(milestoneId: string, userId: string): Promise<void>;
  createTask(
    projectId: string,
    userId: string,
    input: CreateTaskInput,
  ): Promise<TaskView>;
  getTask(taskId: string, userId: string): Promise<TaskView>;
  getDeliverable(
    deliverableId: string,
    userId: string,
  ): Promise<DeliverableView>;
  updateTask(
    taskId: string,
    userId: string,
    input: UpdateTaskInput,
  ): Promise<TaskView>;
  deleteTask(taskId: string, userId: string): Promise<void>;
  submitDeliverable(
    taskId: string,
    userId: string,
    input: SubmitDeliverableInput,
  ): Promise<DeliverableView>;
  acceptDeliverable(
    deliverableId: string,
    userId: string,
  ): Promise<DeliverableView>;
  rejectDeliverable(
    deliverableId: string,
    userId: string,
    reason: string,
  ): Promise<DeliverableView>;
  shareDeliverable(
    deliverableId: string,
    userId: string,
    targetUserId: string,
  ): Promise<ShareView>;
  revokeDeliverableShare(
    deliverableId: string,
    userId: string,
    shareId: string,
  ): Promise<void>;
  assertDeliverableContentAccess(
    deliverableId: string,
    userId: string,
  ): Promise<{ deliverableId: string; fileId: string | null }>;
  getDashboard(userId: string): Promise<DashboardView>;
  /** A lightweight directory for member, assignee and share pickers. */
  listCollaborators(search?: string): Promise<
    readonly {
      readonly id: string;
      readonly name: string | null;
      readonly email: string | null;
      readonly username: string | null;
    }[]
  >;
  /** Tasks past their due date and still open, with the assignee each reminder belongs to. */
  findOverdueTasks(reference?: Date): Promise<
    readonly {
      readonly taskId: string;
      readonly title: string;
      readonly projectId: string;
      readonly projectName: string;
      readonly assigneeId: string;
      readonly dueDate: string;
    }[]
  >;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  ownerId: string;
  startDate: string | Date | null;
  endDate: string | Date | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface MemberRow {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface MilestoneRow {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  dueDate: string | Date | null;
  status: string;
  position: number;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface TaskRow {
  id: string;
  projectId: string;
  milestoneId: string | null;
  title: string;
  description: string | null;
  assigneeId: string | null;
  status: string;
  priority: string;
  dueDate: string | Date | null;
  required: boolean;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface DeliverableRow {
  id: string;
  taskId: string;
  projectId: string;
  submitterId: string;
  title: string;
  description: string | null;
  status: string;
  rejectReason: string | null;
  reviewerId: string | null;
  reviewedAt: Date | string | null;
  fileId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ShareRow {
  id: string;
  deliverableId: string;
  sharedWithId: string;
  sharedById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface FileRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: string | number;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
}

/**
 * `$or` over equality on one string field.
 *
 * The Repository filter shorthand only accepts a scalar per field, so a set membership test is expressed as this
 * group instead of a `$in`. Callers guard the empty case: an empty group has no useful meaning.
 */
function anyOf<TRecord extends object>(
  filter: FilterBuilder<TRecord>,
  field: keyof TRecord & string,
  values: readonly string[],
): FilterNode {
  return filter.or(values.map((value) => filter.string(field).eq(value)));
}

const ACTIVE_TASK_STATUSES: readonly string[] = [
  'not_started',
  'in_progress',
  'pending_acceptance',
];

function touch(): Date {
  return new Date();
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function dateOnly(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function todayIso(reference: Date): string {
  return reference.toISOString().slice(0, 10);
}

function asProjectStatus(value: string): ProjectStatus {
  return value as ProjectStatus;
}

function asMemberRole(value: string): MemberRole {
  return value === 'owner' ? 'owner' : 'member';
}

function asMilestoneStatus(value: string): MilestoneStatus {
  return value as MilestoneStatus;
}

function asTaskStatus(value: string): TaskStatus {
  return value as TaskStatus;
}

function asTaskPriority(value: string): TaskPriority {
  return value as TaskPriority;
}

function asDeliverableStatus(value: string): DeliverableStatus {
  return value as DeliverableStatus;
}

export function createProjectsService(
  database: DatabaseManager,
): ProjectsService {
  const projects = () => database.repository<ProjectRow>('projects');
  const members = () => database.repository<MemberRow>('project_members');
  const milestones = () => database.repository<MilestoneRow>('milestones');
  const tasks = () => database.repository<TaskRow>('tasks');
  const deliverables = () =>
    database.repository<DeliverableRow>('deliverables');
  const shares = () => database.repository<ShareRow>('deliverable_shares');
  const users = () => database.repository<UserRow>('user');

  async function loadUsers(
    ids: Iterable<string | null | undefined>,
  ): Promise<Map<string, UserRow>> {
    const unique = [...new Set([...ids].filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    const rows = await users().findMany({
      filter: (filter) => anyOf(filter, 'id', unique),
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  function displayName(user: UserRow | undefined): string | null {
    if (!user) return null;
    return user.name ?? user.username ?? user.email ?? null;
  }

  async function membershipRole(
    projectId: string,
    userId: string,
  ): Promise<MemberRole | null> {
    const project = await projects().findOne({ filter: { id: projectId } });
    if (project?.ownerId === userId) return 'owner';
    const member = await members().findOne({
      filter: { projectId, userId },
    });
    if (!member) return null;
    return asMemberRole(member.role);
  }

  async function requireMembership(
    projectId: string,
    userId: string,
  ): Promise<MemberRole> {
    const role = await membershipRole(projectId, userId);
    if (!role) {
      throw new ProjectCollaborationError(
        'PERMISSION_DENIED',
        'PROJECT_ACCESS_DENIED',
        `User ${userId} is not a member of project ${projectId}.`,
      );
    }
    return role;
  }

  async function requireOwner(
    projectId: string,
    userId: string,
  ): Promise<ProjectRow> {
    const role = await membershipRole(projectId, userId);
    if (role !== 'owner') {
      throw new ProjectCollaborationError(
        'PERMISSION_DENIED',
        'PROJECT_OWNER_REQUIRED',
        `Only the project owner may perform this operation on project ${projectId}.`,
      );
    }
    const project = await projects().findOne({ filter: { id: projectId } });
    if (!project) {
      throw new ProjectCollaborationError(
        'NOT_FOUND',
        'PROJECT_NOT_FOUND',
        `Project ${projectId} was not found.`,
      );
    }
    return project;
  }

  async function requireProject(projectId: string): Promise<ProjectRow> {
    const project = await projects().findOne({ filter: { id: projectId } });
    if (!project) {
      throw new ProjectCollaborationError(
        'NOT_FOUND',
        'PROJECT_NOT_FOUND',
        `Project ${projectId} was not found.`,
      );
    }
    return project;
  }

  function projectTaskStats(taskRows: readonly TaskRow[]): {
    taskCount: number;
    completedTaskCount: number;
    progress: number;
  } {
    const relevant = taskRows.filter((task) => task.required);
    const pool = relevant.length > 0 ? relevant : taskRows;
    const completed = pool.filter((task) => task.status === 'completed').length;
    const progress =
      pool.length === 0 ? 0 : Math.round((completed / pool.length) * 100);
    return { taskCount: pool.length, completedTaskCount: completed, progress };
  }

  function toTaskView(
    row: TaskRow,
    userMap: Map<string, UserRow>,
    counts: Map<string, { total: number; pending: number }>,
    viewerId: string,
    role: MemberRole,
    reference: Date,
  ): TaskView {
    const count = counts.get(row.id) ?? { total: 0, pending: 0 };
    const canUpdate =
      role === 'owner' ||
      (row.assigneeId !== null && row.assigneeId === viewerId);
    return {
      id: row.id,
      projectId: row.projectId,
      milestoneId: row.milestoneId,
      title: row.title,
      description: row.description,
      assigneeId: row.assigneeId,
      assigneeName: displayName(userMap.get(row.assigneeId ?? '')),
      status: asTaskStatus(row.status),
      priority: asTaskPriority(row.priority),
      dueDate: dateOnly(row.dueDate),
      required: row.required,
      completedAt: iso(row.completedAt),
      createdAt: iso(row.createdAt) ?? '',
      updatedAt: iso(row.updatedAt) ?? '',
      deliverableCount: count.total,
      pendingDeliverableCount: count.pending,
      overdue:
        row.status !== 'completed' &&
        row.dueDate !== null &&
        dateOnly(row.dueDate)! < todayIso(reference),
      canUpdate,
    };
  }

  function toMilestoneView(
    row: MilestoneRow,
    taskRows: readonly TaskRow[],
  ): MilestoneView {
    const scoped = taskRows.filter((task) => task.milestoneId === row.id);
    const required = scoped.filter((task) => task.required);
    const unfinished = required.filter((task) => task.status !== 'completed');
    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      description: row.description,
      dueDate: dateOnly(row.dueDate),
      status: asMilestoneStatus(row.status),
      position: row.position,
      completedAt: iso(row.completedAt),
      createdAt: iso(row.createdAt) ?? '',
      updatedAt: iso(row.updatedAt) ?? '',
      taskCount: scoped.length,
      completedTaskCount: scoped.filter((task) => task.status === 'completed')
        .length,
      canComplete: row.status !== 'completed' && unfinished.length === 0,
    };
  }

  async function toProjectView(
    row: ProjectRow,
    userMap: Map<string, UserRow>,
    taskRows: readonly TaskRow[],
    memberCount: number,
    role: MemberRole,
  ): Promise<ProjectView> {
    const stats = projectTaskStats(taskRows);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: asProjectStatus(row.status),
      ownerId: row.ownerId,
      ownerName: displayName(userMap.get(row.ownerId)),
      startDate: dateOnly(row.startDate),
      endDate: dateOnly(row.endDate),
      createdAt: iso(row.createdAt) ?? '',
      updatedAt: iso(row.updatedAt) ?? '',
      memberCount,
      taskCount: stats.taskCount,
      completedTaskCount: stats.completedTaskCount,
      progress: stats.progress,
      myRole: role,
    };
  }

  async function buildDeliverableViews(
    rows: readonly DeliverableRow[],
    role: MemberRole,
    viewerId: string,
  ): Promise<DeliverableView[]> {
    const shareRows =
      rows.length === 0
        ? []
        : await shares().findMany({
            filter: (filter) =>
              anyOf(
                filter,
                'deliverableId',
                rows.map((row) => row.id),
              ),
          });
    const fileIds = rows
      .map((row) => row.fileId)
      .filter((id): id is string => !!id);
    const fileRows =
      fileIds.length === 0
        ? []
        : await database.repository<FileRow>('deliverable_files').findMany({
            filter: (filter) => anyOf(filter, 'id', fileIds),
          });
    const fileMap = new Map(fileRows.map((row) => [row.id, row]));
    const userMap = await loadUsers([
      ...rows.map((row) => row.submitterId),
      ...rows.map((row) => row.reviewerId),
      ...shareRows.map((row) => row.sharedWithId),
      ...shareRows.map((row) => row.sharedById),
    ]);
    const shareMap = new Map<string, ShareView[]>();
    for (const share of shareRows) {
      const list = shareMap.get(share.deliverableId) ?? [];
      list.push({
        id: share.id,
        deliverableId: share.deliverableId,
        sharedWithId: share.sharedWithId,
        sharedWithName: displayName(userMap.get(share.sharedWithId)),
        sharedWithEmail: userMap.get(share.sharedWithId)?.email ?? null,
        sharedById: share.sharedById,
        sharedByName: displayName(userMap.get(share.sharedById)),
        createdAt: iso(share.createdAt) ?? '',
      });
      shareMap.set(share.deliverableId, list);
    }
    return rows.map((row) => {
      const file = row.fileId ? fileMap.get(row.fileId) : undefined;
      return {
        id: row.id,
        taskId: row.taskId,
        projectId: row.projectId,
        submitterId: row.submitterId,
        submitterName: displayName(userMap.get(row.submitterId)),
        title: row.title,
        description: row.description,
        status: asDeliverableStatus(row.status),
        rejectReason: row.rejectReason,
        reviewerId: row.reviewerId,
        reviewerName: displayName(userMap.get(row.reviewerId ?? '')),
        reviewedAt: iso(row.reviewedAt),
        fileId: row.fileId,
        fileName: file?.filename ?? null,
        fileExt: file?.ext ?? null,
        fileMimeType: file?.mimeType ?? null,
        fileSize: file ? String(file.size) : null,
        createdAt: iso(row.createdAt) ?? '',
        updatedAt: iso(row.updatedAt) ?? '',
        canSubmitterShare: role === 'owner' || row.submitterId === viewerId,
        canReview: role === 'owner' && row.status === 'pending',
        shares: shareMap.get(row.id) ?? [],
      };
    });
  }

  async function findDeliverable(
    deliverableId: string,
  ): Promise<DeliverableRow> {
    const row = await deliverables().findOne({
      filter: { id: deliverableId },
    });
    if (!row) {
      throw new ProjectCollaborationError(
        'NOT_FOUND',
        'DELIVERABLE_NOT_FOUND',
        `Deliverable ${deliverableId} was not found.`,
      );
    }
    return row;
  }

  async function requireTask(taskId: string): Promise<TaskRow> {
    const row = await tasks().findOne({ filter: { id: taskId } });
    if (!row) {
      throw new ProjectCollaborationError(
        'NOT_FOUND',
        'TASK_NOT_FOUND',
        `Task ${taskId} was not found.`,
      );
    }
    return row;
  }

  async function requireMilestone(milestoneId: string): Promise<MilestoneRow> {
    const row = await milestones().findOne({
      filter: { id: milestoneId },
    });
    if (!row) {
      throw new ProjectCollaborationError(
        'NOT_FOUND',
        'MILESTONE_NOT_FOUND',
        `Milestone ${milestoneId} was not found.`,
      );
    }
    return row;
  }

  async function requireUser(userId: string): Promise<UserRow> {
    const row = await users().findOne({ filter: { id: userId } });
    if (!row) {
      throw new ProjectCollaborationError(
        'INVALID_ARGUMENT',
        'USER_NOT_FOUND',
        `User ${userId} was not found.`,
        [{ field: 'userId', description: `User ${userId} was not found.` }],
      );
    }
    return row;
  }

  async function decorTaskViews(
    taskRows: readonly TaskRow[],
    viewerId: string,
    role: MemberRole,
    reference = new Date(),
  ): Promise<TaskView[]> {
    const counts = new Map<string, { total: number; pending: number }>();
    if (taskRows.length > 0) {
      const deliverableRows = await deliverables().findMany({
        filter: (filter) =>
          anyOf(
            filter,
            'taskId',
            taskRows.map((row) => row.id),
          ),
      });
      for (const row of deliverableRows) {
        const entry = counts.get(row.taskId) ?? { total: 0, pending: 0 };
        entry.total += 1;
        if (row.status === 'pending') entry.pending += 1;
        counts.set(row.taskId, entry);
      }
    }
    const userMap = await loadUsers(taskRows.map((row) => row.assigneeId));
    return taskRows.map((row) =>
      toTaskView(row, userMap, counts, viewerId, role, reference),
    );
  }

  return {
    async listProjects(userId) {
      const memberRows = await members().findMany({
        filter: { userId },
      });
      const ids = memberRows.map((row) => row.projectId);
      const rows = await projects().findMany({
        filter: (filter) =>
          filter.or([
            filter.string('ownerId').eq(userId),
            ...(ids.length === 0 ? [] : [anyOf(filter, 'id', ids)]),
          ]),
        sort: (sort) => sort.field('createdAt').desc(),
      });
      if (rows.length === 0) return [];
      const allTasks = await tasks().findMany({
        filter: (filter) =>
          anyOf(
            filter,
            'projectId',
            rows.map((row) => row.id),
          ),
      });
      const allMembers = await members().findMany({
        filter: (filter) =>
          anyOf(
            filter,
            'projectId',
            rows.map((row) => row.id),
          ),
      });
      const userMap = await loadUsers(rows.map((row) => row.ownerId));
      const memberCount = new Map<string, number>();
      const roleByProject = new Map<string, MemberRole>();
      for (const member of allMembers) {
        memberCount.set(
          member.projectId,
          (memberCount.get(member.projectId) ?? 0) + 1,
        );
        if (member.userId === userId && !roleByProject.has(member.projectId)) {
          roleByProject.set(member.projectId, asMemberRole(member.role));
        }
      }
      return Promise.all(
        rows.map((row) => {
          const role =
            row.ownerId === userId
              ? 'owner'
              : (roleByProject.get(row.id) ?? 'member');
          const scoped = allTasks.filter((task) => task.projectId === row.id);
          return toProjectView(
            row,
            userMap,
            scoped,
            memberCount.get(row.id) ?? 0,
            role,
          );
        }),
      );
    },

    async getProject(projectId, userId) {
      const role = await requireMembership(projectId, userId);
      const project = await requireProject(projectId);
      const [memberRows, milestoneRows, taskRows, deliverableRows] =
        await Promise.all([
          members().findMany({
            filter: { projectId },
            sort: (sort) => sort.field('createdAt').asc(),
          }),
          milestones().findMany({
            filter: { projectId },
            sort: (sort) => sort.field('position').asc(),
          }),
          tasks().findMany({
            filter: { projectId },
            sort: (sort) => sort.field('createdAt').asc(),
          }),
          deliverables().findMany({
            filter: { projectId },
            sort: (sort) => sort.field('createdAt').desc(),
          }),
        ]);
      const memberUserMap = await loadUsers(
        memberRows.map((row) => row.userId),
      );
      const ownerMap = await loadUsers([project.ownerId]);
      const view = await toProjectView(
        project,
        ownerMap,
        taskRows,
        memberRows.length,
        role,
      );
      const [taskViews, deliverableViews] = await Promise.all([
        decorTaskViews(taskRows, userId, role),
        buildDeliverableViews(deliverableRows, role, userId),
      ]);
      return {
        project: view,
        members: memberRows.map((row) => ({
          id: row.id,
          projectId: row.projectId,
          userId: row.userId,
          role: asMemberRole(row.role),
          name: memberUserMap.get(row.userId)?.name ?? null,
          email: memberUserMap.get(row.userId)?.email ?? null,
          username: memberUserMap.get(row.userId)?.username ?? null,
          createdAt: iso(row.createdAt) ?? '',
        })),
        milestones: milestoneRows.map((row) => toMilestoneView(row, taskRows)),
        tasks: taskViews,
        deliverables: deliverableViews,
      };
    },

    async createProject(userId, input) {
      const now = touch();
      const id = randomUUID();
      await database.transaction(async (connection) => {
        await connection.repository<ProjectRow>('projects').createOne({
          values: {
            id,
            name: input.name,
            description: input.description ?? null,
            status: 'active',
            ownerId: userId,
            startDate: input.startDate ?? null,
            endDate: input.endDate ?? null,
            createdAt: now,
            updatedAt: now,
          },
        });
        // The owner is also a member row so membership is the single access source.
        await connection.repository<MemberRow>('project_members').createOne({
          values: {
            id: randomUUID(),
            projectId: id,
            userId,
            role: 'owner',
            createdAt: now,
            updatedAt: now,
          } as Partial<MemberRow>,
        });
      });
      const project = await requireProject(id);
      const userMap = await loadUsers([userId]);
      return toProjectView(project, userMap, [], 1, 'owner');
    },

    async updateProject(projectId, userId, input) {
      await requireOwner(projectId, userId);
      if (input.ownerId !== undefined) {
        await requireUser(input.ownerId);
      }
      const now = touch();
      const values: Record<string, unknown> = { updatedAt: now };
      if (input.name !== undefined) values.name = input.name;
      if (input.description !== undefined)
        values.description = input.description;
      if (input.status !== undefined) values.status = input.status;
      if (input.startDate !== undefined) values.startDate = input.startDate;
      if (input.endDate !== undefined) values.endDate = input.endDate;
      if (input.ownerId !== undefined) values.ownerId = input.ownerId;
      await database.transaction(async (connection) => {
        await connection.repository<ProjectRow>('projects').updateOne({
          filter: { id: projectId },
          values,
        });
        if (input.ownerId !== undefined && input.ownerId !== userId) {
          const repo = connection.repository<MemberRow>('project_members');
          await repo.updateOne({
            filter: { projectId, userId: input.ownerId },
            values: { role: 'owner', updatedAt: now } as Partial<MemberRow>,
          });
          const existing = await repo.findOne({
            filter: { projectId, userId: input.ownerId },
          });
          if (!existing) {
            await repo.createOne({
              values: {
                id: randomUUID(),
                projectId,
                userId: input.ownerId,
                role: 'owner',
                createdAt: now,
                updatedAt: now,
              } as Partial<MemberRow>,
            });
          }
          await repo.updateOne({
            filter: { projectId, userId },
            values: { role: 'member', updatedAt: now } as Partial<MemberRow>,
          });
        }
      });
      const project = await requireProject(projectId);
      const taskRows = await tasks().findMany({ filter: { projectId } });
      const memberCount = await members().count({ filter: { projectId } });
      const userMap = await loadUsers([project.ownerId]);
      const role = project.ownerId === userId ? 'owner' : 'member';
      return toProjectView(project, userMap, taskRows, memberCount, role);
    },

    async deleteProject(projectId, userId) {
      await requireOwner(projectId, userId);
      await projects().deleteOne({ filter: { id: projectId } });
    },

    async addMember(projectId, userId, targetUserId, role) {
      await requireOwner(projectId, userId);
      const user = await requireUser(targetUserId);
      const existing = await members().findOne({
        filter: { projectId, userId: targetUserId },
      });
      if (existing) {
        throw new ProjectCollaborationError(
          'ALREADY_EXISTS',
          'MEMBER_ALREADY_EXISTS',
          `User ${targetUserId} is already a member of project ${projectId}.`,
        );
      }
      const now = touch();
      const id = randomUUID();
      await members().createOne({
        values: {
          id,
          projectId,
          userId: targetUserId,
          role,
          createdAt: now,
          updatedAt: now,
        } as Partial<MemberRow>,
      });
      return {
        id,
        projectId,
        userId: targetUserId,
        role,
        name: user.name,
        email: user.email,
        username: user.username,
        createdAt: now.toISOString(),
      };
    },

    async removeMember(projectId, userId, targetUserId) {
      const project = await requireOwner(projectId, userId);
      if (targetUserId === project.ownerId) {
        throw new ProjectCollaborationError(
          'FAILED_PRECONDITION',
          'OWNER_CANNOT_BE_REMOVED',
          'The project owner cannot be removed from the project.',
        );
      }
      const existing = await members().findOne({
        filter: { projectId, userId: targetUserId },
      });
      if (!existing) {
        throw new ProjectCollaborationError(
          'NOT_FOUND',
          'MEMBER_NOT_FOUND',
          `User ${targetUserId} is not a member of project ${projectId}.`,
        );
      }
      await members().deleteOne({ filter: { id: existing.id } });
    },

    async createMilestone(projectId, userId, input) {
      await requireOwner(projectId, userId);
      const now = touch();
      const id = randomUUID();
      const count = await milestones().count({ filter: { projectId } });
      await milestones().createOne({
        values: {
          id,
          projectId,
          name: input.name,
          description: input.description ?? null,
          dueDate: input.dueDate ?? null,
          status: 'open',
          position: input.position ?? count + 1,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      });
      const row = await requireMilestone(id);
      const taskRows = await tasks().findMany({ filter: { projectId } });
      return toMilestoneView(row, taskRows);
    },

    async updateMilestone(milestoneId, userId, input) {
      const existing = await requireMilestone(milestoneId);
      await requireOwner(existing.projectId, userId);
      const values: Record<string, unknown> = { updatedAt: touch() };
      if (input.name !== undefined) values.name = input.name;
      if (input.description !== undefined)
        values.description = input.description;
      if (input.dueDate !== undefined) values.dueDate = input.dueDate;
      if (input.position !== undefined) values.position = input.position;
      await milestones().updateOne({
        filter: { id: milestoneId },
        values,
      });
      const row = await requireMilestone(milestoneId);
      const taskRows = await tasks().findMany({
        filter: { projectId: row.projectId },
      });
      return toMilestoneView(row, taskRows);
    },

    async completeMilestone(milestoneId, userId) {
      const existing = await requireMilestone(milestoneId);
      await requireOwner(existing.projectId, userId);
      const scoped = await tasks().findMany({
        filter: { milestoneId },
      });
      const unfinished = scoped.filter(
        (task) => task.required && task.status !== 'completed',
      );
      if (unfinished.length > 0) {
        throw new ProjectCollaborationError(
          'FAILED_PRECONDITION',
          'MILESTONE_HAS_UNFINISHED_TASKS',
          `Milestone ${milestoneId} still has ${unfinished.length} required task(s) unfinished.`,
        );
      }
      const now = touch();
      await milestones().updateOne({
        filter: { id: milestoneId },
        values: {
          status: 'completed',
          completedAt: now,
          updatedAt: now,
        },
      });
      const row = await requireMilestone(milestoneId);
      const taskRows = await tasks().findMany({
        filter: { projectId: row.projectId },
      });
      return toMilestoneView(row, taskRows);
    },

    async deleteMilestone(milestoneId, userId) {
      const existing = await requireMilestone(milestoneId);
      await requireOwner(existing.projectId, userId);
      await milestones().deleteOne({ filter: { id: milestoneId } });
    },

    async createTask(projectId, userId, input) {
      await requireOwner(projectId, userId);
      if (input.milestoneId) {
        const milestone = await requireMilestone(input.milestoneId);
        if (milestone.projectId !== projectId) {
          throw new ProjectCollaborationError(
            'INVALID_ARGUMENT',
            'TASK_MILESTONE_MISMATCH',
            `Milestone ${input.milestoneId} does not belong to project ${projectId}.`,
            [
              {
                field: 'milestoneId',
                description: 'The milestone belongs to another project.',
              },
            ],
          );
        }
      }
      if (input.assigneeId) {
        await requireUser(input.assigneeId);
      }
      const now = touch();
      const id = randomUUID();
      await tasks().createOne({
        values: {
          id,
          projectId,
          milestoneId: input.milestoneId ?? null,
          title: input.title,
          description: input.description ?? null,
          assigneeId: input.assigneeId ?? null,
          status: 'not_started',
          priority: input.priority ?? 'normal',
          dueDate: input.dueDate ?? null,
          required: input.required ?? true,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        } as Partial<TaskRow>,
      });
      const row = await requireTask(id);
      const [view] = await decorTaskViews([row], userId, 'owner');
      return view;
    },

    async getTask(taskId, userId) {
      const row = await requireTask(taskId);
      const role = await requireMembership(row.projectId, userId);
      const [view] = await decorTaskViews([row], userId, role);
      return view;
    },

    async updateTask(taskId, userId, input) {
      const row = await requireTask(taskId);
      const role = await requireMembership(row.projectId, userId);
      const isAssignee = row.assigneeId !== null && row.assigneeId === userId;
      if (role !== 'owner' && !isAssignee) {
        throw new ProjectCollaborationError(
          'PERMISSION_DENIED',
          'TASK_UPDATE_DENIED',
          'Only the project owner or the assignee may update this task.',
        );
      }
      if (input.milestoneId) {
        const milestone = await requireMilestone(input.milestoneId);
        if (milestone.projectId !== row.projectId) {
          throw new ProjectCollaborationError(
            'INVALID_ARGUMENT',
            'TASK_MILESTONE_MISMATCH',
            `Milestone ${input.milestoneId} does not belong to project ${row.projectId}.`,
            [
              {
                field: 'milestoneId',
                description: 'The milestone belongs to another project.',
              },
            ],
          );
        }
      }
      const values: Record<string, unknown> = { updatedAt: touch() };
      // The assignee may move a task's status; every other field belongs to the owner.
      if (role === 'owner') {
        if (input.title !== undefined) values.title = input.title;
        if (input.description !== undefined)
          values.description = input.description;
        if (input.assigneeId !== undefined) {
          if (input.assigneeId !== null) await requireUser(input.assigneeId);
          values.assigneeId = input.assigneeId;
        }
        if (input.milestoneId !== undefined)
          values.milestoneId = input.milestoneId;
        if (input.priority !== undefined) values.priority = input.priority;
        if (input.dueDate !== undefined) values.dueDate = input.dueDate;
        if (input.required !== undefined) values.required = input.required;
      }
      if (input.status !== undefined) {
        values.status = input.status;
        values.completedAt = input.status === 'completed' ? touch() : null;
      }
      await tasks().updateOne({
        filter: { id: taskId },
        values: values as Partial<TaskRow>,
      });
      const updated = await requireTask(taskId);
      const [view] = await decorTaskViews([updated], userId, role);
      return view;
    },

    async deleteTask(taskId, userId) {
      const row = await requireTask(taskId);
      await requireOwner(row.projectId, userId);
      await tasks().deleteOne({ filter: { id: taskId } });
    },

    async getDeliverable(deliverableId, userId) {
      const row = await findDeliverable(deliverableId);
      const role = await requireMembership(row.projectId, userId);
      const [view] = await buildDeliverableViews([row], role, userId);
      return view;
    },

    async submitDeliverable(taskId, userId, input) {
      const task = await requireTask(taskId);
      const role = await requireMembership(task.projectId, userId);
      const isAssignee = task.assigneeId !== null && task.assigneeId === userId;
      if (role !== 'owner' && !isAssignee) {
        throw new ProjectCollaborationError(
          'PERMISSION_DENIED',
          'DELIVERABLE_SUBMIT_DENIED',
          'Only the project owner or the assignee may submit a deliverable.',
        );
      }
      if (input.fileId) {
        const file = await database
          .repository<FileRow>('deliverable_files')
          .findOne({ filter: { id: input.fileId } });
        if (!file) {
          throw new ProjectCollaborationError(
            'INVALID_ARGUMENT',
            'FILE_NOT_FOUND',
            `Uploaded file ${input.fileId} was not found.`,
            [
              {
                field: 'fileId',
                description: 'The uploaded file was not found.',
              },
            ],
          );
        }
      }
      const now = touch();
      const id = randomUUID();
      await database.transaction(async (connection) => {
        await connection.repository<DeliverableRow>('deliverables').createOne({
          values: {
            id,
            taskId,
            projectId: task.projectId,
            submitterId: userId,
            title: input.title,
            description: input.description ?? null,
            status: 'pending',
            rejectReason: null,
            reviewerId: null,
            reviewedAt: null,
            fileId: input.fileId ?? null,
            createdAt: now,
            updatedAt: now,
          } as Partial<DeliverableRow>,
        });
        await connection.repository<TaskRow>('tasks').updateOne({
          filter: { id: taskId },
          values: {
            status: 'pending_acceptance',
            updatedAt: now,
          } as Partial<TaskRow>,
        });
      });
      const row = await findDeliverable(id);
      const [view] = await buildDeliverableViews([row], role, userId);
      return view;
    },

    async acceptDeliverable(deliverableId, userId) {
      const row = await findDeliverable(deliverableId);
      await requireOwner(row.projectId, userId);
      if (row.status !== 'pending') {
        throw new ProjectCollaborationError(
          'FAILED_PRECONDITION',
          'DELIVERABLE_NOT_PENDING',
          'Only a pending deliverable can be accepted.',
        );
      }
      const now = touch();
      await database.transaction(async (connection) => {
        await connection.repository<DeliverableRow>('deliverables').updateOne({
          filter: { id: deliverableId },
          values: {
            status: 'accepted',
            reviewerId: userId,
            reviewedAt: now,
            rejectReason: null,
            updatedAt: now,
          } as Partial<DeliverableRow>,
        });
        await connection.repository<TaskRow>('tasks').updateOne({
          filter: { id: row.taskId },
          values: {
            status: 'completed',
            completedAt: now,
            updatedAt: now,
          } as Partial<TaskRow>,
        });
      });
      const updated = await findDeliverable(deliverableId);
      const [view] = await buildDeliverableViews([updated], 'owner', userId);
      return view;
    },

    async rejectDeliverable(deliverableId, userId, reason) {
      const row = await findDeliverable(deliverableId);
      await requireOwner(row.projectId, userId);
      if (row.status !== 'pending') {
        throw new ProjectCollaborationError(
          'FAILED_PRECONDITION',
          'DELIVERABLE_NOT_PENDING',
          'Only a pending deliverable can be rejected.',
        );
      }
      if (!reason.trim()) {
        throw new ProjectCollaborationError(
          'INVALID_ARGUMENT',
          'REJECTION_REASON_REQUIRED',
          'A rejection must state a reason.',
          [{ field: 'reason', description: 'A reason is required.' }],
        );
      }
      const now = touch();
      await database.transaction(async (connection) => {
        await connection.repository<DeliverableRow>('deliverables').updateOne({
          filter: { id: deliverableId },
          values: {
            status: 'rejected',
            reviewerId: userId,
            reviewedAt: now,
            rejectReason: reason.trim(),
            updatedAt: now,
          } as Partial<DeliverableRow>,
        });
        await connection.repository<TaskRow>('tasks').updateOne({
          filter: { id: row.taskId },
          values: {
            status: 'in_progress',
            completedAt: null,
            updatedAt: now,
          } as Partial<TaskRow>,
        });
      });
      const updated = await findDeliverable(deliverableId);
      const [view] = await buildDeliverableViews([updated], 'owner', userId);
      return view;
    },

    async shareDeliverable(deliverableId, userId, targetUserId) {
      const row = await findDeliverable(deliverableId);
      const role = await requireMembership(row.projectId, userId);
      if (role !== 'owner' && row.submitterId !== userId) {
        throw new ProjectCollaborationError(
          'PERMISSION_DENIED',
          'DELIVERABLE_SHARE_DENIED',
          'Only the submitter or the project owner may share this deliverable.',
        );
      }
      const user = await requireUser(targetUserId);
      const existing = await shares().findOne({
        filter: { deliverableId, sharedWithId: targetUserId },
      });
      if (existing) {
        throw new ProjectCollaborationError(
          'ALREADY_EXISTS',
          'DELIVERABLE_SHARE_EXISTS',
          'The deliverable is already shared with this user.',
        );
      }
      const now = touch();
      const id = randomUUID();
      await shares().createOne({
        values: {
          id,
          deliverableId,
          sharedWithId: targetUserId,
          sharedById: userId,
          createdAt: now,
          updatedAt: now,
        } as Partial<ShareRow>,
      });
      return {
        id,
        deliverableId,
        sharedWithId: targetUserId,
        sharedWithName: user.name ?? user.username ?? user.email ?? null,
        sharedWithEmail: user.email,
        sharedById: userId,
        sharedByName: null,
        createdAt: now.toISOString(),
      };
    },

    async revokeDeliverableShare(deliverableId, userId, shareId) {
      const row = await findDeliverable(deliverableId);
      const role = await requireMembership(row.projectId, userId);
      if (role !== 'owner' && row.submitterId !== userId) {
        throw new ProjectCollaborationError(
          'PERMISSION_DENIED',
          'DELIVERABLE_SHARE_DENIED',
          'Only the submitter or the project owner may revoke a share.',
        );
      }
      const share = await shares().findOne({ filter: { id: shareId } });
      if (!share || share.deliverableId !== deliverableId) {
        throw new ProjectCollaborationError(
          'NOT_FOUND',
          'DELIVERABLE_SHARE_NOT_FOUND',
          `Share ${shareId} was not found on deliverable ${deliverableId}.`,
        );
      }
      await shares().deleteOne({ filter: { id: shareId } });
    },

    async assertDeliverableContentAccess(deliverableId, userId) {
      const row = await findDeliverable(deliverableId);
      if (row.submitterId === userId) {
        return { deliverableId: row.id, fileId: row.fileId };
      }
      const role = await membershipRole(row.projectId, userId);
      if (role === 'owner') {
        return { deliverableId: row.id, fileId: row.fileId };
      }
      const share = await shares().findOne({
        filter: { deliverableId, sharedWithId: userId },
      });
      if (share) {
        return { deliverableId: row.id, fileId: row.fileId };
      }
      throw new ProjectCollaborationError(
        'PERMISSION_DENIED',
        'DELIVERABLE_CONTENT_DENIED',
        'The deliverable is not shared with this user.',
      );
    },

    async getDashboard(userId) {
      const reference = new Date();
      const memberRows = await members().findMany({ filter: { userId } });
      const ids = memberRows.map((row) => row.projectId);
      const projectRows = await projects().findMany({
        filter: (filter) =>
          filter.or([
            filter.string('ownerId').eq(userId),
            ...(ids.length === 0 ? [] : [anyOf(filter, 'id', ids)]),
          ]),
        sort: (sort) => sort.field('createdAt').desc(),
      });
      const projectIds = projectRows.map((row) => row.id);
      const taskRows =
        projectIds.length === 0
          ? []
          : await tasks().findMany({
              filter: (filter) => anyOf(filter, 'projectId', projectIds),
            });
      const deliverableRows =
        projectIds.length === 0
          ? []
          : await deliverables().findMany({
              filter: (filter) =>
                filter.and([
                  anyOf(filter, 'projectId', projectIds),
                  filter.string('status').eq('pending'),
                ]),
            });
      const roleByProject = new Map<string, MemberRole>();
      for (const member of memberRows) {
        roleByProject.set(member.projectId, asMemberRole(member.role));
      }

      const dashboardProjects: DashboardProjectView[] = projectRows.map(
        (row) => {
          const scoped = taskRows.filter((task) => task.projectId === row.id);
          const stats = projectTaskStats(scoped);
          return {
            id: row.id,
            name: row.name,
            status: asProjectStatus(row.status),
            progress: stats.progress,
            taskCount: stats.taskCount,
            completedTaskCount: stats.completedTaskCount,
            overdueTaskCount: scoped.filter(
              (task) =>
                task.status !== 'completed' &&
                task.dueDate !== null &&
                dateOnly(task.dueDate)! < todayIso(reference),
            ).length,
            pendingDeliverableCount: deliverableRows.filter(
              (deliverable) => deliverable.projectId === row.id,
            ).length,
            endDate: dateOnly(row.endDate),
          };
        },
      );

      const todoRows = taskRows.filter(
        (task) => task.assigneeId === userId && task.status !== 'completed',
      );
      const todoViews = await decorTaskViews(
        todoRows,
        userId,
        'member',
        reference,
      );
      return {
        metrics: {
          projectCount: projectRows.length,
          openTaskCount: taskRows.filter(
            (task) => task.assigneeId === userId && task.status !== 'completed',
          ).length,
          overdueTaskCount: taskRows.filter(
            (task) =>
              task.assigneeId === userId &&
              task.status !== 'completed' &&
              task.dueDate !== null &&
              dateOnly(task.dueDate)! < todayIso(reference),
          ).length,
          pendingAcceptanceCount: deliverableRows.filter((deliverable) => {
            const role =
              roleByProject.get(deliverable.projectId) ??
              (projectRows.find(
                (project) =>
                  project.id === deliverable.projectId &&
                  project.ownerId === userId,
              )
                ? 'owner'
                : null);
            return role === 'owner';
          }).length,
        },
        projects: dashboardProjects,
        todos: todoViews,
      };
    },

    async listCollaborators(search) {
      const term = search?.trim();
      const filter = term
        ? (filter: FilterBuilder<UserRow>): FilterNode =>
            filter.or([
              filter.string('name').includes(term, { mode: 'insensitive' }),
              filter.string('email').includes(term, { mode: 'insensitive' }),
              filter.string('username').includes(term, { mode: 'insensitive' }),
            ])
        : undefined;
      const rows = await users().findMany({
        filter,
        limit: 50,
        sort: (sort) => sort.field('name').asc(),
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        username: row.username,
      }));
    },

    async findOverdueTasks(reference = new Date()) {
      const today = todayIso(reference);
      const rows = await tasks().findMany({
        filter: (filter) =>
          filter.or(
            ACTIVE_TASK_STATUSES.map((status) =>
              filter.string('status').eq(status),
            ),
          ),
      });
      const overdue = rows.filter(
        (row) =>
          row.assigneeId !== null &&
          row.dueDate !== null &&
          dateOnly(row.dueDate)! < today,
      );
      if (overdue.length === 0) return [];
      const projectRows = await projects().findMany({
        filter: (filter) =>
          anyOf(filter, 'id', [
            ...new Set(overdue.map((row) => row.projectId)),
          ]),
      });
      const projectMap = new Map(projectRows.map((row) => [row.id, row]));
      return overdue.map((row) => ({
        taskId: row.id,
        title: row.title,
        projectId: row.projectId,
        projectName: projectMap.get(row.projectId)?.name ?? '',
        assigneeId: row.assigneeId!,
        dueDate: dateOnly(row.dueDate)!,
      }));
    },
  };
}

export const projectsServiceToken: ServiceToken<ProjectsService> =
  createServiceToken<ProjectsService>('app/projects-service');

export default class ProjectsProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/projects-provider';

  public override register(): void {
    this.app.container.singleton(projectsServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createProjectsService(database);
    });
  }
}
