import type { ApiClient } from '@nocobase/app-client';

export type WorkOrderStatus =
  'pending' | 'in_production' | 'completed' | 'closed';

export type DefectReason =
  | 'size_deviation'
  | 'appearance_defect'
  | 'material_issue'
  | 'equipment_failure';

export type DefectDisposition = 'rework' | 'scrap';

export interface Product {
  id: number;
  code: string;
  name: string;
  specification: string | null;
  unit: string;
  standardMinutes: number;
}

export interface Team {
  id: number;
  code: string;
  name: string;
}

export interface WorkOrderSummary {
  id: number;
  code: string;
  productId: number;
  productName: string | null;
  productUnit: string;
  teamId: number;
  teamName: string | null;
  plannedQuantity: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  status: WorkOrderStatus;
  createdByName: string | null;
  createdAt: string | null;
  reportedQuantity: number;
  qualifiedQuantity: number;
  defectQuantity: number;
  completion: number;
}

export interface ProcessProgress {
  id: number;
  name: string;
  sequence: number;
  plannedQuantity: number;
  reportedQuantity: number;
  qualifiedQuantity: number;
  defectQuantity: number;
  remainingQuantity: number;
  completion: number;
}

export interface WorkReport {
  id: number;
  processId: number;
  processName: string | null;
  quantity: number;
  qualifiedQuantity: number;
  defectQuantity: number;
  hours: number;
  reporterName: string | null;
  reportedAt: string | null;
  registeredDefectQuantity: number;
}

export interface DefectRecord {
  id: number;
  workOrderId: number;
  workOrderCode?: string | null;
  productName?: string | null;
  teamName?: string | null;
  workReportId?: number;
  processId: number;
  processName: string | null;
  quantity: number;
  reason: DefectReason;
  disposition: DefectDisposition;
  recordedByName: string | null;
  createdAt: string | null;
}

export interface WorkOrderDetail extends WorkOrderSummary {
  processes: ProcessProgress[];
  reports: WorkReport[];
  defects: DefectRecord[];
}

export interface ActorCapabilities {
  isAdministrator: boolean;
  isSupervisor: boolean;
  isTeamLeader: boolean;
  isInspector: boolean;
  canManageWorkOrders: boolean;
  canReport: boolean;
  canManageDefects: boolean;
  canReadAllWorkOrders: boolean;
}

export interface ActorInfo {
  userId: string;
  name: string;
  roles: string[];
  teamId: number | null;
  teamName: string | null;
  capabilities: ActorCapabilities;
}

export interface StatisticsGroup {
  teamId?: number;
  teamName?: string | null;
  productId?: number;
  productName?: string | null;
  qualifiedQuantity: number;
  defectQuantity: number;
  defectRate: number;
  reportCount: number;
}

export interface Statistics {
  byTeam: StatisticsGroup[];
  byProduct: StatisticsGroup[];
  inProductionCount: number;
  totals: {
    reportedQuantity: number;
    qualifiedQuantity: number;
    defectQuantity: number;
    defectRate: number;
  };
}

export interface ApiFailure {
  code: string;
  message: string;
  status: number;
}

export class ProductionApiError extends Error {
  public readonly code: string;
  public readonly status: number;

