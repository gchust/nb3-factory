import type { ApiClient } from '@nocobase/app-client';

export type FileKind = 'contract' | 'deliverable' | 'payment';

export interface DeliveryFile {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number | string;
  readonly createdAt: string;
  readonly uploadedById?: string | null;
  readonly uploadedByName?: string | null;
  readonly contentUrl: string;
  readonly fileKind: FileKind;
}

export interface Paged<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

export interface DeliveryVersion {
  readonly id: number;
  readonly taskId: number;
  readonly versionNo: number;
  readonly status: string;
  readonly note?: string | null;
  readonly submittedById?: string | null;
  readonly submittedByName?: string;
  readonly submittedAt?: string | null;
  readonly reviewerName?: string;
  readonly reviewedAt?: string | null;
  readonly reviewComment?: string | null;
  readonly files: readonly DeliveryFile[];
  readonly canAccept: boolean;
  readonly canWithdraw: boolean;
}

export interface DeliveryTask {
  readonly id: number;
  readonly milestoneId: number;
  readonly name: string;
  readonly status: string;
  readonly required: boolean;
  readonly assigneeId?: string | null;
  readonly assigneeName?: string;
  readonly currentVersion: number;
  readonly versions: readonly DeliveryVersion[];
  readonly latestVersion: DeliveryVersion | null;
  readonly canManage: boolean;
  readonly canAccept: boolean;
  readonly acceptorName?: string;
}

export interface DeliveryMilestone {
  readonly id: number;
  readonly projectId: number;
  readonly name: string;
  readonly seq: number;
  readonly dueDate: string;
  readonly ownerId?: string | null;
  readonly ownerName?: string;
  readonly acceptorId?: string | null;
  readonly acceptorName?: string;
  readonly amountCents: number;
  readonly status: string;
  readonly isOverdue: boolean;
  readonly canManage: boolean;
  readonly canMaintainTasks: boolean;
  readonly canAccept: boolean;
  readonly deliverable: DeliveryTask | null;
  readonly tasks: readonly DeliveryTask[];
  readonly versions: readonly DeliveryVersion[];
  readonly requiredTaskCount: number;
  readonly requiredTaskDoneCount: number;
  readonly receivable: {
    id: number;
    amountCents: number;
    receivedCents: number;
    status: string;
  } | null;
}

export interface DeliveryIssue {
  readonly id: number;
  readonly projectId: number;
  readonly milestoneId?: number | null;
  readonly taskId?: number | null;
  readonly title: string;
  readonly description?: string | null;
  readonly severity: string;
  readonly status: string;
  readonly ownerId?: string | null;
  readonly ownerName?: string;
  readonly resolution?: string | null;
  readonly createdById?: string | null;
  readonly createdByName?: string;
  readonly createdAt?: string | null;
  readonly projectNo?: string;
  readonly projectTitle?: string;
  readonly milestoneName?: string;
  readonly taskName?: string;
  readonly canManage: boolean;
}

export interface DeliveryContractDetail {
  readonly contract: Record<string, unknown> & {
    id: number;
    contractNo: string;
    title: string;
    customerId: number;
    amountCents: number;
    currency: string;
    startDate: string;
    endDate: string;
    managerId?: string | null;
    status: string;
    note?: string | null;
  };
  readonly customer: { id: number; name: string; code: string } | null;
  readonly contacts: readonly Record<string, unknown>[];
  readonly managerName: string;
  readonly members: readonly {
    id: number;
    userId: string;
    userName: string;
    memberRole: string;
  }[];
  readonly changes: readonly {
    id: number;
    changeType: string;
    summary: string;
    beforeValue?: string | null;
    afterValue?: string | null;
    createdByName?: string;
    createdAt: string;
  }[];
  readonly milestones: readonly DeliveryMilestone[];
  readonly files: readonly DeliveryFile[];
  readonly progress: {
    milestoneCount: number;
    acceptedMilestoneCount: number;
    allocatedCents: number;
    progressPercent: number;
  };
  readonly canManage: boolean;
  readonly canMaintainTasks: boolean;
  readonly canManageMoney: boolean;
  readonly canManageMembers: boolean;
}

export interface AcceptanceItem {
  readonly versionId: number;
  readonly versionNo: number;
  readonly submittedAt?: string | null;
  readonly submittedByName?: string;
  readonly note?: string | null;
  readonly taskId: number;
  readonly deliverableName: string;
  readonly milestoneId: number;
  readonly milestoneName: string;
  readonly projectId: number;
  readonly contractNo: string;
  readonly contractTitle: string;
  readonly acceptorName: string;
  readonly canAccept: boolean;
  readonly files: readonly DeliveryFile[];
}

