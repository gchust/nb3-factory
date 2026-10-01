import { ApiClientError, type ApiClient } from '@nocobase/app-client';

import type { Material, MaterialChanges } from './types.js';

/**
 * The page's calls to the application's own `/api/materials` endpoints. They
 * take the client as an argument because a plain module cannot call a hook; the
 * components pass in the one `useApiClient()` returned.
 */

export async function listMaterials(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<Material[]> {
  const { data } = await api.request<{ data: Material[] }>({
    path: 'materials',
    signal,
  });
  return Array.isArray(data) ? data : [];
}

export async function getMaterial(
  api: ApiClient,
  id: string,
  signal?: AbortSignal,
): Promise<Material | undefined> {
  try {
    const { data } = await api.request<{ data: Material }>({
      path: `materials/${encodeURIComponent(id)}`,
      signal,
    });
    return data;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      return undefined;
    }
    throw error;
  }
}

export async function createMaterial(
  api: ApiClient,
  changes: MaterialChanges,
): Promise<Material> {
  const { data } = await api.request<{ data: Material }, MaterialChanges>({
    path: 'materials',
    method: 'POST',
    json: changes,
  });
  return data;
}

export async function updateMaterial(
  api: ApiClient,
  id: string,
  changes: MaterialChanges,
): Promise<Material | undefined> {
  try {
    const { data } = await api.request<{ data: Material }, MaterialChanges>({
      path: `materials/${encodeURIComponent(id)}`,
      method: 'PATCH',
      json: changes,
    });
    return data;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      return undefined;
    }
    throw error;
  }
}

export async function deleteMaterial(
  api: ApiClient,
  id: string,
): Promise<void> {
  await api.request<void>({
    path: `materials/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}