  public constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = 'ProductionApiError';
    this.code = failure.code;
    this.status = failure.status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeError(error: unknown): ProductionApiError {
  if (error instanceof ProductionApiError) return error;
  if (isRecord(error)) {
    const status = toNumber(error.status) || 0;
    const payload = isRecord(error.payload) ? error.payload : undefined;
    const nested =
      payload && isRecord(payload.error) ? payload.error : undefined;
    if (nested) {
      const code = toText(nested.code) ?? 'UNKNOWN';
      return new ProductionApiError({
        code,
        message: toText(nested.message) ?? code,
        status,
      });
    }
    if (typeof error.message === 'string') {
      return new ProductionApiError({
        code: 'UNKNOWN',
        message: error.message,
        status,
      });
    }
  }
  return new ProductionApiError({
    code: 'UNKNOWN',
    message: 'Request failed',
    status: 0,
  });
}

async function request<T>(
  api: ApiClient,
  options: Parameters<ApiClient['request']>[0],
): Promise<T> {
  try {
    const response = await api.request<{ data: T }>(options);
    return response.data;
  } catch (error) {
    throw normalizeError(error);
  }
}

export interface RegistrationOptions {
  roles: string[];
  teams: Team[];
}

export interface RegisterInput {
  name: string;
  username: string;
  email: string;
  password: string;
  role: string;
  teamId?: number | null;
}

export const staffApi = {
  registrationOptions: (api: ApiClient) =>
    request<RegistrationOptions>(api, { path: 'staff/registration-options' }),
  register: (api: ApiClient, input: RegisterInput) =>
    request<{ registered: boolean; role: string }>(api, {
      path: 'staff/register',
      method: 'POST',
      json: input,
    }),
};

export const productionApi = {
  me: (api: ApiClient) => request<ActorInfo>(api, { path: 'production/me' }),
  products: (api: ApiClient) =>
    request<Product[]>(api, { path: 'production/products' }),
  createProduct: (
    api: ApiClient,
    input: {
      code: string;
      name: string;
      specification?: string | null;
      unit?: string;
      standardMinutes: number;
    },
  ) =>
    request<{ id: number }>(api, {
      path: 'production/products',
      method: 'POST',
      json: input,
    }),
  teams: (api: ApiClient) => request<Team[]>(api, { path: 'production/teams' }),
  workOrders: (api: ApiClient) =>
    request<WorkOrderSummary[]>(api, { path: 'production/work-orders' }),
  workOrder: (api: ApiClient, id: number) =>
    request<WorkOrderDetail>(api, { path: `production/work-orders/${id}` }),
  createWorkOrder: (
    api: ApiClient,
    input: {
      code?: string;
      productId: number;
      plannedQuantity: number;
      plannedStartDate?: string | null;
      plannedEndDate?: string | null;
      teamId: number;
      processes: { name: string; plannedQuantity: number }[];
    },
  ) =>
    request<{ id: number; code: string }>(api, {
      path: 'production/work-orders',
      method: 'POST',
      json: input,
    }),
  updateWorkOrderStatus: (
    api: ApiClient,
    id: number,
    status: WorkOrderStatus,
  ) =>
    request<{ updated: boolean }>(api, {
      path: `production/work-orders/${id}/status`,
      method: 'PATCH',
      json: { status },
    }),
  createReport: (
    api: ApiClient,
    workOrderId: number,
    input: {
      processId: number;
      quantity: number;
      qualifiedQuantity: number;
      defectQuantity: number;
    },
  ) =>
    request<WorkReport>(api, {
      path: `production/work-orders/${workOrderId}/reports`,
      method: 'POST',
      json: input,
    }),
  createDefect: (
    api: ApiClient,
    workOrderId: number,
    input: {
      workReportId: number;
      quantity: number;
      reason: DefectReason;
      disposition: DefectDisposition;
    },
  ) =>
    request<DefectRecord>(api, {
      path: `production/work-orders/${workOrderId}/defects`,
      method: 'POST',
      json: input,
    }),
  defects: (api: ApiClient) =>
    request<DefectRecord[]>(api, { path: 'production/defects' }),
  statistics: (api: ApiClient) =>
    request<Statistics>(api, { path: 'production/statistics' }),
};

/** 本次工时 = 报工数量 × 标准工时 ÷ 60，保留一位小数。 Mirrors the server calculation for live previews. */
export function calculateHours(
  quantity: number,
  standardMinutes: number,
): number {
  return Math.round(((quantity * standardMinutes) / 60) * 10) / 10;
}

export function formatDefectRate(rate: number): string {
  return `${rate.toFixed(1)}%`;
}