export interface DashboardData {
  readonly cards: {
    pendingReview: number;
    overdueMilestones: number;
    activeContracts: number;
    outstandingCents: number;
    acceptedMilestones: number;
    totalMilestones: number;
    openIssues: number;
  };
  readonly pendingReview: readonly AcceptanceItem[];
  readonly overdueMilestones: readonly {
    id: number;
    name: string;
    dueDate: string;
    status: string;
    projectId: number;
    contractNo: string;
    amountCents: number;
  }[];
  readonly recentIssues: readonly DeliveryIssue[];
  readonly contracts: readonly {
    id: number;
    contractNo: string;
    title: string;
    status: string;
    endDate: string;
    amountCents: number;
    managerName: string;
    milestoneCount: number;
    acceptedMilestoneCount: number;
    progressPercent: number;
  }[];
}

export interface ReceivableRow {
  readonly id: number;
  readonly projectId: number;
  readonly milestoneId: number;
  readonly amountCents: number;
  readonly receivedCents: number;
  readonly outstandingCents: number;
  readonly status: string;
  readonly contractNo: string;
  readonly contractTitle: string;
  readonly milestoneName: string;
  readonly milestoneDueDate: string;
  readonly isOverdue: boolean;
  readonly confirmedAt?: string | null;
}

export interface PaymentRow {
  readonly id: number;
  readonly amountCents: number;
  readonly receivedAt: string;
  readonly method: string;
  readonly note?: string | null;
  readonly createdByName?: string;
  readonly files: readonly DeliveryFile[];
}

export interface ReceivableDetail {
  readonly receivable: ReceivableRow;
  readonly contract: { id: number; contractNo: string; title: string } | null;
  readonly milestone: { id: number; name: string; dueDate: string } | null;
  readonly payments: readonly PaymentRow[];
  readonly canManageMoney: boolean;
}

export class DeliveryApiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'DeliveryApiError';
    this.status = status;
    this.code = code;
  }
}

function toDeliveryError(error: unknown): never {
  const candidate = error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
    payload?: { code?: unknown; message?: unknown };
  };
  const status = typeof candidate?.status === 'number' ? candidate.status : 0;
  const rawCode = candidate?.code ?? candidate?.payload?.code;
  const code =
    typeof rawCode === 'string' && rawCode ? rawCode : 'REQUEST_FAILED';
  const message =
    typeof candidate?.payload?.message === 'string'
      ? candidate.payload.message
      : typeof candidate?.message === 'string'
        ? candidate.message
        : 'The request failed.';
  throw new DeliveryApiError(status, code, message);
}

