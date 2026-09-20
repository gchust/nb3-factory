import type { ApiClient } from '@nocobase/app-client';
import { ApiClientError, resolveAppUrl } from '@nocobase/app-client';

/** Server DTOs for the repair module. Kept in step with `server/providers/repair-service.ts`. */

export type RepairRole =
  'admin' | 'dispatcher' | 'technician' | 'supervisor' | 'finance' | 'reporter';

export interface RepairCapabilities {
  viewAll: boolean;
  create: boolean;
  dispatch: boolean;
  work: boolean;
  accept: boolean;
  cancel: boolean;
  settle: boolean;
  stockIn: boolean;
  manageAssets: boolean;
}

export interface RepairSession {
  user: { userId: string; name: string; role: RepairRole };
  capabilities: RepairCapabilities;
}

export interface Ticket {
  id: number;
  ticketNo: string;
  title: string;
  buildingId: number;
  buildingName: string | null;
  roomId: number | null;
  roomNumber: string | null;
  equipmentId: number | null;
  equipmentName: string | null;
  location: string;
  faultType: string;
  priority: string;
  description: string;
  contactName: string;
  contactPhone: string;
  status: string;
  reporterId: string;
  reporterName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assignedAt: string | null;
  dueAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  faultCause: string | null;
  repairProcess: string | null;
  laborCost: number;
  materialCost: number;
  totalCost: number;
  reworkCount: number;
  cancelReason: string | null;
  acceptanceResult: string | null;
  acceptanceRemark: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  settledAt: string | null;
  overdue: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Attachment {
  linkId: number;
  fileId: string;
  category: string;
  note: string | null;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  uploadedById: string | null;
  uploadedByName: string | null;
  createdAt: string | null;
  contentUrl?: string;
}

export interface TicketMaterial {
  id: number;
  materialId: number;
  materialName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  cost: number;
  status: string;
  remark: string | null;
  requestedByName: string | null;
  returnedAt: string | null;
  createdAt: string | null;
}

export interface TicketEvent {
  id: number;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  remark: string | null;
  operatorName: string | null;
  createdAt: string | null;
}

export interface Settlement {
  id: number;
  settlementNo: string;
  ticketId: number;
  ticketNo: string;
  ticketTitle: string;
  buildingName: string | null;
  materialCost: number;
  laborCost: number;
  totalAmount: number;
  status: string;
  settledByName: string | null;
  remark: string | null;
  settledAt: string | null;
}

export interface TicketDetail extends Ticket {
  attachments: Attachment[];
  materials: TicketMaterial[];
  events: TicketEvent[];
  settlement: Settlement | null;
  capabilities: RepairCapabilities;
}

export interface Building {
  id: number;
  code: string;
  name: string;
  address: string | null;
  floors: number | null;
  manager: string | null;
  roomCount: number;
}

export interface Room {
  id: number;
  buildingId: number;
  buildingName: string | null;
  roomNumber: string;
  floor: number | null;
  occupant: string | null;
  phone: string | null;
  area: number;
}

export interface Equipment {
  id: number;
  code: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  status: string;
  buildingId: number | null;
  buildingName: string | null;
  roomId: number | null;
  roomNumber: string | null;
  manualFileId: string | null;
  repairCount: number;
}

export interface EquipmentDetail {
  equipment: Equipment;
  history: Ticket[];
  attachments: Attachment[];
}

export interface Material {
  id: number;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  unitPrice: number;
  stock: number;
  safetyStock: number;
  lowStock: boolean;
}

export interface Technician {
  userId: string;
  displayName: string;
  role: string;
}

export interface RepairMeta {
  buildings: Building[];
  rooms: Room[];
  equipment: Equipment[];
  materials: Material[];
  technicians: Technician[];
  faultTypes: string[];
}

export interface Dashboard {
  pendingDispatch: number;
  overdue: number;
  pendingAcceptance: number;
  inProgress: number;
  completedThisMonth: number;
  createdThisMonth: number;
  monthlyCompletionRate: number;
  monthlyRepairCost: number;
  statusBreakdown: { status: string; count: number }[];
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TicketFilters {
  buildingId?: number;
  status?: string;
  assigneeId?: string;
  priority?: string;
  keyword?: string;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
}

interface RequestInput {
  readonly path: string;
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly json?: Record<string, unknown>;
  readonly query?: Record<string, string | number | undefined>;
}

function cleanQuery(
  query: RequestInput['query'],
): Record<string, string | number> | undefined {
  if (!query) return undefined;
  const entries = Object.entries(query).filter(
    ([, value]) => value !== undefined && value !== '',
  ) as [string, string | number][];
  return entries.length ? Object.fromEntries(entries) : undefined;
}

async function data<T>(api: ApiClient, input: RequestInput): Promise<T> {
  const base = {
    path: input.path,
    method: input.method ?? ('GET' as const),
    query: cleanQuery(input.query),
  };
  const response = await api.request<{ data: T }>(
    input.json ? { ...base, json: input.json } : base,
  );
  return response.data;
}

export const repairApi = {
  session: (api: ApiClient) =>
    data<RepairSession>(api, { path: 'repair/session' }),
  meta: (api: ApiClient) => data<RepairMeta>(api, { path: 'repair/meta' }),
  dashboard: (api: ApiClient) =>
    data<Dashboard>(api, { path: 'repair/dashboard' }),
  tickets: (api: ApiClient, filters: TicketFilters) =>
    data<Paged<Ticket>>(api, {
      path: 'repair/tickets',
      query: {
        buildingId: filters.buildingId,
        status: filters.status,
        assigneeId: filters.assigneeId,
        priority: filters.priority,
        keyword: filters.keyword,
        overdueOnly: filters.overdueOnly ? 'true' : undefined,
        page: filters.page,
        pageSize: filters.pageSize,
      },
    }),
  ticket: (api: ApiClient, id: number) =>
    data<TicketDetail>(api, { path: `repair/tickets/${id}` }),
  createTicket: (api: ApiClient, values: Record<string, unknown>) =>
    data<{ id: number }>(api, {
      path: 'repair/tickets',
      method: 'POST',
      json: values,
    }),
  action: (
    api: ApiClient,
    id: number,
    action: string,
    values: Record<string, unknown> = {},
  ) =>
    data<unknown>(api, {
      path: `repair/tickets/${id}/${action}`,
      method: 'POST',
      json: values,
    }),
  returnMaterial: (
    api: ApiClient,
    usageId: number,
    values: Record<string, unknown>,
  ) =>
    data<{ alreadyReturned: boolean; stock: number }>(api, {
      path: `repair/ticket-materials/${usageId}/return`,
      method: 'POST',
      json: values,
    }),
  materials: (api: ApiClient) =>
    data<{ rows: Material[] }>(api, { path: 'repair/materials' }),
  stockIn: (api: ApiClient, id: number, values: Record<string, unknown>) =>
    data<{ stock: number }>(api, {
      path: `repair/materials/${id}/stock-in`,
      method: 'POST',
      json: values,
    }),
  buildings: (api: ApiClient) =>
    data<{ rows: Building[] }>(api, { path: 'repair/buildings' }),
  rooms: (api: ApiClient) =>
    data<{ rows: Room[] }>(api, { path: 'repair/rooms' }),
  equipment: (
    api: ApiClient,
    filters: { buildingId?: number; keyword?: string } = {},
  ) =>
    data<{ rows: Equipment[] }>(api, {
      path: 'repair/equipment',
      query: { buildingId: filters.buildingId, keyword: filters.keyword },
    }),
  equipmentDetail: (api: ApiClient, id: number) =>
    data<EquipmentDetail>(api, { path: `repair/equipment/${id}` }),
  settlements: (
    api: ApiClient,
    filters: { keyword?: string; page?: number } = {},
  ) =>
    data<Paged<Settlement>>(api, {
      path: 'repair/settlements',
      query: { keyword: filters.keyword, page: filters.page, pageSize: 20 },
    }),
  files: (
    api: ApiClient,
    filters: { ticketId?: number; keyword?: string; limit?: number } = {},
  ) =>
    data<{ rows: Attachment[] }>(api, {
      path: 'repair/files',
      query: {
        ticketId: filters.ticketId,
        keyword: filters.keyword,
        limit: filters.limit,
      },
    }),
  /**
   * Uploads through XMLHttpRequest so the form can report real byte progress and cancel an in-flight request.
   * The URL is resolved with `resolveAppUrl` so it keeps working when the application is mounted under a base path.
   */
  uploadTicketFiles: (
    _api: ApiClient,
    ticketId: number,
    input: {
      files: File[];
      category: string;
      note?: string;
      onProgress?: (loaded: number, total: number) => void;
      onUploading?: () => void;
      signal?: AbortSignal;
    },
  ) => uploadTicketFiles(ticketId, input),
  updateFile: (
    api: ApiClient,
    fileId: string,
    values: { filename?: string; note?: string },
  ) =>
    data<unknown>(api, {
      path: `repair/files/${fileId}`,
      method: 'PATCH',
      json: values,
    }),
  deleteFile: (api: ApiClient, fileId: string) =>
    data<unknown>(api, {
      path: `repair/files/${fileId}`,
      method: 'DELETE',
    }),
};

function buildUploadBody(
  files: readonly File[],
  category: string,
  note?: string,
): FormData {
  const body = new FormData();
  body.append('category', category);
  if (note) body.append('note', note);
  for (const file of files) body.append('files', file);
  return body;
}

function uploadTicketFiles(
  ticketId: number,
  input: {
    files: File[];
    category: string;
    note?: string;
    onProgress?: (loaded: number, total: number) => void;
    onUploading?: () => void;
    signal?: AbortSignal;
  },
): Promise<{ attachments: Attachment[] }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(
      'POST',
      resolveAppUrl(`/api/repair/tickets/${ticketId}/files`),
    );
    request.withCredentials = true;
    request.responseType = 'text';
    const abort = (): void => request.abort();
    input.signal?.addEventListener('abort', abort);
    const settle = (): void =>
      input.signal?.removeEventListener('abort', abort);
    input.onUploading?.();
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) input.onProgress?.(event.loaded, event.total);
    });
    request.addEventListener('error', () => {
      settle();
      reject(new Error('NETWORK'));
    });
    request.addEventListener('abort', () => {
      settle();
      reject(new DOMException('Upload cancelled', 'AbortError'));
    });
    request.addEventListener('load', () => {
      settle();
      let payload: unknown;
      try {
        payload = JSON.parse(request.responseText) as unknown;
      } catch {
        reject(new Error('NETWORK'));
        return;
      }
      if (request.status >= 200 && request.status < 300) {
        resolve(payload as { attachments: Attachment[] });
        return;
      }
      const body = payload as
        | {
            code?: string;
            message?: string;
            data?: { code?: string; message?: string };
          }
        | undefined;
      const code = body?.code ?? body?.data?.code ?? '';
      const message = body?.message ?? body?.data?.message ?? 'Request failed';
      reject(
        new ApiClientError(message, {
          status: request.status,
          code,
          method: 'POST',
          url: request.responseURL || 'upload',
        }),
      );
    });
    request.send(buildUploadBody(input.files, input.category, input.note));
  });
}

