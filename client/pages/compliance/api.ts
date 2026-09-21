import {
  ApiClientError,
  resolveAppUrl,
  type ApiClient,
} from '@nocobase/app-client';

/**
 * Browser-side access to the application-owned compliance API.
 *
 * The server is the only place that decides permissions, so these helpers deliberately keep no
 * cached authorization state: every mutation returns the record the server recomputed.
 */

export type ComplianceRole =
  'procurement' | 'quality' | 'legal' | 'supplier_contact' | 'administrator';

export const COMPLIANCE_ROLES: readonly ComplianceRole[] = [
  'procurement',
  'quality',
  'legal',
  'supplier_contact',
  'administrator',
];

export const QUALIFICATION_TYPES: readonly string[] = [
  'business_license',
  'quality_certification',
  'environmental',
  'safety',
  'other',
];

export const FILE_CATEGORIES: readonly string[] = [
  'business_license',
  'quality_cert',
  'audit_photo',
  'contract_file',
  'bank_info',
  'rectification',
  'other',
];

export const SUPPLIER_STATUSES: readonly string[] = [
  'draft',
  'pending_review',
  'qualified',
  'rejected',
  'suspended',
];

export const CONTRACT_STATUSES: readonly string[] = [
  'active',
  'expired',
  'terminated',
];

export interface Membership {
  readonly organizationId: number | null;
  readonly role: ComplianceRole;
  readonly supplierId: number | null;
}

export interface AccessContext {
  readonly userId: string;
  readonly isAdmin: boolean;
  readonly memberships: readonly Membership[];
}

export interface Organization {
  readonly id: number;
  readonly name: string;
  readonly code: string;
  readonly description?: string | null;
}

export interface Member {
  readonly id: number;
  readonly userId: string;
  readonly role: ComplianceRole;
  readonly organizationId: number | null;
  readonly supplierId: number | null;
  readonly note?: string | null;
  readonly organizationName?: string | null;
  readonly userName?: string | null;
}

export interface ManagedUser {
  readonly id: string;
  readonly name?: string | null;
  readonly username?: string | null;
  readonly email?: string | null;
}

export interface SupplierCompliance {
  readonly eligible: boolean;
  readonly missing: readonly string[];
  readonly expired: readonly string[];
  readonly expiringSoon: readonly string[];
}

export interface Supplier {
  readonly id: number;
  readonly organizationId: number;
  readonly organizationName?: string | null;
  readonly name: string;
  readonly code: string;
  readonly category?: string | null;
  readonly contactName?: string | null;
  readonly contactEmail?: string | null;
  readonly contactPhone?: string | null;
  readonly status: string;
  readonly businessScope?: string | null;
  readonly notes?: string | null;
  readonly compliance: SupplierCompliance;
}

export interface Qualification {
  readonly id: number;
  readonly supplierId: number;
  readonly supplierName?: string | null;
  readonly organizationId: number;
  readonly organizationName?: string | null;
  readonly type: string;
  readonly certificateNo?: string | null;
  readonly issuer?: string | null;
  readonly issuedAt?: string | null;
  readonly expiresAt?: string | null;
  readonly status: string;
  readonly notes?: string | null;
  readonly effectiveStatus?: string;
}

export interface Review {
  readonly id: number;
  readonly supplierId: number;
  readonly supplierName?: string | null;
  readonly organizationId: number;
  readonly organizationName?: string | null;
  readonly reviewerId: string;
  readonly reviewerName?: string | null;
  readonly reviewYear: number;
  readonly decision: 'approved' | 'rejected';
  readonly reason?: string | null;
  readonly comments?: string | null;
  readonly reviewedAt?: string | null;
}

export interface Contract {
  readonly id: number;
  readonly organizationId: number;
  readonly organizationName?: string | null;
  readonly supplierId: number;
  readonly supplierName?: string | null;
  readonly contractNo: string;
  readonly title: string;
  readonly signedAt?: string | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly amount?: number | string | null;
  readonly currency?: string | null;
  readonly status: string;
  readonly legalNotes?: string | null;
}

export interface ComplianceFile {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly organizationId: number;
  readonly supplierId?: number | null;
  readonly contractId?: number | null;
  readonly category: string;
  readonly note?: string | null;
  readonly uploadedById?: string | null;
  readonly uploadedByName?: string | null;
  readonly createdAt?: string | null;
}

export interface DashboardData {
  readonly totals: {
    readonly suppliers: number;
    readonly qualified: number;
    readonly pendingReview: number;
    readonly rejected: number;
    readonly contracts: number;
    readonly activeContracts: number;
  };
  readonly risk: {
    readonly expiredQualifications: number;
    readonly expiringQualifications: number;
    readonly expiringContracts: number;
    readonly ineligibleQualifiedSuppliers: number;
  };
  readonly byStatus: Readonly<Record<string, number>>;
}

export interface RiskItem {
  readonly kind: string;
  readonly severity: 'high' | 'medium';
  readonly supplierId?: number;
  readonly supplierName?: string | null;
  readonly type?: string;
  readonly contractId?: number;
  readonly contractNo?: string;
  readonly date?: string;
  readonly missing?: readonly string[];
  readonly expired?: readonly string[];
}

export interface RisksData {
  readonly qualifications: readonly RiskItem[];
  readonly contracts: readonly RiskItem[];
  readonly eligibility: readonly RiskItem[];
}