export function createDeliveryApi(api: ApiClient) {
  async function request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      query?: Record<string, string | number | undefined>;
      json?: unknown;
    } = {},
  ): Promise<T> {
    try {
      const response = await api.request<{ data: T }>({
        path,
        method: options.method ?? 'GET',
        ...(options.query ? { query: options.query } : {}),
        ...(options.json === undefined ? {} : { json: options.json }),
      });
      return response.data;
    } catch (error) {
      return toDeliveryError(error);
    }
  }

  return {
    dashboard: () => request<DashboardData>('delivery/dashboard'),
    users: () =>
      request<readonly { id: string; name: string; username?: string }[]>(
        'delivery/users',
      ),
    customers: (
      query: { search?: string; page?: number; pageSize?: number } = {},
    ) =>
      request<
        Paged<{
          id: number;
          code: string;
          name: string;
          industry?: string | null;
          level?: string | null;
          note?: string | null;
        }>
      >('delivery/customers', { query }),
    createCustomer: (json: Record<string, unknown>) =>
      request<Record<string, unknown>>('delivery/customers', {
        method: 'POST',
        json,
      }),
    updateCustomer: (id: number, json: Record<string, unknown>) =>
      request<Record<string, unknown>>(`delivery/customers/${id}`, {
        method: 'PUT',
        json,
      }),
    contacts: (customerId?: number) =>
      request<readonly Record<string, unknown>[]>('delivery/contacts', {
        query: customerId ? { customerId } : {},
      }),
    contracts: (
      query: {
        search?: string;
        status?: string;
        page?: number;
        pageSize?: number;
      } = {},
    ) =>
      request<
        Paged<{
          id: number;
          contractNo: string;
          title: string;
          customerName: string;
          managerName: string;
          amountCents: number;
          currency: string;
          status: string;
          startDate: string;
          endDate: string;
          progressPercent: number;
          acceptedMilestoneCount: number;
          milestoneCount: number;
          isOverdue: boolean;
        }>
      >('delivery/projects', { query }),
    contract: (id: number) =>
      request<DeliveryContractDetail>(`delivery/projects/${id}`),
    createContract: (json: Record<string, unknown>) =>
      request<DeliveryContractDetail>('delivery/projects', {
        method: 'POST',
        json,
      }),
    updateContract: (id: number, json: Record<string, unknown>) =>
      request<DeliveryContractDetail>(`delivery/projects/${id}`, {
        method: 'PUT',
        json,
      }),
    changeContractStatus: (id: number, status: string) =>
      request<DeliveryContractDetail>(`delivery/projects/${id}/status`, {
        method: 'POST',
        json: { status },
      }),
    addContractMember: (id: number, json: Record<string, unknown>) =>
      request<DeliveryContractDetail>(`delivery/projects/${id}/members`, {
        method: 'POST',
        json,
      }),
    removeContractMember: (id: number, memberId: number) =>
      request<DeliveryContractDetail>(
        `delivery/projects/${id}/members/${memberId}`,
        {
          method: 'DELETE',
        },
      ),
    addContractChange: (id: number, json: Record<string, unknown>) =>
      request<DeliveryContractDetail>(`delivery/projects/${id}/changes`, {
        method: 'POST',
        json,
      }),
    linkContractFiles: (id: number, fileIds: readonly string[]) =>
      request<readonly DeliveryFile[]>(`delivery/projects/${id}/files`, {
        method: 'POST',
        json: { fileIds },
      }),
    createMilestone: (id: number, json: Record<string, unknown>) =>
      request<Record<string, unknown>>(`delivery/projects/${id}/milestones`, {
        method: 'POST',
        json,
      }),
    updateMilestone: (id: number, json: Record<string, unknown>) =>
      request<Record<string, unknown>>(`delivery/milestones/${id}`, {
        method: 'PUT',
        json,
      }),
    createDeliverable: (milestoneId: number, json: Record<string, unknown>) =>
      request<Record<string, unknown>>(
        `delivery/milestones/${milestoneId}/deliverables`,
        {
          method: 'POST',
          json,
        },
      ),
    updateTask: (taskId: number, json: Record<string, unknown>) =>
      request<Record<string, unknown>>(`delivery/tasks/${taskId}`, {
        method: 'PUT',
        json,
      }),
    issues: (
      query: {
        projectId?: number;
        status?: string;
        page?: number;
        pageSize?: number;
      } = {},
    ) => request<Paged<DeliveryIssue>>('delivery/issues', { query }),
    createIssue: (json: Record<string, unknown>) =>
      request<DeliveryIssue>('delivery/issues', { method: 'POST', json }),
    updateIssue: (id: number, json: Record<string, unknown>) =>
      request<DeliveryIssue>(`delivery/issues/${id}`, {
        method: 'PUT',
        json,
      }),
    submitVersion: (taskId: number, json: Record<string, unknown>) =>
      request<DeliveryVersion>(`delivery/tasks/${taskId}/versions`, {
        method: 'POST',
        json,
      }),
    versions: (taskId: number) =>
      request<readonly DeliveryVersion[]>(`delivery/tasks/${taskId}/versions`),
    approveVersion: (versionId: number, comment: string) =>
      request<Record<string, unknown>>(
        `delivery/versions/${versionId}/approve`,
        {
          method: 'POST',
          json: { comment },
        },
      ),
    returnVersion: (versionId: number, comment: string) =>
      request<Record<string, unknown>>(
        `delivery/versions/${versionId}/return`,
        {
          method: 'POST',
          json: { comment },
        },
      ),
    withdrawVersion: (versionId: number) =>
      request<Record<string, unknown>>(
        `delivery/versions/${versionId}/withdraw`,
        {
          method: 'POST',
        },
      ),
    acceptanceQueue: () =>
      request<readonly AcceptanceItem[]>('delivery/acceptance-queue'),
    receivables: (
      query: { status?: string; page?: number; pageSize?: number } = {},
    ) => request<Paged<ReceivableRow>>('delivery/settlements', { query }),
    receivable: (id: number) =>
      request<ReceivableDetail>(`delivery/settlements/${id}`),
    confirmReceivable: (milestoneId: number) =>
      request<Record<string, unknown>>(
        `delivery/milestones/${milestoneId}/receivable`,
        {
          method: 'POST',
        },
      ),
    registerPayment: (settlementId: number, json: Record<string, unknown>) =>
      request<ReceivableDetail>(
        `delivery/settlements/${settlementId}/payments`,
        {
          method: 'POST',
          json,
        },
      ),
    linkPaymentFiles: (paymentId: number, fileIds: readonly string[]) =>
      request<readonly DeliveryFile[]>(`delivery/payments/${paymentId}/files`, {
        method: 'POST',
        json: { fileIds },
      }),
    renameFile: (kind: FileKind, fileId: string, filename: string) =>
      request<readonly DeliveryFile[]>(`delivery/files/${kind}/${fileId}`, {
        method: 'PATCH',
        json: { filename },
      }),
    removeFile: (kind: FileKind, fileId: string) =>
      request<{ removed: boolean }>(`delivery/files/${kind}/${fileId}`, {
        method: 'DELETE',
      }),
  };
}

export type DeliveryApi = ReturnType<typeof createDeliveryApi>;
