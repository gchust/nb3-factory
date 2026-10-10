import type { ApiClient } from '@nocobase/app-client';

import type { Material, MaterialList } from './types.js';

/**
 * The application's project-materials endpoints.
 *
 * Plain functions cannot call hooks, so each one receives the application's
 * HTTP client from its caller. Ids are always encoded, and no path carries the
 * `/api` prefix or the deployment base path: the client already knows both.
 */

const RESOURCE = 'projectMaterials';

export interface MaterialWrite {
  readonly title: string;
  /** The complete set of attachments; a file left out is detached on save. */
  readonly fileIds: readonly string[];
}

export async function fetchMaterials(
  api: ApiClient,
  options: {
    readonly page: number;
    readonly pageSize: number;
    readonly signal?: AbortSignal;
  },
): Promise<MaterialList> {
  return api.request<MaterialList>({
    path: RESOURCE,
    query: { page: options.page, pageSize: options.pageSize },
    signal: options.signal,
  });
}

export async function fetchMaterial(
  api: ApiClient,
  materialId: string,
  signal?: AbortSignal,
): Promise<Material> {
  const { data } = await api.request<{ data: Material }>({
    path: `${RESOURCE}/${encodeURIComponent(materialId)}`,
    signal,
  });
  return data;
}

export async function createMaterial(
  api: ApiClient,
  input: MaterialWrite,
): Promise<Material> {
  const { data } = await api.request<{ data: Material }, MaterialWrite>({
    path: RESOURCE,
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateMaterial(
  api: ApiClient,
  materialId: string,
  input: MaterialWrite,
): Promise<Material> {
  const { data } = await api.request<{ data: Material }, MaterialWrite>({
    path: `${RESOURCE}/${encodeURIComponent(materialId)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function deleteMaterial(
  api: ApiClient,
  materialId: string,
): Promise<void> {
  await api.request<void>({
    path: `${RESOURCE}/${encodeURIComponent(materialId)}`,
    method: 'DELETE',
  });
}