/** An error already normalized for display, independent of transport. */
export interface NormalizedError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

const NETWORK_MESSAGE = 'Unable to reach the server.';

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof ApiClientError) {
    const payload = error.payload as
      { code?: unknown; message?: unknown } | undefined;
    return {
      status: error.status,
      code:
        typeof payload?.code === 'string'
          ? payload.code
          : (error.code ?? 'ERROR'),
      message:
        typeof payload?.message === 'string'
          ? payload.message
          : error.message || 'Request failed.',
    };
  }
  if (error instanceof Error) {
    return {
      status: 0,
      code: 'NETWORK',
      message: error.message || NETWORK_MESSAGE,
    };
  }
  return { status: 0, code: 'UNKNOWN', message: 'Request failed.' };
}

export function errorMessageKey(error: NormalizedError): string {
  switch (error.code) {
    case 'REASON_REQUIRED':
      return 'compliance.error.reasonRequired';
    case 'INELIGIBLE':
      return 'compliance.error.ineligible';
    case 'DUPLICATE':
      return 'compliance.error.duplicate';
    case 'FILE_TOO_LARGE':
      return 'compliance.error.fileTooLarge';
    case 'ASSOCIATION_REQUIRED':
      return 'compliance.error.associationRequired';
    default:
      if (error.status === 403) return 'compliance.error.forbidden';
      if (error.status === 404) return 'compliance.error.notFound';
      if (error.status === 401) return 'compliance.error.unauthenticated';
      return 'compliance.error.generic';
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}

/** The absolute application API base, resolved from the runtime mount path. */
export function apiBase(): string {
  return stripTrailingSlash(resolveAppUrl('/api'));
}

export function fileContentUrl(id: string): string {
  return `${apiBase()}/compliance/files/${encodeURIComponent(id)}/content`;
}

export function fileDownloadUrl(id: string): string {
  return `${apiBase()}/compliance/files/${encodeURIComponent(id)}/download`;
}

interface RequestInput {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly query?: Record<string, string | number | boolean | null | undefined>;
  readonly json?: unknown;
}

export async function complianceRequest<T>(
  api: ApiClient,
  path: string,
  input: RequestInput = {},
): Promise<T> {
  const response = await api.request<{ data: T }>({
    path: `/compliance${path}`,
    method: input.method,
    query: input.query,
    json: input.json,
  });
  return response.data;
}

/** Reads the raw file bytes so preview code can report 401/403/404 precisely. */
export async function fetchFileResponse(
  id: string,
  download = false,
): Promise<Response> {
  const response = await fetch(
    download ? fileDownloadUrl(id) : fileContentUrl(id),
    {
      credentials: 'include',
      headers: { Accept: '*/*' },
    },
  );
  return response;
}

/** Downloads an authorized file through a temporary object URL. */
export async function downloadFile(file: {
  id: string;
  filename: string;
}): Promise<void> {
  const response = await fetchFileResponse(file.id, true);
  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      { code?: string; message?: string } | undefined;
    throw new ApiClientError(payload?.message ?? 'Download failed.', {
      status: response.status,
      payload,
      code: payload?.code,
      method: 'GET',
      url: fileDownloadUrl(file.id),
    });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export interface UploadTarget {
  readonly supplierId?: number;
  readonly contractId?: number;
  readonly organizationId: number;
  readonly category: string;
  readonly note?: string;
}

export interface UploadCallbacks {
  readonly onProgress?: (loaded: number, total: number) => void;
  readonly signal?: AbortSignal;
}

/** Uploads through XMLHttpRequest so the UI can show real byte progress. */
export function uploadComplianceFile(
  file: File,
  target: UploadTarget,
  callbacks: UploadCallbacks = {},
): Promise<ComplianceFile[]> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    if (target.supplierId !== undefined)
      form.set('supplierId', String(target.supplierId));
    if (target.contractId !== undefined)
      form.set('contractId', String(target.contractId));
    form.set('organizationId', String(target.organizationId));
    form.set('category', target.category);
    if (target.note) form.set('note', target.note);
    form.set('files', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBase()}/compliance/files`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable)
        callbacks.onProgress?.(event.loaded, event.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = JSON.parse(xhr.responseText) as {
            data?: ComplianceFile[];
          };
          resolve(parsed.data ?? []);
        } catch {
          resolve([]);
        }
        return;
      }
      let payload: { code?: string; message?: string } | undefined;
      try {
        payload = JSON.parse(xhr.responseText) as {
          code?: string;
          message?: string;
        };
      } catch {
        payload = undefined;
      }
      reject(
        new ApiClientError(payload?.message ?? 'Upload failed.', {
          status: xhr.status,
          payload,
          code: payload?.code,
          method: 'POST',
          url: `${apiBase()}/compliance/files`,
        }),
      );
    });
    xhr.addEventListener('error', () => reject(new Error(NETWORK_MESSAGE)));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));
    callbacks.signal?.addEventListener('abort', () => xhr.abort(), {
      once: true,
    });
    xhr.send(form);
  });
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export function formatAmount(
  amount: number | string | null | undefined,
  currency?: string | null,
): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const numeric = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(numeric)) return String(amount);
  return `${currency ?? 'CNY'} ${numeric.toLocaleString()}`;
}
