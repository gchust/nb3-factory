import { ApiClientError, type ApiClient } from '@nocobase/app-client';

import type { ProjectMaterial } from './types.js';

/** What creating or updating a material sends. `fileIds` is the full set of attachments it keeps. */
export interface MaterialInput {
  readonly title?: string;
  readonly fileIds?: readonly string[];
}

export async function listMaterials(
  api: ApiClient,
): Promise<ProjectMaterial[]> {
  const { data } = await api.request<{ data: ProjectMaterial[] }>({
    path: '/projectMaterials',
  });
  return data;
}

/** The material, or `undefined` when it does not exist or does not belong to this user. */
export async function findMaterial(
  api: ApiClient,
  id: number,
): Promise<ProjectMaterial | undefined> {
  try {
    const { data } = await api.request<{ data: ProjectMaterial }>({
      path: `/projectMaterials/${id}`,
    });
    return data;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404)
      return undefined;
    throw error;
  }
}

export async function createMaterial(
  api: ApiClient,
  input: MaterialInput & { readonly title: string },
): Promise<ProjectMaterial> {
  const { data } = await api.request<{ data: ProjectMaterial }>({
    path: '/projectMaterials',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateMaterial(
  api: ApiClient,
  id: number,
  input: MaterialInput,
): Promise<ProjectMaterial> {
  const { data } = await api.request<{ data: ProjectMaterial }>({
    path: `/projectMaterials/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}
