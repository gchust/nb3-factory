import type { ApiClient } from '@nocobase/app-client';

import type {
  Material,
  MaterialCreateInput,
  MaterialList,
  MaterialUpdateInput,
} from './types.js';

/**
 * The project-material endpoints. They are plain functions because a plain
 * function cannot call a hook: the caller passes the client it got from
 * `useApiClient()`. Every path is relative to the API base URL, so none of them
 * carries `/api` or the deployment base path.
 */

export async function listMaterials(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<MaterialList> {
  return api.request<MaterialList>({ path: 'projectMaterials', signal });
}

export async function fetchMaterial(
  api: ApiClient,
  id: string,
  signal?: AbortSignal,
): Promise<Material> {
  const { data } = await api.request<{ data: Material }>({
    path: `projectMaterials/${encodeURIComponent(id)}`,
    signal,
  });
  return data;
}

export async function createMaterial(
  api: ApiClient,
  input: MaterialCreateInput,
): Promise<Material> {
  const { data } = await api.request<{ data: Material }, MaterialCreateInput>({
    path: 'projectMaterials',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateMaterial(
  api: ApiClient,
  id: string,
  input: MaterialUpdateInput,
): Promise<Material> {
  const { data } = await api.request<{ data: Material }, MaterialUpdateInput>({
    path: `projectMaterials/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}
