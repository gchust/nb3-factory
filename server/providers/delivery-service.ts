import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

export const SYSTEM_ADMINISTRATOR = 'system-administrator';
export const MAX_FILES_PER_UPLOAD = 5;
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
const PRIORITIES = ['low', 'medium', 'high'] as const;
const PROJECT_STATUSES = ['active', 'completed', 'on_hold'] as const;
const MEMBER_ROLES = ['manager', 'member'] as const;

export interface DeliveryActor {
  readonly userId: string;
  readonly isAdmin: boolean;
}

export interface DeliveryFileView {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly contentUrl: string;
}

export interface DeliveryMemberView {
  readonly id: number;
  readonly userId: string;
  readonly name: string;
  readonly username: string;
  readonly role: string;
}

export interface DeliveryUserView {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
}

export interface DeliveryMaterialView {
  readonly id: number;
  readonly projectId: number;
  readonly title: string;
  readonly note: string | null;
  readonly uploaderName: string;
  readonly createdAt: string;
  readonly files: readonly DeliveryFileView[];
}

export interface DeliveryTaskView {
  readonly id: number;
  readonly projectId: number;
  readonly milestoneId: number;
  readonly title: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly priority: string;
  readonly planDate: string | null;
  readonly actualDate: string | null;
  readonly status: string;
  readonly description: string | null;
  readonly overdue: boolean;
}

export interface DeliveryMilestoneView {
  readonly id: number;
  readonly projectId: number;
  readonly name: string;
  readonly dueDate: string | null;
  readonly status: string;
  readonly description: string | null;
  readonly taskCount: number;
  readonly doneCount: number;
  readonly progress: number;
  readonly submission: DeliverySubmissionSummary | null;
}

export interface DeliverySubmissionSummary {
  readonly id: number;
  readonly status: string;
  readonly round: number;
  readonly reviewerId: string;
  readonly reviewerName: string;
  readonly applicantId: string;
  readonly applicantName: string;
  readonly createdAt: string;
}

export interface DeliveryProjectView {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly managerId: string | null;
  readonly managerName: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly status: string;
  readonly description: string | null;
  readonly role: 'admin' | 'manager' | 'member';
  readonly memberCount: number;
  readonly milestoneCount: number;
  readonly doneMilestoneCount: number;
  readonly openTaskCount: number;
}

export interface DeliverySubmissionItemView {
  readonly id: number;
  readonly taskId: number;
  readonly taskTitle: string;
  readonly resultId: number;
  readonly resultTitle: string;
  readonly versionId: number;
  readonly versionNo: number;
  readonly note: string | null;
  readonly uploaderName: string;
  readonly files: readonly DeliveryFileView[];
}

export interface DeliverySubmissionCommentView {
  readonly id: number;
  readonly action: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly content: string | null;
  readonly createdAt: string;
}

export interface DeliverySubmissionView extends DeliverySubmissionSummary {
  readonly projectId: number;
  readonly projectName: string;
  readonly milestoneId: number;
  readonly milestoneName: string;
  readonly note: string | null;
  readonly decidedAt: string | null;
  readonly previousSubmissionId: number | null;
  readonly items: readonly DeliverySubmissionItemView[];
  readonly comments: readonly DeliverySubmissionCommentView[];
  readonly history: readonly DeliverySubmissionSummary[];
  readonly canDecide: boolean;
}

export interface DeliveryVersionView {
  readonly id: number;
  readonly versionNo: number;
  readonly note: string | null;
  readonly uploaderName: string;
  readonly createdAt: string;
  readonly files: readonly DeliveryFileView[];
  readonly referencedBySubmission: boolean;
}

export interface DeliveryVersionGroup {
  readonly taskId: number;
  readonly taskTitle: string;
  readonly results: readonly {
    readonly id: number;
    readonly title: string;
    readonly versions: readonly DeliveryVersionView[];
  }[];
}

export interface DeliveryDashboard {
  readonly projectCount: number;
  readonly milestoneCount: number;
  readonly milestonesCompleted: number;
  readonly milestoneCompletionRate: number;
  readonly taskCount: number;
  readonly tasksCompleted: number;
  readonly overdueTaskCount: number;
  readonly pendingReviewCount: number;
  readonly myOpenTaskCount: number;
  readonly overdueTasks: readonly (DeliveryTaskView & {
    readonly projectName: string;
    readonly milestoneName: string;
  })[];
  readonly myTasks: readonly DeliveryTaskView[];
  readonly pendingReviews: readonly DeliverySubmissionSummary[];
}

export interface DeliveryService {
  resolveActor(userId: string): Promise<DeliveryActor>;
  me(
    actor: DeliveryActor,
  ): Promise<{ readonly userId: string; readonly isAdmin: boolean }>;
  listUsers(): Promise<readonly DeliveryUserView[]>;
  listProjects(actor: DeliveryActor): Promise<readonly DeliveryProjectView[]>;
  getProject(
    actor: DeliveryActor,
    projectId: number,
  ): Promise<{
    readonly project: DeliveryProjectView;
    readonly members: readonly DeliveryMemberView[];
    readonly materials: readonly DeliveryMaterialView[];
    readonly milestones: readonly DeliveryMilestoneView[];
  }>;
  createProject(
    actor: DeliveryActor,
    input: Record<string, unknown>,
  ): Promise<number>;
  updateProject(
    actor: DeliveryActor,
    projectId: number,
    input: Record<string, unknown>,
  ): Promise<void>;
  addMember(
    actor: DeliveryActor,
    projectId: number,
    input: Record<string, unknown>,
  ): Promise<void>;
  removeMember(
    actor: DeliveryActor,
    projectId: number,
    memberId: number,
  ): Promise<void>;
  listMaterials(
    actor: DeliveryActor,
    projectId: number,
  ): Promise<readonly DeliveryMaterialView[]>;
  createMaterial(
    actor: DeliveryActor,
    projectId: number,
    input: Record<string, unknown>,
  ): Promise<void>;
  removeMaterial(actor: DeliveryActor, materialId: number): Promise<void>;
  removeMaterialFile(
    actor: DeliveryActor,
    materialId: number,
    fileId: string,
  ): Promise<void>;
  listMilestones(
    actor: DeliveryActor,
    filter: { readonly projectId?: number },
  ): Promise<
    readonly (DeliveryMilestoneView & {
      readonly projectName: string;
      readonly projectCode: string;
    })[]
  >;
  getMilestone(
    actor: DeliveryActor,
    milestoneId: number,
  ): Promise<{
    readonly milestone: DeliveryMilestoneView;
    readonly project: DeliveryProjectView;
    readonly tasks: readonly DeliveryTaskView[];
    readonly submissions: readonly DeliverySubmissionView[];
  }>;
  createMilestone(
    actor: DeliveryActor,
    input: Record<string, unknown>,
  ): Promise<number>;
  updateMilestone(
    actor: DeliveryActor,
    milestoneId: number,
    input: Record<string, unknown>,
  ): Promise<void>;
  milestoneVersions(
    actor: DeliveryActor,
    milestoneId: number,
  ): Promise<readonly DeliveryVersionGroup[]>;
  listTasks(
    actor: DeliveryActor,
    filter: {
      readonly projectId?: number;
      readonly milestoneId?: number;
      readonly mine?: boolean;
    },
  ): Promise<readonly DeliveryTaskView[]>;
  getTask(
    actor: DeliveryActor,
    taskId: number,
  ): Promise<{
    readonly task: DeliveryTaskView;
    readonly project: DeliveryProjectView;
    readonly milestone: DeliveryMilestoneView;
    readonly results: readonly {
      readonly id: number;
      readonly title: string;
      readonly versions: readonly {
        readonly id: number;
        readonly versionNo: number;
        readonly note: string | null;
        readonly uploaderName: string;
        readonly createdAt: string;
        readonly files: readonly DeliveryFileView[];
        readonly referencedBySubmission: boolean;
      }[];
    }[];
    readonly canManage: boolean;
    readonly canUpload: boolean;
  }>;
  createTask(
    actor: DeliveryActor,
    input: Record<string, unknown>,
  ): Promise<number>;
  updateTask(
    actor: DeliveryActor,
    taskId: number,
    input: Record<string, unknown>,
  ): Promise<void>;
  createResult(
    actor: DeliveryActor,
    taskId: number,
    input: Record<string, unknown>,
  ): Promise<number>;
  addResultVersion(
    actor: DeliveryActor,
    resultId: number,
    input: Record<string, unknown>,
  ): Promise<number>;
  removeVersionFile(
    actor: DeliveryActor,
    versionId: number,
    fileId: string,
  ): Promise<void>;
  listSubmissions(
    actor: DeliveryActor,
    filter: { readonly scope?: 'mine' | 'review' | 'all' },
  ): Promise<readonly DeliverySubmissionView[]>;
  getSubmission(
    actor: DeliveryActor,
    submissionId: number,
  ): Promise<DeliverySubmissionView>;
  createSubmission(
    actor: DeliveryActor,
    input: Record<string, unknown>,
  ): Promise<number>;
  decideSubmission(
    actor: DeliveryActor,
    submissionId: number,
    input: Record<string, unknown>,
  ): Promise<void>;
  dashboard(actor: DeliveryActor): Promise<DeliveryDashboard>;
  canAccessFile(actor: DeliveryActor, fileId: string): Promise<boolean>;
}

