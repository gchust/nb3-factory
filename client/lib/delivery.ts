import { ApiClientError, type ApiClient } from '@nocobase/app-client';

export interface DeliveryFile {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly contentUrl: string;
}

export interface DeliveryUser {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
}

export interface DeliveryMember {
  readonly id: number;
  readonly userId: string;
  readonly name: string;
  readonly username: string;
  readonly role: string;
}

export interface DeliveryMaterial {
  readonly id: number;
  readonly projectId: number;
  readonly title: string;
  readonly note: string | null;
  readonly uploaderName: string;
  readonly createdAt: string;
  readonly files: readonly DeliveryFile[];
}

export interface DeliveryTask {
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

export interface DeliveryMilestone {
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

export interface DeliveryProject {
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

export interface DeliveryVersion {
  readonly id: number;
  readonly versionNo: number;
  readonly note: string | null;
  readonly uploaderName: string;
  readonly createdAt: string;
  readonly files: readonly DeliveryFile[];
  readonly referencedBySubmission: boolean;
}

export interface DeliveryResult {
  readonly id: number;
  readonly title: string;
  readonly versions: readonly DeliveryVersion[];
}

export interface DeliverySubmissionItem {
  readonly id: number;
  readonly taskId: number;
  readonly taskTitle: string;
  readonly resultId: number;
  readonly resultTitle: string;
  readonly versionId: number;
  readonly versionNo: number;
  readonly note: string | null;
  readonly uploaderName: string;
  readonly files: readonly DeliveryFile[];
}

export interface DeliverySubmissionComment {
  readonly id: number;
  readonly action: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly content: string | null;
  readonly createdAt: string;
}

export interface DeliverySubmission extends DeliverySubmissionSummary {
  readonly projectId: number;
  readonly projectName: string;
  readonly milestoneId: number;
  readonly milestoneName: string;
  readonly note: string | null;
  readonly decidedAt: string | null;
  readonly previousSubmissionId: number | null;
  readonly items: readonly DeliverySubmissionItem[];
  readonly comments: readonly DeliverySubmissionComment[];
  readonly history: readonly DeliverySubmissionSummary[];
  readonly canDecide: boolean;
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
  readonly overdueTasks: readonly (DeliveryTask & {
    readonly projectName: string;
    readonly milestoneName: string;
  })[];
  readonly myTasks: readonly DeliveryTask[];
  readonly pendingReviews: readonly DeliverySubmissionSummary[];
}

export interface ProjectDetail {
  readonly project: DeliveryProject;
  readonly members: readonly DeliveryMember[];
  readonly materials: readonly DeliveryMaterial[];
  readonly milestones: readonly DeliveryMilestone[];
}

export interface MilestoneDetail {
  readonly milestone: DeliveryMilestone;
  readonly project: DeliveryProject;
  readonly tasks: readonly DeliveryTask[];
  readonly submissions: readonly DeliverySubmission[];
}

export interface TaskDetail {
  readonly task: DeliveryTask;
  readonly project: DeliveryProject;
  readonly milestone: DeliveryMilestone;
  readonly results: readonly DeliveryResult[];
  readonly canManage: boolean;
  readonly canUpload: boolean;
}

export interface MilestoneListItem extends DeliveryMilestone {
  readonly projectName: string;
  readonly projectCode: string;
}

export interface DeliveryVersionGroup {
  readonly taskId: number;
  readonly taskTitle: string;
  readonly results: readonly {
    readonly id: number;
    readonly title: string;
    readonly versions: readonly DeliveryVersion[];
  }[];
}

export interface DeliveryMe {
  readonly userId: string;
  readonly isAdmin: boolean;
}

type Scalar = string | number | boolean;

async function get<T>(
  api: ApiClient,
  path: string,
  query?: Record<string, Scalar>,
): Promise<T> {
  const body = await api.request<{ data: T }>({
    path,
    ...(query ? { query } : {}),
  });
  return body.data;
}

async function send<T>(
  api: ApiClient,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  json?: Record<string, unknown>,
): Promise<T> {
  const body = await api.request<{ data: T }>({
    path,
    method,
    ...(json ? { json } : {}),
  });
  return body.data;
}

export const deliveryApi = {
  dashboard: (api: ApiClient) =>
    get<DeliveryDashboard>(api, 'delivery/dashboard'),
  me: (api: ApiClient) => get<DeliveryMe>(api, 'delivery/me'),
  users: (api: ApiClient) =>
    get<readonly DeliveryUser[]>(api, 'delivery/users'),

  projects: (api: ApiClient) =>
    get<readonly DeliveryProject[]>(api, 'delivery/projects'),
  project: (api: ApiClient, id: number) =>
    get<ProjectDetail>(api, `delivery/projects/${id}`),
  createProject: (api: ApiClient, input: Record<string, unknown>) =>
    send<{ id: number }>(api, 'POST', 'delivery/projects', input),
  updateProject: (api: ApiClient, id: number, input: Record<string, unknown>) =>
    send<boolean>(api, 'PATCH', `delivery/projects/${id}`, input),
  addMember: (api: ApiClient, id: number, input: Record<string, unknown>) =>
    send<boolean>(api, 'POST', `delivery/projects/${id}/members`, input),
  removeMember: (api: ApiClient, id: number, memberId: number) =>
    send<boolean>(api, 'DELETE', `delivery/projects/${id}/members/${memberId}`),

  materials: (api: ApiClient, projectId: number) =>
    get<readonly DeliveryMaterial[]>(
      api,
      `delivery/projects/${projectId}/materials`,
    ),
  createMaterial: (
    api: ApiClient,
    projectId: number,
    input: Record<string, unknown>,
  ) =>
    send<boolean>(
      api,
      'POST',
      `delivery/projects/${projectId}/materials`,
      input,
    ),
  removeMaterial: (api: ApiClient, materialId: number) =>
    send<boolean>(api, 'DELETE', `delivery/materials/${materialId}`),
  removeMaterialFile: (api: ApiClient, materialId: number, fileId: string) =>
    send<boolean>(
      api,
      'DELETE',
      `delivery/materials/${materialId}/files/${fileId}`,
    ),

  milestones: (api: ApiClient, projectId?: number) =>
    get<readonly MilestoneListItem[]>(
      api,
      'delivery/milestones',
      projectId === undefined ? undefined : { projectId },
    ),
  milestone: (api: ApiClient, id: number) =>
    get<MilestoneDetail>(api, `delivery/milestones/${id}`),
  milestoneVersions: (api: ApiClient, id: number) =>
    get<readonly DeliveryVersionGroup[]>(
      api,
      `delivery/milestones/${id}/versions`,
    ),
  createMilestone: (api: ApiClient, input: Record<string, unknown>) =>
    send<{ id: number }>(api, 'POST', 'delivery/milestones', input),
  updateMilestone: (
    api: ApiClient,
    id: number,
    input: Record<string, unknown>,
  ) => send<boolean>(api, 'PATCH', `delivery/milestones/${id}`, input),

  tasks: (
    api: ApiClient,
    filter: { projectId?: number; milestoneId?: number; mine?: boolean },
  ) => {
    const query: Record<string, Scalar> = {};
    if (filter.projectId !== undefined) query.projectId = filter.projectId;
    if (filter.milestoneId !== undefined)
      query.milestoneId = filter.milestoneId;
    if (filter.mine) query.mine = true;
    return get<readonly DeliveryTask[]>(api, 'delivery/tasks', query);
  },
  task: (api: ApiClient, id: number) =>
    get<TaskDetail>(api, `delivery/tasks/${id}`),
  createTask: (api: ApiClient, input: Record<string, unknown>) =>
    send<{ id: number }>(api, 'POST', 'delivery/tasks', input),
  updateTask: (api: ApiClient, id: number, input: Record<string, unknown>) =>
    send<boolean>(api, 'PATCH', `delivery/tasks/${id}`, input),

  createResult: (
    api: ApiClient,
    taskId: number,
    input: Record<string, unknown>,
  ) =>
    send<{ id: number }>(
      api,
      'POST',
      `delivery/tasks/${taskId}/results`,
      input,
    ),
  addVersion: (
    api: ApiClient,
    resultId: number,
    input: Record<string, unknown>,
  ) =>
    send<{ id: number }>(
      api,
      'POST',
      `delivery/results/${resultId}/versions`,
      input,
    ),
  removeVersionFile: (api: ApiClient, versionId: number, fileId: string) =>
    send<boolean>(
      api,
      'DELETE',
      `delivery/versions/${versionId}/files/${fileId}`,
    ),

  submissions: (api: ApiClient, scope: 'mine' | 'review' | 'all') =>
    get<readonly DeliverySubmission[]>(api, 'delivery/submissions', { scope }),
  submission: (api: ApiClient, id: number) =>
    get<DeliverySubmission>(api, `delivery/submissions/${id}`),
  createSubmission: (api: ApiClient, input: Record<string, unknown>) =>
    send<{ id: number }>(api, 'POST', 'delivery/submissions', input),
  decide: (api: ApiClient, id: number, input: Record<string, unknown>) =>
    send<boolean>(api, 'POST', `delivery/submissions/${id}/decision`, input),
};

export interface UploadedRecord {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly contentUrl: string;
}

export async function uploadDeliveryFile(
  api: ApiClient,
  file: File,
  signal?: AbortSignal,
): Promise<UploadedRecord> {
  const body = new FormData();
  body.append('file', file);
  const response = await api.request<{
    data: { record: UploadedRecord };
  }>({
    path: 'deliveryFiles:uploadOne',
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
  return response.data.record;
}

/**
 * Query retry policy. A 4xx answer is a final decision — not signed in, no
 * access, not found — so it must reach the page at once instead of being
 * retried with backoff, which leaves the page loading with no reason shown.
 * Only transient failures (network, 5xx) are retried.
 */
export function shouldRetryDeliveryRequest(
  failureCount: number,
  error: unknown,
): boolean {
  if (
    error instanceof ApiClientError &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return false;
  }
  return failureCount < 2;
}

export function deliveryErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const payload = error.payload;
    if (
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof (payload as { message?: unknown }).message === 'string' &&
      (payload as { message: string }).message
    ) {
      return (payload as { message: string }).message;
    }
    if (error.status === 401) return '登录状态已失效，请重新登录。';
    if (error.status === 403) return '没有权限执行该操作。';
    if (error.status === 413) return '文件超过 5 MB 限制。';
    if (error.status >= 500) return '服务暂时不可用，请稍后重试。';
    return error.message;
  }
  // A dropped connection or an interrupted upload rejects with a browser
  // `TypeError: Failed to fetch`, whose English text means nothing to the
  // user. Name the failure in the application's own wording instead.
  if (isNetworkError(error)) return '网络连接失败，请检查网络后重试。';
  if (error instanceof Error && error.message) return error.message;
  return '操作失败，请稍后重试。';
}

function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  if (!(error instanceof Error)) return false;
  return /failed to fetch|networkerror|load failed|network request failed/i.test(
    error.message,
  );
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isPreviewableImage(file: DeliveryFile): boolean {
  return file.mimeType.startsWith('image/');
}

export function isPreviewablePdf(file: DeliveryFile): boolean {
  return file.mimeType === 'application/pdf' || file.ext === 'pdf';
}

export function isPreviewableText(file: DeliveryFile): boolean {
  return (
    file.mimeType.startsWith('text/') ||
    ['txt', 'md', 'markdown', 'json', 'csv', 'log'].includes(file.ext)
  );
}
