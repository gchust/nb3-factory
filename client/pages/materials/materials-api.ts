import type { ApiClient } from '@nocobase/app-client';

import type {
  ManagedUserOption,
  ManagedUserPage,
  MaterialDetail,
  MaterialInput,
  MaterialListResult,
  MaterialShare,
} from './types.js';

/**
 * The document library endpoints. Plain functions take the client in, so the same request is written once and shared
 * by the list, the detail page and their dialogs.
 */

export async function fetchMaterials(
  api: ApiClient,
  q: string | undefined,
  signal?: AbortSignal,
): Promise<MaterialListResult> {
  return api.request<MaterialListResult>({
    path: 'materials',
    query: { q },
    signal,
  });
}

export async function fetchMaterial(
  api: ApiClient,
  id: string,
  signal?: AbortSignal,
): Promise<MaterialDetail> {
  const { data } = await api.request<{ data: MaterialDetail }>({
    path: `materials/${encodeURIComponent(id)}`,
    signal,
  });
  return data;
}

export async function createMaterial(
  api: ApiClient,
  input: MaterialInput,
): Promise<MaterialDetail> {
  const { data } = await api.request<{ data: MaterialDetail }, MaterialInput>({
    path: 'materials',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateMaterial(
  api: ApiClient,
  id: string,
  input: MaterialInput,
): Promise<MaterialDetail> {
  const { data } = await api.request<{ data: MaterialDetail }, MaterialInput>({
    path: `materials/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
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

export async function addMaterialShare(
  api: ApiClient,
  id: string,
  userId: string,
): Promise<MaterialShare> {
  const { data } = await api.request<
    { data: MaterialShare },
    { userId: string }
  >({
    path: `materials/${encodeURIComponent(id)}/shares`,
    method: 'POST',
    json: { userId },
  });
  return data;
}

export async function removeMaterialShare(
  api: ApiClient,
  id: string,
  userId: string,
): Promise<void> {
  await api.request<void>({
    path: `materials/${encodeURIComponent(id)}/shares/${encodeURIComponent(userId)}`,
    method: 'DELETE',
  });
}

/** Enabled accounts an administrator may open a document to. The Users plugin owns this endpoint. */
export async function fetchEnabledUsers(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<readonly ManagedUserOption[]> {
  const page = await api.request<ManagedUserPage>({
    path: 'users',
    query: { status: 'enabled', page: 1, pageSize: 100 },
    signal,
  });
  return page.data;
}