export const deliveryServiceToken: ServiceToken<DeliveryService> =
  createServiceToken<DeliveryService>('app/delivery-service');

export class DeliveryError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'DeliveryError';
    this.code = code;
    this.status = status;
  }
}

export default class DeliveryProvider extends ServiceProvider<Application> {
  public readonly name = 'app/delivery-service';

  public override register(): void {
    this.app.container.singleton(deliveryServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const authorization = this.app.container.has(authorizationToken)
        ? this.app.container.resolve<AppAuthorization>(authorizationToken)
        : undefined;
      const drive = this.app.container.has(driveManagerToken)
        ? this.app.container.resolve<NocoBaseDriveManager>(driveManagerToken)
        : undefined;
      return createDeliveryService({
        database,
        authorization,
        drive,
        publicBasePath: this.app.publicBasePath ?? '',
      });
    });
  }
}

export interface CreateDeliveryServiceOptions {
  readonly database: DatabaseManager;
  readonly authorization?: Pick<AppAuthorization, 'permissionSets'>;
  readonly drive?: Pick<NocoBaseDriveManager, 'use'>;
  readonly publicBasePath: string;
}

export function createDeliveryService(
  options: CreateDeliveryServiceOptions,
): DeliveryService {
  const { database, authorization, drive, publicBasePath } = options;
  const base = publicBasePath.replace(/\/$/, '');

  const now = (): Date => new Date();
  const today = (): string => new Date().toISOString().slice(0, 10);

  const query = () => database.query();

  async function loadUsers(): Promise<Map<string, DeliveryUserView>> {
    const rows = await query().selectFrom('user').selectAll().execute();
    const users = new Map<string, DeliveryUserView>();
    for (const row of rows) {
      const id = text(row.id);
      users.set(id, {
        id,
        name: text(row.name ?? ''),
        username: text(row.username ?? ''),
        email: text(row.email ?? ''),
      });
    }
    return users;
  }

  async function isAdmin(userId: string): Promise<boolean> {
    if (!authorization) return false;
    const assignments = await authorization.permissionSets.listAssignments();
    return assignments.some(
      (assignment) =>
        assignment.subject.type === 'user' &&
        assignment.subject.id === userId &&
        assignment.permissionSet === SYSTEM_ADMINISTRATOR,
    );
  }

  async function resolveActor(userId: string): Promise<DeliveryActor> {
    return { userId, isAdmin: await isAdmin(userId) };
  }

  async function projectRow(projectId: number): Promise<Row | undefined> {
    return query()
      .selectFrom('deliveryProjects')
      .selectAll()
      .where('id', '=', projectId)
      .executeTakeFirst();
  }

  async function projectRole(
    actor: DeliveryActor,
    project: Row,
  ): Promise<'admin' | 'manager' | 'member' | undefined> {
    if (actor.isAdmin) return 'admin';
    if (project.managerId === actor.userId) return 'manager';
    const membership = await query()
      .selectFrom('deliveryProjectMembers')
      .select(['role'])
      .where('projectId', '=', Number(project.id))
      .where('userId', '=', actor.userId)
      .executeTakeFirst();
    if (!membership) return undefined;
    return membership.role === 'manager' ? 'manager' : 'member';
  }

  async function requireProjectView(
    actor: DeliveryActor,
    projectId: number,
  ): Promise<Row> {
    const project = await projectRow(projectId);
    if (!project) throw new DeliveryError('NOT_FOUND', '项目不存在。', 404);
    const role = await projectRole(actor, project);
    if (!role) throw new DeliveryError('FORBIDDEN', '无权访问该项目。', 403);
    return project;
  }

  async function requireProjectManage(
    actor: DeliveryActor,
    projectId: number,
  ): Promise<Row> {
    const project = await projectRow(projectId);
    if (!project) throw new DeliveryError('NOT_FOUND', '项目不存在。', 404);
    const role = await projectRole(actor, project);
    if (role !== 'admin' && role !== 'manager') {
      throw new DeliveryError('FORBIDDEN', '只有项目经理可以执行该操作。', 403);
    }
    return project;
  }

  async function visibleProjectIds(actor: DeliveryActor): Promise<number[]> {
    if (actor.isAdmin) {
      const rows = await query()
        .selectFrom('deliveryProjects')
        .select(['id'])
        .execute();
      return rows.map((row) => Number(row.id));
    }
    const managed = await query()
      .selectFrom('deliveryProjects')
      .select(['id'])
      .where('managerId', '=', actor.userId)
      .execute();
    const memberRows = await query()
      .selectFrom('deliveryProjectMembers')
      .select(['projectId'])
      .where('userId', '=', actor.userId)
      .execute();
    const ids = new Set<number>();
    for (const row of managed) ids.add(Number(row.id));
    for (const row of memberRows) ids.add(Number(row.projectId));
    return [...ids];
  }

  async function requireTaskView(actor: DeliveryActor, taskId: number) {
    const task = await query()
      .selectFrom('deliveryTasks')
      .selectAll()
      .where('id', '=', taskId)
      .executeTakeFirst();
    if (!task) throw new DeliveryError('NOT_FOUND', '任务不存在。', 404);
    await requireProjectView(actor, Number(task.projectId));
    return task;
  }

  async function requireMilestoneView(
    actor: DeliveryActor,
    milestoneId: number,
  ) {
    const milestone = await query()
      .selectFrom('deliveryMilestones')
      .selectAll()
      .where('id', '=', milestoneId)
      .executeTakeFirst();
    if (!milestone) throw new DeliveryError('NOT_FOUND', '里程碑不存在。', 404);
    await requireProjectView(actor, Number(milestone.projectId));
    return milestone;
  }

  function serializeDate(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    return value == null ? '' : text(value);
  }

  function optionalDate(value: unknown): string | null {
    return value == null ? null : serializeDate(value);
  }

  async function fileViews(
    fileIds: readonly string[],
  ): Promise<DeliveryFileView[]> {
    if (!fileIds.length) return [];
    const rows = await query()
      .selectFrom('deliveryFiles')
      .selectAll()
      .where('id', 'in', [...fileIds])
      .execute();
    const byId = new Map(rows.map((row) => [text(row.id), row]));
    const views: DeliveryFileView[] = [];
    for (const id of fileIds) {
      const row = byId.get(id);
      if (!row) continue;
      views.push(fileView(row));
    }
    return views;
  }

  function fileView(row: Row): DeliveryFileView {
    const id = text(row.id);
    const ext = text(row.ext ?? '');
    return {
      id,
      filename: text(row.filename ?? ''),
      ext,
      mimeType: text(row.mimeType ?? 'application/octet-stream'),
      size: Number(row.size ?? 0),
      createdAt: serializeDate(row.createdAt),
      contentUrl: `${base}/uploads/delivery-files/${encodeURIComponent(id)}${
        ext ? `.${encodeURIComponent(ext)}` : ''
      }`,
    };
  }

  async function assertFileIds(input: unknown): Promise<string[]> {
    if (!Array.isArray(input)) return [];
    const ids = input.map((value) => text(value));
    const unique = [...new Set(ids)];
    if (unique.length > MAX_FILES_PER_UPLOAD) {
      throw new DeliveryError(
        'TOO_MANY_FILES',
        `一次最多选择 ${MAX_FILES_PER_UPLOAD} 个文件。`,
        400,
      );
    }
    if (!unique.length) {
      throw new DeliveryError('FILES_REQUIRED', '请至少上传一个文件。', 400);
    }
    const rows = await query()
      .selectFrom('deliveryFiles')
      .select(['id', 'size', 'filename'])
      .where('id', 'in', unique)
      .execute();
    const byId = new Map(rows.map((row) => [text(row.id), row]));
    for (const id of unique) {
      const row = byId.get(id);
      if (!row) {
        throw new DeliveryError(
          'FILE_NOT_FOUND',
          '上传的文件不存在或已失效。',
          400,
        );
      }
      if (Number(row.size) > MAX_FILE_SIZE) {
        throw new DeliveryError(
          'FILE_TOO_LARGE',
          `文件「${text(row.filename)}」超过 5 MB 限制。`,
          400,
        );
      }
    }
    return unique;
  }

  async function deleteFileIfUnlinked(fileId: string): Promise<void> {
    const [materialLink, versionLink] = await Promise.all([
      query()
        .selectFrom('deliveryMaterialFiles')
        .select(['id'])
        .where('fileId', '=', fileId)
        .executeTakeFirst(),
      query()
        .selectFrom('deliveryTaskResultVersionFiles')
        .select(['id'])
        .where('fileId', '=', fileId)
        .executeTakeFirst(),
    ]);
    if (materialLink || versionLink) return;
    const file = await query()
      .selectFrom('deliveryFiles')
      .select(['id', 'disk', 'key'])
      .where('id', '=', fileId)
      .executeTakeFirst();
    if (!file) return;
    await query()
      .deleteFrom('deliveryFiles')
      .where('id', '=', fileId)
      .execute();
    if (!drive) return;
    try {
      await drive.use(text(file.disk)).delete(text(file.key));
    } catch {
      // The metadata is gone, so the link no longer resolves. A leftover
      // object is unreachable through the application and is not re-linked.
    }
  }

  async function taskView(
    row: Row,
    users: Map<string, DeliveryUserView>,
  ): Promise<DeliveryTaskView> {
    const assigneeId = row.assigneeId == null ? null : text(row.assigneeId);
    const status = text(row.status);
    const planDate = row.planDate == null ? null : text(row.planDate);
    return {
      id: Number(row.id),
      projectId: Number(row.projectId),
      milestoneId: Number(row.milestoneId),
      title: text(row.title),
      assigneeId,
      assigneeName: assigneeId ? (users.get(assigneeId)?.name ?? null) : null,
      priority: text(row.priority),
      planDate,
      actualDate: row.actualDate == null ? null : text(row.actualDate),
      status,
      description: row.description == null ? null : text(row.description),
      overdue: Boolean(planDate && status !== 'done' && planDate < today()),
    };
  }

  async function milestoneView(
    row: Row,
    submissions: readonly Row[],
    users: Map<string, DeliveryUserView>,
  ): Promise<DeliveryMilestoneView> {
    const milestoneId = Number(row.id);
    const tasks = await query()
      .selectFrom('deliveryTasks')
      .select(['id', 'status'])
      .where('milestoneId', '=', milestoneId)
      .execute();
    const taskCount = tasks.length;
    const doneCount = tasks.filter((task) => task.status === 'done').length;
    const latest = submissions
      .filter((submission) => Number(submission.milestoneId) === milestoneId)
      .sort((left, right) => Number(right.round) - Number(left.round))[0];
    return {
      id: milestoneId,
      projectId: Number(row.projectId),
      name: text(row.name),
      dueDate: row.dueDate == null ? null : text(row.dueDate),
      status: text(row.status),
      description: row.description == null ? null : text(row.description),
      taskCount,
      doneCount,
      progress: taskCount === 0 ? 0 : doneCount / taskCount,
      submission: latest ? submissionSummary(latest, users) : null,
    };
  }

  function submissionSummary(
    row: Row,
    users: Map<string, DeliveryUserView>,
  ): DeliverySubmissionSummary {
    const applicantId = text(row.applicantId);
    const reviewerId = text(row.reviewerId);
    return {
      id: Number(row.id),
      status: text(row.status),
      round: Number(row.round ?? 1),
      applicantId,
      applicantName: users.get(applicantId)?.name ?? applicantId,
      reviewerId,
      reviewerName: users.get(reviewerId)?.name ?? reviewerId,
      createdAt: serializeDate(row.createdAt),
    };
  }

  async function projectView(
    actor: DeliveryActor,
    row: Row,
    users: Map<string, DeliveryUserView>,
  ): Promise<DeliveryProjectView> {
    const id = Number(row.id);
    const role = (await projectRole(actor, row)) ?? 'member';
    const [members, milestones, tasks] = await Promise.all([
      query()
        .selectFrom('deliveryProjectMembers')
        .select(['id'])
        .where('projectId', '=', id)
        .execute(),
      query()
        .selectFrom('deliveryMilestones')
        .select(['id', 'status'])
        .where('projectId', '=', id)
        .execute(),
      query()
        .selectFrom('deliveryTasks')
        .select(['id', 'status'])
        .where('projectId', '=', id)
        .execute(),
    ]);
    const managerId = row.managerId == null ? null : text(row.managerId);
    return {
      id,
      code: text(row.code),
      name: text(row.name),
      managerId,
      managerName: managerId ? (users.get(managerId)?.name ?? null) : null,
      startDate: row.startDate == null ? null : text(row.startDate),
      endDate: row.endDate == null ? null : text(row.endDate),
      status: text(row.status),
      description: row.description == null ? null : text(row.description),
      role,
      memberCount: members.length,
      milestoneCount: milestones.length,
      doneMilestoneCount: milestones.filter(
        (milestone) => milestone.status === 'completed',
      ).length,
      openTaskCount: tasks.filter((task) => task.status !== 'done').length,
    };
  }

  async function materialView(
    row: Row,
    users: Map<string, DeliveryUserView>,
  ): Promise<DeliveryMaterialView> {
    const materialId = Number(row.id);
    const links = await query()
      .selectFrom('deliveryMaterialFiles')
      .select(['fileId', 'sortOrder'])
      .where('materialId', '=', materialId)
      .execute();
    links.sort(
      (left, right) => Number(left.sortOrder) - Number(right.sortOrder),
    );
    const files = await fileViews(links.map((link) => text(link.fileId)));
    const createdById = row.createdById == null ? null : text(row.createdById);
    return {
      id: materialId,
      projectId: Number(row.projectId),
      title: text(row.title),
      note: row.note == null ? null : text(row.note),
      uploaderName: createdById ? (users.get(createdById)?.name ?? '') : '',
      createdAt: serializeDate(row.createdAt),
      files,
    };
  }

  async function submissionItems(
    submissionId: number,
    users: Map<string, DeliveryUserView>,
  ): Promise<DeliverySubmissionItemView[]> {
    const items = await query()
      .selectFrom('deliverySubmissionItems')
      .select(['id', 'resultVersionId'])
      .where('submissionId', '=', submissionId)
      .execute();
    if (!items.length) return [];
    const versionIds = items.map((item) => Number(item.resultVersionId));
    const versions = await query()
      .selectFrom('deliveryTaskResultVersions')
      .selectAll()
      .where('id', 'in', versionIds)
      .execute();
    const versionById = new Map(
      versions.map((version) => [Number(version.id), version]),
    );
    const resultIds = versions.map((version) => Number(version.resultId));
    const results = resultIds.length
      ? await query()
          .selectFrom('deliveryTaskResults')
          .selectAll()
          .where('id', 'in', resultIds)
          .execute()
      : [];
    const resultById = new Map(
      results.map((result) => [Number(result.id), result]),
    );
    const taskIds = results.map((result) => Number(result.taskId));
    const tasks = taskIds.length
      ? await query()
          .selectFrom('deliveryTasks')
          .selectAll()
          .where('id', 'in', taskIds)
          .execute()
      : [];
    const taskById = new Map(tasks.map((task) => [Number(task.id), task]));

    const views: DeliverySubmissionItemView[] = [];
    for (const item of items) {
      const versionId = Number(item.resultVersionId);
      const version = versionById.get(versionId);
      if (!version) continue;
      const result = resultById.get(Number(version.resultId));
      const task = result ? taskById.get(Number(result.taskId)) : undefined;
      if (!result || !task) continue;
      const links = await query()
        .selectFrom('deliveryTaskResultVersionFiles')
        .select(['fileId', 'sortOrder'])
        .where('versionId', '=', versionId)
        .execute();
      links.sort(
        (left, right) => Number(left.sortOrder) - Number(right.sortOrder),
      );
      const uploaderId =
        version.createdById == null ? null : text(version.createdById);
      views.push({
        id: Number(item.id),
        taskId: Number(task.id),
        taskTitle: text(task.title),
        resultId: Number(result.id),
        resultTitle: text(result.title),
        versionId,
        versionNo: Number(version.versionNo),
        note: version.note == null ? null : text(version.note),
        uploaderName: uploaderId ? (users.get(uploaderId)?.name ?? '') : '',
        files: await fileViews(links.map((link) => text(link.fileId))),
      });
    }
    return views;
  }

  async function submissionView(
    actor: DeliveryActor,
    row: Row,
  ): Promise<DeliverySubmissionView> {
    const users = await loadUsers();
    const submissionId = Number(row.id);
    const milestone = await query()
      .selectFrom('deliveryMilestones')
      .selectAll()
      .where('id', '=', Number(row.milestoneId))
      .executeTakeFirst();
    const project = await query()
      .selectFrom('deliveryProjects')
      .selectAll()
      .where('id', '=', Number(row.projectId))
      .executeTakeFirst();
    const comments = await query()
      .selectFrom('deliverySubmissionComments')
      .selectAll()
      .where('submissionId', '=', submissionId)
      .orderBy('createdAt', 'asc')
      .execute();
    const historyRows = await query()
      .selectFrom('deliverySubmissions')
      .selectAll()
      .where('milestoneId', '=', Number(row.milestoneId))
      .execute();
    const summary = submissionSummary(row, users);
    return {
      ...summary,
      projectId: Number(row.projectId),
      projectName: project ? text(project.name) : '',
      milestoneId: Number(row.milestoneId),
      milestoneName: milestone ? text(milestone.name) : '',
      note: row.note == null ? null : text(row.note),
      decidedAt: optionalDate(row.decidedAt),
      previousSubmissionId:
        row.previousSubmissionId == null
          ? null
          : Number(row.previousSubmissionId),
      items: await submissionItems(submissionId, users),
      comments: comments.map((comment) => {
        const authorId = text(comment.authorId);
        return {
          id: Number(comment.id),
          action: text(comment.action),
          authorId,
          authorName: users.get(authorId)?.name ?? authorId,
          content: comment.content == null ? null : text(comment.content),
          createdAt: serializeDate(comment.createdAt),
        };
      }),
      history: historyRows
        .sort((left, right) => Number(left.round) - Number(right.round))
        .map((historyRow) => submissionSummary(historyRow, users)),
      canDecide:
        text(row.status) === 'pending' && actor.userId === text(row.reviewerId),
    };
  }

  async function requireSubmissionView(
    actor: DeliveryActor,
    submissionId: number,
  ): Promise<Row> {
    const row = await query()
      .selectFrom('deliverySubmissions')
      .selectAll()
      .where('id', '=', submissionId)
      .executeTakeFirst();
    if (!row) throw new DeliveryError('NOT_FOUND', '交付申请不存在。', 404);
    const project = await projectRow(Number(row.projectId));
    const isParticipant =
      actor.userId === text(row.applicantId) ||
      actor.userId === text(row.reviewerId) ||
      (project ? Boolean(await projectRole(actor, project)) : false);
    if (!isParticipant) {
      throw new DeliveryError('FORBIDDEN', '无权查看该交付申请。', 403);
    }
    return row;
  }

  async function countPendingReviews(actor: DeliveryActor): Promise<number> {
    if (actor.isAdmin) {
      const rows = await query()
        .selectFrom('deliverySubmissions')
        .select(['id'])
        .where('status', '=', 'pending')
        .execute();
      return rows.length;
    }
    const rows = await query()
      .selectFrom('deliverySubmissions')
      .select(['id'])
      .where('status', '=', 'pending')
      .where('reviewerId', '=', actor.userId)
      .execute();
    return rows.length;
  }

  async function syncMilestoneStatus(milestoneId: number): Promise<void> {
    const milestone = await query()
      .selectFrom('deliveryMilestones')
      .select(['id', 'status'])
      .where('id', '=', milestoneId)
      .executeTakeFirst();
    if (!milestone || milestone.status === 'completed') return;
    const tasks = await query()
      .selectFrom('deliveryTasks')
      .select(['id', 'status'])
      .where('milestoneId', '=', milestoneId)
      .execute();
    if (!tasks.length) return;
    const started = tasks.some((task) => task.status !== 'todo');
    const nextStatus = started ? 'in_progress' : 'pending';
    if (text(milestone.status) === nextStatus) return;
    await query()
      .updateTable('deliveryMilestones')
      .set({ status: nextStatus, updatedAt: now() })
      .where('id', '=', milestoneId)
      .execute();
  }

  /**
   * An accepted milestone freezes its task results. Checking here, before any
   * row is written, keeps a rejected upload from leaving an empty result
   * behind — `completed` is only ever set once a delivery application is
   * approved.
   */
  async function assertMilestoneOpen(milestoneId: number): Promise<void> {
    const milestone = await query()
      .selectFrom('deliveryMilestones')
      .select(['status'])
      .where('id', '=', milestoneId)
      .executeTakeFirst();
    if (milestone?.status === 'completed') {
      throw new DeliveryError(
        'MILESTONE_COMPLETED',
        '里程碑已验收完成，不能继续新增成果版本。',
        409,
      );
    }
  }

  async function versionViews(
    resultId: number,
    users: Map<string, DeliveryUserView>,
  ): Promise<DeliveryVersionView[]> {
    const versionRows = await query()
      .selectFrom('deliveryTaskResultVersions')
      .selectAll()
      .where('resultId', '=', resultId)
      .orderBy('versionNo', 'asc')
      .execute();
    const views: DeliveryVersionView[] = [];
    for (const version of versionRows) {
      const links = await query()
        .selectFrom('deliveryTaskResultVersionFiles')
        .select(['fileId', 'sortOrder'])
        .where('versionId', '=', Number(version.id))
        .execute();
      links.sort(
        (left, right) => Number(left.sortOrder) - Number(right.sortOrder),
      );
      const referenced = await query()
        .selectFrom('deliverySubmissionItems')
        .select(['id'])
        .where('resultVersionId', '=', Number(version.id))
        .executeTakeFirst();
      const uploaderId =
        version.createdById == null ? null : text(version.createdById);
      views.push({
        id: Number(version.id),
        versionNo: Number(version.versionNo),
        note: version.note == null ? null : text(version.note),
        uploaderName: uploaderId ? (users.get(uploaderId)?.name ?? '') : '',
        createdAt: serializeDate(version.createdAt),
        files: await fileViews(links.map((link) => text(link.fileId))),
        referencedBySubmission: Boolean(referenced),
      });
    }
    return views;
  }

  const service: DeliveryService = {
    resolveActor,
    me: async (actor) => ({
      userId: actor.userId,
      isAdmin: actor.isAdmin,
    }),
    listUsers: async () => {
      const users = await loadUsers();
      return [...users.values()].sort((left, right) =>
        left.name.localeCompare(right.name, 'zh-Hans-CN'),
      );
    },

    listProjects: async (actor) => {
      const ids = await visibleProjectIds(actor);
      if (!ids.length) return [];
      const rows = await query()
        .selectFrom('deliveryProjects')
        .selectAll()
        .where('id', 'in', ids)
        .orderBy('code', 'asc')
        .execute();
      const users = await loadUsers();
      return Promise.all(rows.map((row) => projectView(actor, row, users)));
    },

    getProject: async (actor, projectId) => {
      const row = await requireProjectView(actor, projectId);
      const users = await loadUsers();
      const project = await projectView(actor, row, users);
      const [memberRows, materialRows, milestoneRows, submissionRows] =
        await Promise.all([
          query()
            .selectFrom('deliveryProjectMembers')
            .selectAll()
            .where('projectId', '=', projectId)
            .execute(),
          query()
            .selectFrom('deliveryMaterials')
            .selectAll()
            .where('projectId', '=', projectId)
            .orderBy('createdAt', 'desc')
            .execute(),
          query()
            .selectFrom('deliveryMilestones')
            .selectAll()
            .where('projectId', '=', projectId)
            .orderBy('dueDate', 'asc')
            .execute(),
          query()
            .selectFrom('deliverySubmissions')
            .selectAll()
            .where('projectId', '=', projectId)
            .execute(),
        ]);
      return {
        project,
        members: memberRows.map((member) => {
          const userId = text(member.userId);
          return {
            id: Number(member.id),
            userId,
            name: users.get(userId)?.name ?? userId,
            username: users.get(userId)?.username ?? '',
            role: text(member.role),
          };
        }),
        materials: await Promise.all(
          materialRows.map((material) => materialView(material, users)),
        ),
        milestones: await Promise.all(
          milestoneRows.map((milestone) =>
            milestoneView(milestone, submissionRows, users),
          ),
        ),
      };
    },

    createProject: async (actor, input) => {
      if (!actor.isAdmin) {
        throw new DeliveryError(
          'FORBIDDEN',
          '只有交付管理员可以创建项目。',
          403,
        );
      }
      const code = requiredtext(input.code, '项目编号');
      const name = requiredtext(input.name, '项目名称');
      const managerId = requiredtext(input.managerId, '项目经理');
      const existing = await query()
        .selectFrom('deliveryProjects')
        .select(['id'])
        .where('code', '=', code)
        .executeTakeFirst();
      if (existing) {
        throw new DeliveryError('CODE_TAKEN', '项目编号已存在。', 409);
      }
      await query()
        .insertInto('deliveryProjects')
        .values({
          code,
          name,
          managerId,
          startDate: optionaltext(input.startDate),
          endDate: optionaltext(input.endDate),
          status: enumValue(input.status, PROJECT_STATUSES, 'active'),
          description: optionaltext(input.description),
          createdById: actor.userId,
          createdAt: now(),
          updatedAt: now(),
        })
        .execute();
      const created = await query()
        .selectFrom('deliveryProjects')
        .select(['id'])
        .where('code', '=', code)
        .executeTakeFirst();
      const projectId = Number(created?.id);
      await query()
        .insertInto('deliveryProjectMembers')
        .values({
          projectId,
          userId: managerId,
          role: 'manager',
          createdAt: now(),
          updatedAt: now(),
        })
        .execute();
      return projectId;
    },

    updateProject: async (actor, projectId, input) => {
      await requireProjectManage(actor, projectId);
      const patch: Record<string, unknown> = { updatedAt: now() };
      if (input.name !== undefined)
        patch.name = requiredtext(input.name, '项目名称');
      if (input.managerId !== undefined) {
        if (!actor.isAdmin) {
          throw new DeliveryError(
            'FORBIDDEN',
            '只有交付管理员可以设置项目经理。',
            403,
          );
        }
        const managerId = requiredtext(input.managerId, '项目经理');
        patch.managerId = managerId;
        const membership = await query()
          .selectFrom('deliveryProjectMembers')
          .select(['id'])
          .where('projectId', '=', projectId)
          .where('userId', '=', managerId)
          .executeTakeFirst();
        if (membership) {
          await query()
            .updateTable('deliveryProjectMembers')
            .set({ role: 'manager', updatedAt: now() })
            .where('id', '=', Number(membership.id))
            .execute();
        } else {
          await query()
            .insertInto('deliveryProjectMembers')
            .values({
              projectId,
              userId: managerId,
              role: 'manager',
              createdAt: now(),
              updatedAt: now(),
            })
            .execute();
        }
      }
      if (input.status !== undefined) {
        patch.status = enumValue(input.status, PROJECT_STATUSES, 'active');
      }
      if (input.startDate !== undefined)
        patch.startDate = optionaltext(input.startDate);
      if (input.endDate !== undefined)
        patch.endDate = optionaltext(input.endDate);
      if (input.description !== undefined) {
        patch.description = optionaltext(input.description);
      }
      await query()
        .updateTable('deliveryProjects')
        .set(patch)
        .where('id', '=', projectId)
        .execute();
    },

    addMember: async (actor, projectId, input) => {
      await requireProjectManage(actor, projectId);
      const userId = requiredtext(input.userId, '成员');
      const role = enumValue(input.role, MEMBER_ROLES, 'member');
      const existing = await query()
        .selectFrom('deliveryProjectMembers')
        .select(['id'])
        .where('projectId', '=', projectId)
        .where('userId', '=', userId)
        .executeTakeFirst();
      if (existing) {
        await query()
          .updateTable('deliveryProjectMembers')
          .set({ role, updatedAt: now() })
          .where('id', '=', Number(existing.id))
          .execute();
        return;
      }
      await query()
        .insertInto('deliveryProjectMembers')
        .values({
          projectId,
          userId,
          role,
          createdAt: now(),
          updatedAt: now(),
        })
        .execute();
    },

    removeMember: async (actor, projectId, memberId) => {
      const project = await requireProjectManage(actor, projectId);
      const membership = await query()
        .selectFrom('deliveryProjectMembers')
        .selectAll()
        .where('id', '=', memberId)
        .where('projectId', '=', projectId)
        .executeTakeFirst();
      if (!membership) {
        throw new DeliveryError('NOT_FOUND', '成员不存在。', 404);
      }
      if (text(membership.userId) === text(project.managerId)) {
        throw new DeliveryError(
          'MANAGER_MEMBER',
          '请先更换项目经理再移除该成员。',
          409,
        );
      }
      await query()
        .deleteFrom('deliveryProjectMembers')
        .where('id', '=', memberId)
        .execute();
    },

    listMaterials: async (actor, projectId) => {
      await requireProjectView(actor, projectId);
      const rows = await query()
        .selectFrom('deliveryMaterials')
        .selectAll()
        .where('projectId', '=', projectId)
        .orderBy('createdAt', 'desc')
        .execute();
      const users = await loadUsers();
      return Promise.all(rows.map((row) => materialView(row, users)));
    },

    createMaterial: async (actor, projectId, input) => {
      await requireProjectManage(actor, projectId);
      const title = requiredtext(input.title, '资料名称');
      const fileIds = await assertFileIds(input.fileIds);
      await query()
        .insertInto('deliveryMaterials')
        .values({
          projectId,
          title,
          note: optionaltext(input.note),
          createdById: actor.userId,
          createdAt: now(),
          updatedAt: now(),
        })
        .execute();
      const created = await query()
        .selectFrom('deliveryMaterials')
        .select(['id'])
        .where('projectId', '=', projectId)
        .where('title', '=', title)
        .orderBy('id', 'desc')
        .executeTakeFirst();
      const materialId = Number(created?.id);
      for (const [index, fileId] of fileIds.entries()) {
        await query()
          .insertInto('deliveryMaterialFiles')
          .values({
            materialId,
            fileId,
            sortOrder: index,
            createdAt: now(),
          })
          .execute();
      }
    },

    removeMaterial: async (actor, materialId) => {
      const material = await query()
        .selectFrom('deliveryMaterials')
        .selectAll()
        .where('id', '=', materialId)
        .executeTakeFirst();
      if (!material) throw new DeliveryError('NOT_FOUND', '资料不存在。', 404);
      await requireProjectManage(actor, Number(material.projectId));
      const links = await query()
        .selectFrom('deliveryMaterialFiles')
        .select(['fileId'])
        .where('materialId', '=', materialId)
        .execute();
      await query()
        .deleteFrom('deliveryMaterialFiles')
        .where('materialId', '=', materialId)
        .execute();
      await query()
        .deleteFrom('deliveryMaterials')
        .where('id', '=', materialId)
        .execute();
      for (const link of links) await deleteFileIfUnlinked(text(link.fileId));
    },

    removeMaterialFile: async (actor, materialId, fileId) => {
      const material = await query()
        .selectFrom('deliveryMaterials')
        .selectAll()
        .where('id', '=', materialId)
        .executeTakeFirst();
      if (!material) throw new DeliveryError('NOT_FOUND', '资料不存在。', 404);
      await requireProjectManage(actor, Number(material.projectId));
      await query()
        .deleteFrom('deliveryMaterialFiles')
        .where('materialId', '=', materialId)
        .where('fileId', '=', fileId)
        .execute();
      await deleteFileIfUnlinked(fileId);
    },

    listMilestones: async (actor, filter) => {
      const ids = await visibleProjectIds(actor);
      if (!ids.length) return [];
      let builder = query()
        .selectFrom('deliveryMilestones')
        .selectAll()
        .where('projectId', 'in', ids);
      if (filter.projectId !== undefined) {
        builder = builder.where('projectId', '=', filter.projectId);
      }
      const rows = await builder.orderBy('dueDate', 'asc').execute();
      const projectRows = await query()
        .selectFrom('deliveryProjects')
        .select(['id', 'name', 'code'])
        .where('id', 'in', ids)
        .execute();
      const projectById = new Map(
        projectRows.map((row) => [Number(row.id), row]),
      );
      const submissionRows = await query()
        .selectFrom('deliverySubmissions')
        .selectAll()
        .where(
          'milestoneId',
          'in',
          rows.map((row) => Number(row.id)).concat([-1]),
        )
        .execute();
      const users = await loadUsers();
      return Promise.all(
        rows.map(async (row) => {
          const view = await milestoneView(row, submissionRows, users);
          const project = projectById.get(Number(row.projectId));
          return {
            ...view,
            projectName: project ? text(project.name) : '',
            projectCode: project ? text(project.code) : '',
          };
        }),
      );
    },

    getMilestone: async (actor, milestoneId) => {
      const row = await requireMilestoneView(actor, milestoneId);
      const users = await loadUsers();
      const projectRowValue = await projectRow(Number(row.projectId));
      const [taskRows, submissionRows] = await Promise.all([
        query()
          .selectFrom('deliveryTasks')
          .selectAll()
          .where('milestoneId', '=', milestoneId)
          .orderBy('id', 'asc')
          .execute(),
        query()
          .selectFrom('deliverySubmissions')
          .selectAll()
          .where('milestoneId', '=', milestoneId)
          .orderBy('round', 'asc')
          .execute(),
      ]);
      return {
        milestone: await milestoneView(row, submissionRows, users),
        project: await projectView(actor, projectRowValue!, users),
        tasks: await Promise.all(taskRows.map((task) => taskView(task, users))),
        submissions: await Promise.all(
          submissionRows.map((submission) => submissionView(actor, submission)),
        ),
      };
    },

    createMilestone: async (actor, input) => {
      const projectId = requiredNumber(input.projectId, '项目');
      await requireProjectManage(actor, projectId);
      await query()
        .insertInto('deliveryMilestones')
        .values({
          projectId,
          name: requiredtext(input.name, '里程碑名称'),
          dueDate: optionaltext(input.dueDate),
          status: 'pending',
          description: optionaltext(input.description),
          createdById: actor.userId,
          createdAt: now(),
          updatedAt: now(),
        })
        .execute();
      const created = await query()
        .selectFrom('deliveryMilestones')
        .select(['id'])
        .where('projectId', '=', projectId)
        .orderBy('id', 'desc')
        .executeTakeFirst();
      return Number(created?.id);
    },

    updateMilestone: async (actor, milestoneId, input) => {
      const milestone = await query()
        .selectFrom('deliveryMilestones')
        .selectAll()
        .where('id', '=', milestoneId)
        .executeTakeFirst();
      if (!milestone)
        throw new DeliveryError('NOT_FOUND', '里程碑不存在。', 404);
      await requireProjectManage(actor, Number(milestone.projectId));
      const patch: Record<string, unknown> = { updatedAt: now() };
      if (input.name !== undefined)
        patch.name = requiredtext(input.name, '里程碑名称');
      if (input.dueDate !== undefined)
        patch.dueDate = optionaltext(input.dueDate);
      if (input.description !== undefined) {
        patch.description = optionaltext(input.description);
      }
      await query()
        .updateTable('deliveryMilestones')
        .set(patch)
        .where('id', '=', milestoneId)
        .execute();
    },

    milestoneVersions: async (actor, milestoneId) => {
      await requireMilestoneView(actor, milestoneId);
      const users = await loadUsers();
      const tasks = await query()
        .selectFrom('deliveryTasks')
        .select(['id', 'title'])
        .where('milestoneId', '=', milestoneId)
        .orderBy('id', 'asc')
        .execute();
      const groups: DeliveryVersionGroup[] = [];
      for (const task of tasks) {
        const taskId = Number(task.id);
        const resultRows = await query()
          .selectFrom('deliveryTaskResults')
          .selectAll()
          .where('taskId', '=', taskId)
          .orderBy('id', 'asc')
          .execute();
        const results = [];
        for (const result of resultRows) {
          results.push({
            id: Number(result.id),
            title: text(result.title),
            versions: await versionViews(Number(result.id), users),
          });
        }
        groups.push({
          taskId,
          taskTitle: text(task.title),
          results,
        });
      }
      return groups;
    },

    listTasks: async (actor, filter) => {
      const ids = await visibleProjectIds(actor);
      if (!ids.length) return [];
      let builder = query()
        .selectFrom('deliveryTasks')
        .selectAll()
        .where('projectId', 'in', ids);
      if (filter.projectId !== undefined) {
        builder = builder.where('projectId', '=', filter.projectId);
      }
      if (filter.milestoneId !== undefined) {
        builder = builder.where('milestoneId', '=', filter.milestoneId);
      }
      if (filter.mine) {
        builder = builder.where('assigneeId', '=', actor.userId);
      }
      const rows = await builder.orderBy('planDate', 'asc').execute();
      const users = await loadUsers();
      return Promise.all(rows.map((row) => taskView(row, users)));
    },

    getTask: async (actor, taskId) => {
      const row = await requireTaskView(actor, taskId);
      const users = await loadUsers();
      const projectRowValue = await projectRow(Number(row.projectId));
      const milestoneRow = await query()
        .selectFrom('deliveryMilestones')
        .selectAll()
        .where('id', '=', Number(row.milestoneId))
        .executeTakeFirst();
      const role = projectRowValue
        ? await projectRole(actor, projectRowValue)
        : undefined;
      const canManage = role === 'admin' || role === 'manager';
      const canUpload =
        canManage || text(row.assigneeId ?? '') === actor.userId;
      const resultRows = await query()
        .selectFrom('deliveryTaskResults')
        .selectAll()
        .where('taskId', '=', taskId)
        .orderBy('id', 'asc')
        .execute();
      const results = [];
      for (const result of resultRows) {
        const versionRows = await query()
          .selectFrom('deliveryTaskResultVersions')
          .selectAll()
          .where('resultId', '=', Number(result.id))
          .orderBy('versionNo', 'asc')
          .execute();
        const versions = [];
        for (const version of versionRows) {
          const links = await query()
            .selectFrom('deliveryTaskResultVersionFiles')
            .select(['fileId', 'sortOrder'])
            .where('versionId', '=', Number(version.id))
            .execute();
          links.sort(
            (left, right) => Number(left.sortOrder) - Number(right.sortOrder),
          );
          const referenced = await query()
            .selectFrom('deliverySubmissionItems')
            .select(['id'])
            .where('resultVersionId', '=', Number(version.id))
            .executeTakeFirst();
          const uploaderId =
            version.createdById == null ? null : text(version.createdById);
          versions.push({
            id: Number(version.id),
            versionNo: Number(version.versionNo),
            note: version.note == null ? null : text(version.note),
            uploaderName: uploaderId ? (users.get(uploaderId)?.name ?? '') : '',
            createdAt: serializeDate(version.createdAt),
            files: await fileViews(links.map((link) => text(link.fileId))),
            referencedBySubmission: Boolean(referenced),
          });
        }
        results.push({
          id: Number(result.id),
          title: text(result.title),
          versions,
        });
      }
      const submissionRows = await query()
        .selectFrom('deliverySubmissions')
        .selectAll()
        .where('milestoneId', '=', Number(row.milestoneId))
        .execute();
      return {
        task: await taskView(row, users),
        project: await projectView(actor, projectRowValue!, users),
        milestone: await milestoneView(milestoneRow!, submissionRows, users),
        results,
        canManage,
        canUpload,
      };
    },

    createTask: async (actor, input) => {
      const milestoneId = requiredNumber(input.milestoneId, '里程碑');
      const milestone = await query()
        .selectFrom('deliveryMilestones')
        .selectAll()
        .where('id', '=', milestoneId)
        .executeTakeFirst();
      if (!milestone)
        throw new DeliveryError('NOT_FOUND', '里程碑不存在。', 404);
      await requireProjectManage(actor, Number(milestone.projectId));
      await query()
        .insertInto('deliveryTasks')
        .values({
          milestoneId,
          projectId: Number(milestone.projectId),
          title: requiredtext(input.title, '任务名称'),
          assigneeId: optionaltext(input.assigneeId),
          priority: enumValue(input.priority, PRIORITIES, 'medium'),
          planDate: optionaltext(input.planDate),
          actualDate: null,
          status: 'todo',
          description: optionaltext(input.description),
          createdById: actor.userId,
          createdAt: now(),
          updatedAt: now(),
        })
        .execute();
      const created = await query()
        .selectFrom('deliveryTasks')
        .select(['id'])
        .where('milestoneId', '=', milestoneId)
        .orderBy('id', 'desc')
        .executeTakeFirst();
      return Number(created?.id);
    },

    updateTask: async (actor, taskId, input) => {
      const task = await query()
        .selectFrom('deliveryTasks')
        .selectAll()
        .where('id', '=', taskId)
        .executeTakeFirst();
      if (!task) throw new DeliveryError('NOT_FOUND', '任务不存在。', 404);
      const projectRowValue = await requireProjectView(
        actor,
        Number(task.projectId),
      );
      const role = await projectRole(actor, projectRowValue);
      const canManage = role === 'admin' || role === 'manager';
      const isAssignee = text(task.assigneeId ?? '') === actor.userId;
      if (!canManage && !isAssignee) {
        throw new DeliveryError('FORBIDDEN', '只能更新分配给自己的任务。', 403);
      }
      const milestone = await query()
        .selectFrom('deliveryMilestones')
        .select(['id', 'status'])
        .where('id', '=', Number(task.milestoneId))
        .executeTakeFirst();
      const milestoneCompleted = milestone?.status === 'completed';
      const patch: Record<string, unknown> = { updatedAt: now() };

      if (input.status !== undefined) {
        const status = enumValue(input.status, TASK_STATUSES, 'todo');
        if (milestoneCompleted && status !== 'done') {
          throw new DeliveryError(
            'MILESTONE_COMPLETED',
            '里程碑已验收完成，不能把任务改回未完成。',
            409,
          );
        }
        patch.status = status;
        if (status === 'done') {
          patch.actualDate =
            optionaltext(input.actualDate) ?? text(task.actualDate ?? today());
        } else {
          patch.actualDate = null;
        }
      }
      if (canManage) {
        if (input.title !== undefined)
          patch.title = requiredtext(input.title, '任务名称');
        if (input.assigneeId !== undefined) {
          patch.assigneeId = optionaltext(input.assigneeId);
        }
        if (input.priority !== undefined) {
          patch.priority = enumValue(input.priority, PRIORITIES, 'medium');
        }
        if (input.planDate !== undefined)
          patch.planDate = optionaltext(input.planDate);
        if (input.description !== undefined) {
          patch.description = optionaltext(input.description);
        }
      } else if (
        input.title !== undefined ||
        input.assigneeId !== undefined ||
        input.priority !== undefined ||
        input.planDate !== undefined
      ) {
        throw new DeliveryError('FORBIDDEN', '成员只能更新任务状态。', 403);
      }

      await query()
        .updateTable('deliveryTasks')
        .set(patch)
        .where('id', '=', taskId)
        .execute();
      await syncMilestoneStatus(Number(task.milestoneId));
    },

    createResult: async (actor, taskId, input) => {
      const task = await query()
        .selectFrom('deliveryTasks')
        .selectAll()
        .where('id', '=', taskId)
        .executeTakeFirst();
      if (!task) throw new DeliveryError('NOT_FOUND', '任务不存在。', 404);
      const projectRowValue = await requireProjectView(
        actor,
        Number(task.projectId),
      );
      const role = await projectRole(actor, projectRowValue);
      if (
        role !== 'admin' &&
        role !== 'manager' &&
        text(task.assigneeId ?? '') !== actor.userId
      ) {
        throw new DeliveryError(
          'FORBIDDEN',
          '只有任务负责人可以上传工作成果。',
          403,
        );
      }
      await assertMilestoneOpen(Number(task.milestoneId));
      const title = requiredtext(input.title, '成果名称');
      const existing = await query()
        .selectFrom('deliveryTaskResults')
        .select(['id'])
        .where('taskId', '=', taskId)
        .where('title', '=', title)
        .executeTakeFirst();
      if (existing) {
        throw new DeliveryError(
          'RESULT_EXISTS',
          '同名成果已存在，请直接新增版本。',
          409,
        );
      }
      await query()
        .insertInto('deliveryTaskResults')
        .values({
          taskId,
          title,
          createdById: actor.userId,
          createdAt: now(),
          updatedAt: now(),
        })
        .execute();
      const created = await query()
        .selectFrom('deliveryTaskResults')
        .select(['id'])
        .where('taskId', '=', taskId)
        .orderBy('id', 'desc')
        .executeTakeFirst();
      const resultId = Number(created?.id);
      await service.addResultVersion(actor, resultId, {
        note: optionaltext(input.note) ?? '初版成果',
        fileIds: input.fileIds,
      });
      return resultId;
    },

    addResultVersion: async (actor, resultId, input) => {
      const result = await query()
        .selectFrom('deliveryTaskResults')
        .selectAll()
        .where('id', '=', resultId)
        .executeTakeFirst();
      if (!result) throw new DeliveryError('NOT_FOUND', '成果不存在。', 404);
      const task = await query()
        .selectFrom('deliveryTasks')
        .selectAll()
        .where('id', '=', Number(result.taskId))
        .executeTakeFirst();
      if (!task) throw new DeliveryError('NOT_FOUND', '任务不存在。', 404);
      const projectRowValue = await requireProjectView(
        actor,
        Number(task.projectId),
      );
      const role = await projectRole(actor, projectRowValue);
      if (
        role !== 'admin' &&
        role !== 'manager' &&
        text(task.assigneeId ?? '') !== actor.userId
      ) {
        throw new DeliveryError(
          'FORBIDDEN',
          '只有任务负责人可以上传工作成果。',
          403,
        );
      }
      await assertMilestoneOpen(Number(task.milestoneId));
      const fileIds = await assertFileIds(input.fileIds);
      const latest = await query()
        .selectFrom('deliveryTaskResultVersions')
        .select(['versionNo'])
        .where('resultId', '=', resultId)
        .orderBy('versionNo', 'desc')
        .executeTakeFirst();
      const versionNo = latest ? Number(latest.versionNo) + 1 : 1;
      await query()
        .insertInto('deliveryTaskResultVersions')
        .values({
          resultId,
          versionNo,
          note: optionaltext(input.note) ?? `第 ${versionNo} 版`,
          createdById: actor.userId,
          createdAt: now(),
          updatedAt: now(),
        })
        .execute();
      const created = await query()
        .selectFrom('deliveryTaskResultVersions')
        .select(['id'])
        .where('resultId', '=', resultId)
        .where('versionNo', '=', versionNo)
        .executeTakeFirst();
      const versionId = Number(created?.id);
      for (const [index, fileId] of fileIds.entries()) {
        await query()
          .insertInto('deliveryTaskResultVersionFiles')
          .values({
            versionId,
            fileId,
            sortOrder: index,
            createdAt: now(),
          })
          .execute();
      }
      return versionId;
    },

    removeVersionFile: async (actor, versionId, fileId) => {
      const version = await query()
        .selectFrom('deliveryTaskResultVersions')
        .selectAll()
        .where('id', '=', versionId)
        .executeTakeFirst();
      if (!version)
        throw new DeliveryError('NOT_FOUND', '成果版本不存在。', 404);
      const result = await query()
        .selectFrom('deliveryTaskResults')
        .select(['taskId'])
        .where('id', '=', Number(version.resultId))
        .executeTakeFirst();
      const task = result
        ? await query()
            .selectFrom('deliveryTasks')
            .selectAll()
            .where('id', '=', Number(result.taskId))
            .executeTakeFirst()
        : undefined;
      if (!task) throw new DeliveryError('NOT_FOUND', '任务不存在。', 404);
      const projectRowValue = await requireProjectView(
        actor,
        Number(task.projectId),
      );
      const role = await projectRole(actor, projectRowValue);
      const isAssignee = text(task.assigneeId ?? '') === actor.userId;
      if (role !== 'admin' && role !== 'manager' && !isAssignee) {
        throw new DeliveryError('FORBIDDEN', '无权移除该成果文件。', 403);
      }
      const referenced = await query()
        .selectFrom('deliverySubmissionItems')
        .select(['id'])
        .where('resultVersionId', '=', versionId)
        .executeTakeFirst();
      if (referenced) {
        throw new DeliveryError(
          'VERSION_REFERENCED',
          '该成果版本已被交付申请引用，移除会破坏历史验收内容，已阻止。如需修改，请上传新版本。',
          409,
        );
      }
      await query()
        .deleteFrom('deliveryTaskResultVersionFiles')
        .where('versionId', '=', versionId)
        .where('fileId', '=', fileId)
        .execute();
      await deleteFileIfUnlinked(fileId);
    },

    listSubmissions: async (actor, filter) => {
      const projectIds = await visibleProjectIds(actor);
      const scope = filter.scope ?? 'all';
      const rows = await query()
        .selectFrom('deliverySubmissions')
        .selectAll()
        .orderBy('createdAt', 'desc')
        .execute();
      const filtered = rows.filter((row) => {
        if (scope === 'review') {
          return (
            actor.userId === text(row.reviewerId) ||
            (actor.isAdmin && text(row.status) === 'pending')
          );
        }
        if (scope === 'mine') {
          return actor.userId === text(row.applicantId);
        }
        if (actor.isAdmin) return true;
        return (
          actor.userId === text(row.applicantId) ||
          actor.userId === text(row.reviewerId) ||
          projectIds.includes(Number(row.projectId))
        );
      });
      return Promise.all(filtered.map((row) => submissionView(actor, row)));
    },

    getSubmission: async (actor, submissionId) => {
      const row = await requireSubmissionView(actor, submissionId);
      return submissionView(actor, row);
    },

    createSubmission: async (actor, input) => {
      const milestoneId = requiredNumber(input.milestoneId, '里程碑');
      const milestone = await query()
        .selectFrom('deliveryMilestones')
        .selectAll()
        .where('id', '=', milestoneId)
        .executeTakeFirst();
      if (!milestone)
        throw new DeliveryError('NOT_FOUND', '里程碑不存在。', 404);
      // An accepted milestone is done: its results are frozen and no further
      // delivery is owed, so another application would only reopen a settled
      // review. The client hides the entry too, but the rule lives here.
      if (text(milestone.status) === 'completed') {
        throw new DeliveryError(
          'MILESTONE_COMPLETED',
          '里程碑已验收完成，无需再次提交交付。',
          409,
        );
      }
      const projectId = Number(milestone.projectId);
      await requireProjectManage(actor, projectId);
      const tasks = await query()
        .selectFrom('deliveryTasks')
        .select(['id', 'status'])
        .where('milestoneId', '=', milestoneId)
        .execute();
      if (!tasks.length) {
        throw new DeliveryError(
          'NO_TASKS',
          '里程碑还没有任务，无法提交交付。',
          409,
        );
      }
      if (tasks.some((task) => task.status !== 'done')) {
        throw new DeliveryError(
          'TASKS_INCOMPLETE',
          '里程碑下仍有未完成的任务，任务全部完成后才能提交交付。',
          409,
        );
      }
      const reviewerId = requiredtext(input.reviewerId, '验收人');
      if (reviewerId === actor.userId) {
        throw new DeliveryError(
          'SELF_REVIEW',
          '申请人不能验收自己提交的交付申请。',
          409,
        );
      }
      const versionIds = Array.isArray(input.versionIds)
        ? input.versionIds.map((value) => Number(value))
        : [];
      if (!versionIds.length) {
        throw new DeliveryError(
          'NO_VERSIONS',
          '请选择本次要验收的成果版本。',
          400,
        );
      }
      const versions = await query()
        .selectFrom('deliveryTaskResultVersions')
        .select(['id', 'resultId'])
        .where('id', 'in', versionIds)
        .execute();
      if (versions.length !== new Set(versionIds).size) {
        throw new DeliveryError(
          'VERSION_NOT_FOUND',
          '选择的成果版本不存在。',
          400,
        );
      }
      const resultIds = versions.map((version) => Number(version.resultId));
      const results = await query()
        .selectFrom('deliveryTaskResults')
        .select(['id', 'taskId'])
        .where('id', 'in', resultIds)
        .execute();
      const taskIds = new Set(results.map((result) => Number(result.taskId)));
      const taskRows = taskIds.size
        ? await query()
            .selectFrom('deliveryTasks')
            .select(['id', 'milestoneId'])
            .where('id', 'in', [...taskIds])
            .execute()
        : [];
      if (taskRows.some((task) => Number(task.milestoneId) !== milestoneId)) {
        throw new DeliveryError(
          'VERSION_MISMATCH',
          '只能选择该里程碑下任务的成果版本。',
          400,
        );
      }

      const previous = await query()
        .selectFrom('deliverySubmissions')
        .selectAll()
        .where('milestoneId', '=', milestoneId)
        .orderBy('round', 'desc')
        .executeTakeFirst();
      const round = previous ? Number(previous.round) + 1 : 1;
      await query()
        .insertInto('deliverySubmissions')
        .values({
          projectId,
          milestoneId,
          applicantId: actor.userId,
          reviewerId,
          status: 'pending',
          note: optionaltext(input.note),
          previousSubmissionId: previous ? Number(previous.id) : null,
          round,
          decidedAt: null,
          createdAt: now(),
          updatedAt: now(),
        })
        .execute();
      const created = await query()
        .selectFrom('deliverySubmissions')
        .select(['id'])
        .where('milestoneId', '=', milestoneId)
        .where('round', '=', round)
        .executeTakeFirst();
      const submissionId = Number(created?.id);
      for (const versionId of new Set(versionIds)) {
        await query()
          .insertInto('deliverySubmissionItems')
          .values({
            submissionId,
            resultVersionId: versionId,
            createdAt: now(),
          })
          .execute();
      }
      await query()
        .insertInto('deliverySubmissionComments')
        .values({
          submissionId,
          authorId: actor.userId,
          action: round > 1 ? 'resubmit' : 'submit',
          content: optionaltext(input.note),
          createdAt: now(),
        })
        .execute();
      return submissionId;
    },

    decideSubmission: async (actor, submissionId, input) => {
      const row = await query()
        .selectFrom('deliverySubmissions')
        .selectAll()
        .where('id', '=', submissionId)
        .executeTakeFirst();
      if (!row) throw new DeliveryError('NOT_FOUND', '交付申请不存在。', 404);
      if (text(row.reviewerId) !== actor.userId) {
        throw new DeliveryError(
          'FORBIDDEN',
          '只有指定的验收人可以处理该申请。',
          403,
        );
      }
      if (text(row.applicantId) === actor.userId) {
        throw new DeliveryError(
          'SELF_REVIEW',
          '申请人不能验收自己提交的申请。',
          409,
        );
      }
      if (text(row.status) !== 'pending') {
        throw new DeliveryError('ALREADY_DECIDED', '该申请已经处理过。', 409);
      }
      const decision = text(input.decision ?? '');
      if (decision !== 'approve' && decision !== 'return') {
        throw new DeliveryError(
          'INVALID_DECISION',
          '请选择验收通过或退回。',
          400,
        );
      }
      const comment = optionaltext(input.comment);
      if (decision === 'return' && !comment) {
        throw new DeliveryError(
          'RETURN_REASON_REQUIRED',
          '退回必须填写原因。',
          400,
        );
      }
      await query()
        .updateTable('deliverySubmissions')
        .set({
          status: decision === 'approve' ? 'approved' : 'returned',
          decidedAt: now(),
          updatedAt: now(),
        })
        .where('id', '=', submissionId)
        .execute();
      await query()
        .insertInto('deliverySubmissionComments')
        .values({
          submissionId,
          authorId: actor.userId,
          action: decision === 'approve' ? 'approve' : 'return',
          content: comment,
          createdAt: now(),
        })
        .execute();
      if (decision === 'approve') {
        await query()
          .updateTable('deliveryMilestones')
          .set({ status: 'completed', updatedAt: now() })
          .where('id', '=', Number(row.milestoneId))
          .execute();
      } else {
        await syncMilestoneStatus(Number(row.milestoneId));
      }
    },

    dashboard: async (actor) => {
      const projectIds = await visibleProjectIds(actor);
      const users = await loadUsers();
      if (!projectIds.length) {
        return {
          projectCount: 0,
          milestoneCount: 0,
          milestonesCompleted: 0,
          milestoneCompletionRate: 0,
          taskCount: 0,
          tasksCompleted: 0,
          overdueTaskCount: 0,
          pendingReviewCount: await countPendingReviews(actor),
          myOpenTaskCount: 0,
          overdueTasks: [],
          myTasks: [],
          pendingReviews: await service.listSubmissions(actor, {
            scope: 'review',
          }),
        };
      }
      const [projects, milestones, tasks] = await Promise.all([
        query()
          .selectFrom('deliveryProjects')
          .select(['id', 'name'])
          .where('id', 'in', projectIds)
          .execute(),
        query()
          .selectFrom('deliveryMilestones')
          .select(['id', 'status', 'projectId', 'name'])
          .where('projectId', 'in', projectIds)
          .execute(),
        query()
          .selectFrom('deliveryTasks')
          .selectAll()
          .where('projectId', 'in', projectIds)
          .execute(),
      ]);
      const projectName = new Map(
        projects.map((project) => [Number(project.id), text(project.name)]),
      );
      const milestoneName = new Map(
        milestones.map((milestone) => [
          Number(milestone.id),
          text(milestone.name),
        ]),
      );
      const taskViews = await Promise.all(
        tasks.map((task) => taskView(task, users)),
      );
      const overdue = taskViews
        .filter((view) => view.overdue)
        .sort((left, right) =>
          text(left.planDate).localeCompare(text(right.planDate)),
        )
        .map((view) => ({
          ...view,
          projectName: projectName.get(view.projectId) ?? '',
          milestoneName: milestoneName.get(view.milestoneId) ?? '',
        }));
      const myTasks = await service.listTasks(actor, { mine: true });
      const completedMilestones = milestones.filter(
        (milestone) => milestone.status === 'completed',
      ).length;
      return {
        projectCount: projects.length,
        milestoneCount: milestones.length,
        milestonesCompleted: completedMilestones,
        milestoneCompletionRate:
          milestones.length === 0 ? 0 : completedMilestones / milestones.length,
        taskCount: taskViews.length,
        tasksCompleted: taskViews.filter((task) => task.status === 'done')
          .length,
        overdueTaskCount: overdue.length,
        pendingReviewCount: await countPendingReviews(actor),
        myOpenTaskCount: myTasks.filter((task) => task.status !== 'done')
          .length,
        overdueTasks: overdue,
        myTasks,
        pendingReviews: await service.listSubmissions(actor, {
          scope: 'review',
        }),
      };
    },

    canAccessFile: async (actor, fileId) => {
      if (actor.isAdmin) return true;
      const [materialLinks, versionLinks] = await Promise.all([
        query()
          .selectFrom('deliveryMaterialFiles')
          .select(['materialId'])
          .where('fileId', '=', fileId)
          .execute(),
        query()
          .selectFrom('deliveryTaskResultVersionFiles')
          .select(['versionId'])
          .where('fileId', '=', fileId)
          .execute(),
      ]);
      const projectIds = new Set<number>();
      for (const link of materialLinks) {
        const material = await query()
          .selectFrom('deliveryMaterials')
          .select(['projectId'])
          .where('id', '=', Number(link.materialId))
          .executeTakeFirst();
        if (material) projectIds.add(Number(material.projectId));
      }
      for (const link of versionLinks) {
        const version = await query()
          .selectFrom('deliveryTaskResultVersions')
          .select(['resultId'])
          .where('id', '=', Number(link.versionId))
          .executeTakeFirst();
        if (!version) continue;
        const result = await query()
          .selectFrom('deliveryTaskResults')
          .select(['taskId'])
          .where('id', '=', Number(version.resultId))
          .executeTakeFirst();
        if (!result) continue;
        const task = await query()
          .selectFrom('deliveryTasks')
          .select(['projectId'])
          .where('id', '=', Number(result.taskId))
          .executeTakeFirst();
        if (task) projectIds.add(Number(task.projectId));
      }
      for (const projectId of projectIds) {
        const project = await projectRow(projectId);
        if (project && (await projectRole(actor, project))) return true;
      }
      // A reviewer sees the files of the application assigned to them, even
      // when they are not a member of the project team.
      const versionIds = versionLinks.map((link) => Number(link.versionId));
      if (!versionIds.length) return false;
      const items = await query()
        .selectFrom('deliverySubmissionItems')
        .select(['submissionId'])
        .where('resultVersionId', 'in', versionIds)
        .execute();
      const submissionIds = [
        ...new Set(items.map((item) => Number(item.submissionId))),
      ];
      if (!submissionIds.length) return false;
      const submissions = await query()
        .selectFrom('deliverySubmissions')
        .select(['applicantId', 'reviewerId'])
        .where('id', 'in', submissionIds)
        .execute();
      return submissions.some(
        (submission) =>
          text(submission.applicantId) === actor.userId ||
          text(submission.reviewerId) === actor.userId,
      );
    },
  };

  return service;
}

function requiredtext(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new DeliveryError('VALIDATION', `${label}不能为空。`, 400);
  }
  return text;
}

function optionaltext(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
}

function requiredNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new DeliveryError('VALIDATION', `${label}无效。`, 400);
  }
  return parsed;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined || value === null || value === '') return fallback;
  const candidate = text(value);
  if (!allowed.includes(candidate as T)) {
    throw new DeliveryError('VALIDATION', `不支持的状态值：${candidate}`, 400);
  }
  return candidate as T;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint')
    return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}
