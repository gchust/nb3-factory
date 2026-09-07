import type { AppClient } from '@nocobase/app-client';

import type {
  Asset,
  AssetInput,
  AssetListFilters,
  AssetRecord,
  Employee,
  RecordListFilters,
} from './asset-types.js';

interface ListResponse<T> {
  data: T;
}

function buildQuery(filters: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function listAssets(
  client: AppClient,
  filters: AssetListFilters,
): Promise<Asset[]> {
  return client
    .request<ListResponse<Asset[]>>(
      `assets${buildQuery({
        type: filters.type,
        status: filters.status,
        search: filters.search,
      })}`,
    )
    .then((response) => response.data);
}

export function getAsset(client: AppClient, id: number): Promise<Asset> {
  return client
    .request<ListResponse<Asset>>(`assets/${id}`)
    .then((response) => response.data);
}

export function createAsset(
  client: AppClient,
  input: AssetInput,
): Promise<Asset> {
  return client
    .request<ListResponse<Asset>>('assets', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    .then((response) => response.data);
}

export function updateAsset(
  client: AppClient,
  id: number,
  input: Partial<AssetInput>,
): Promise<Asset> {
  return client
    .request<ListResponse<Asset>>(`assets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
    .then((response) => response.data);
}

export function deleteAsset(client: AppClient, id: number): Promise<void> {
  return client
    .request<ListResponse<{ id: number }>>(`assets/${id}`, {
      method: 'DELETE',
    })
    .then(() => undefined);
}

export function claimAsset(
  client: AppClient,
  id: number,
  employeeId: number,
  remark: string | null,
): Promise<Asset> {
  return client
    .request<ListResponse<Asset>>(`assets/${id}/claim`, {
      method: 'POST',
      body: JSON.stringify({ employeeId, remark }),
    })
    .then((response) => response.data);
}

export function returnAsset(
  client: AppClient,
  id: number,
  remark: string | null,
): Promise<Asset> {
  return client
    .request<ListResponse<Asset>>(`assets/${id}/return`, {
      method: 'POST',
      body: JSON.stringify({ remark }),
    })
    .then((response) => response.data);
}

export function listRecords(
  client: AppClient,
  filters: RecordListFilters,
): Promise<AssetRecord[]> {
  return client
    .request<ListResponse<AssetRecord[]>>(
      `assets/records${buildQuery({
        status: filters.status,
        search: filters.search,
        assetId: filters.assetId,
      })}`,
    )
    .then((response) => response.data);
}

export function listEmployees(client: AppClient): Promise<Employee[]> {
  return client
    .request<ListResponse<Employee[]>>('assets/employees')
    .then((response) => response.data);
}
