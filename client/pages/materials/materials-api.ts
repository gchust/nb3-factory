import type { ApiClient } from '@nocobase/app-client';

import type {
  Material,
  MaterialContent,
  MaterialResponse,
  MaterialsListResponse,
} from './types.js';

/**
 * The list the caller may read. The server filters it by the caller's own Policy, so a colleague only ever receives the
 * unrestricted materials — this page never has to hide anything itself.
 */
export function fetchMaterials(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<MaterialsListResponse> {
  return api.request<MaterialsListResponse>({
    path: 'materials',
    query: { limit: 200 },
    signal,
  });
}

export async function fetchMaterial(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<Material> {
  const { data } = await api.request<MaterialResponse>({
    path: `materials/${id}`,
    signal,
  });
  return data;
}

export async function createMaterial(
  api: ApiClient,
  content: MaterialContent,
): Promise<Material> {
  const { data } = await api.request<MaterialResponse, MaterialContent>({
    path: 'materials',
    method: 'POST',
    json: content,
  });
  return data;
}

export async function updateMaterial(
  api: ApiClient,
  id: number,
  content: MaterialContent,
): Promise<Material> {
  const { data } = await api.request<MaterialResponse, MaterialContent>({
    path: `materials/${id}`,
    method: 'PATCH',
    json: content,
  });
  return data;
}
