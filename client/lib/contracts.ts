import { resolveAppUrl, type ApiClient } from '@nocobase/app-client';

export type ContractType = 'sale' | 'purchase' | 'service' | 'lease';
export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated';

export interface Contract {
  readonly id: string;
  readonly contractNo: string;
  readonly name: string;
  readonly counterparty: string;
  readonly type: ContractType;
  readonly signedDate: string | null;
  readonly effectiveDate: string | null;
  readonly expiryDate: string | null;
  readonly amount: number;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly createdById: string;
  readonly status: ContractStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContractVersion {
  readonly id: string;
  readonly contractId: string;
  readonly versionNo: string;
  readonly description: string | null;
  readonly uploadedAt: string;
  readonly uploadedById: string;
  readonly uploadedByName: string | null;
}

export interface ContractAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly contractId: string | null;
  readonly versionId: string | null;
  readonly uploadedById: string | null;
  readonly uploadedByName: string | null;
  readonly createdAt: string;
}

export interface ContractDetail {
  readonly contract: Contract;
  readonly capabilities: {
    readonly canDownload: boolean;
    readonly canManage: boolean;
  };
  readonly versions: readonly {
    readonly version: ContractVersion;
    readonly attachments: readonly ContractAttachment[];
  }[];
  readonly unassigned: readonly ContractAttachment[];
}

export interface ContractCapabilities {
  readonly canCreate: boolean;
  readonly upload: {
    readonly allowedExtensions: readonly string[];
    readonly maxBytes: number;
  };
}

export interface StatisticBucket {
  readonly key: string;
  readonly count: number;
  readonly amount: number;
}

export interface ContractStatistics {
  readonly byType: readonly StatisticBucket[];
  readonly byStatus: readonly StatisticBucket[];
}

export interface ContractListFilters {
  readonly type?: string;
  readonly status?: string;
  readonly expiringDays?: number;
  readonly search?: string;
}

export interface ContractInput {
  readonly contractNo: string;
  readonly name: string;
  readonly counterparty: string;
  readonly type: string;
  readonly signedDate?: string | null;
  readonly effectiveDate?: string | null;
  readonly expiryDate?: string | null;
  readonly amount?: number;
  readonly status: string;
}

export async function fetchCapabilities(
  api: ApiClient,
): Promise<ContractCapabilities> {
  const response = await api.request<{ data: ContractCapabilities }>({
    path: 'contracts/capabilities',
  });
  return response.data;
}

export async function fetchContracts(
  api: ApiClient,
  filters: ContractListFilters,
): Promise<Contract[]> {
  const response = await api.request<{ data: Contract[] }>({
    path: 'contracts',
    query: {
      type: filters.type,
      status: filters.status,
      search: filters.search,
      expiringDays: filters.expiringDays,
    },
  });
  return response.data;
}

export async function fetchContract(
  api: ApiClient,
  id: string,
): Promise<ContractDetail> {
  const response = await api.request<{ data: ContractDetail }>({
    path: `contracts/${encodeURIComponent(id)}`,
  });
  return response.data;
}

export async function fetchStatistics(
  api: ApiClient,
): Promise<ContractStatistics> {
  const response = await api.request<{ data: ContractStatistics }>({
    path: 'contracts/stats',
  });
  return response.data;
}

export async function createContract(
  api: ApiClient,
  input: ContractInput,
): Promise<string> {
  const response = await api.request<{ data: { id: string } }, ContractInput>({
    path: 'contracts',
    method: 'POST',
    json: input,
  });
  return response.data.id;
}

export async function updateContract(
  api: ApiClient,
  id: string,
  input: Partial<ContractInput>,
): Promise<void> {
  await api.request<{ data: { updated: number } }, Partial<ContractInput>>({
    path: `contracts/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: input,
  });
}

export async function createVersion(
  api: ApiClient,
  contractId: string,
  input: { readonly versionNo: string; readonly description?: string },
): Promise<string> {
  const response = await api.request<
    { data: { id: string } },
    { versionNo: string; description?: string }
  >({
    path: `contracts/${encodeURIComponent(contractId)}/versions`,
    method: 'POST',
    json: input,
  });
  return response.data.id;
}

export async function uploadAttachment(
  api: ApiClient,
  contractId: string,
  file: File,
  versionId?: string,
): Promise<ContractAttachment> {
  const body = new FormData();
  body.set('file', file);
  if (versionId) body.set('versionId', versionId);
  const response = await api.request<{ data: ContractAttachment }>({
    path: `contracts/${encodeURIComponent(contractId)}/attachments`,
    method: 'POST',
    body,
  });
  return response.data;
}

export function attachmentDownloadUrl(
  contractId: string,
  attachmentId: string,
): string {
  return resolveAppUrl(
    `/api/contracts/${encodeURIComponent(contractId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
  );
}

/** Error code the server returned, when the failure came from an API response. */
export function apiErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}