export const TICKET_STATUS_KEYS = [
  'pending_dispatch',
  'assigned',
  'in_progress',
  'pending_acceptance',
  'rework',
  'completed',
  'cancelled',
] as const;

export const PRIORITY_KEYS = ['low', 'normal', 'high', 'urgent'] as const;

export const ATTACHMENT_CATEGORY_KEYS = [
  'fault',
  'before',
  'after',
  'report',
  'receipt',
] as const;

/** Map a failed request to a translation key so the UI can explain what happened. */
export function errorKey(error: unknown): { key: string; fallback: string } {
  if (error instanceof ApiClientError) {
    const code = error.code ?? '';
    const byCode: Record<string, { key: string; fallback: string }> = {
      INSUFFICIENT_STOCK: {
        key: 'repair.errors.insufficientStock',
        fallback: 'Not enough stock for this material.',
      },
      SETTLEMENT_EXISTS: {
        key: 'repair.errors.settlementExists',
        fallback: 'This ticket has already been settled.',
      },
      NOT_SETTLEABLE: {
        key: 'repair.errors.notSettleable',
        fallback: 'Only an accepted ticket can be settled.',
      },
      MISSING_EVIDENCE: {
        key: 'repair.errors.missingEvidence',
        fallback:
          'A repair process, an after-repair photo and a report are required.',
      },
      INVALID_TRANSITION: {
        key: 'repair.errors.invalidTransition',
        fallback: 'The ticket is not in a state that allows this action.',
      },
      TOO_MANY_FILES: {
        key: 'repair.errors.tooManyFiles',
        fallback: 'At most 5 files can be uploaded at once.',
      },
      FILE_TOO_LARGE: {
        key: 'repair.errors.fileTooLarge',
        fallback: 'A file exceeds the 20 MB limit.',
      },
      FORBIDDEN: {
        key: 'repair.errors.forbidden',
        fallback: 'You are not allowed to do that.',
      },
      UNAUTHORIZED: {
        key: 'repair.errors.unauthorized',
        fallback: 'Your session has expired. Sign in again.',
      },
      NOT_FOUND: {
        key: 'repair.errors.notFound',
        fallback: 'The record no longer exists.',
      },
      VALIDATION: {
        key: 'repair.errors.validation',
        fallback: 'Please check the submitted values.',
      },
    };
    if (byCode[code]) return byCode[code];
    if (error.status === 401) return byCode.UNAUTHORIZED;
    if (error.status === 403) return byCode.FORBIDDEN;
    if (error.status === 404) return byCode.NOT_FOUND;
  }
  return {
    key: 'repair.errors.requestFailed',
    fallback: 'The request failed. Please try again.',
  };
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatMoney(value: number | null | undefined): string {
  return `¥${(Number(value) || 0).toFixed(2)}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
