import { useApiClient, type ApiClient } from '@nocobase/app-client';
import type { ClientFileRepository } from '@nocobase/app-plugin-file/client';
import { useMemo } from 'react';

import type {
  ProjectMaterial,
  ProjectMaterialAttachment,
  ProjectMaterialInput,
} from './types.js';

interface UploadResponse {
  readonly data: {
    readonly record: ProjectMaterialAttachment;
    readonly createdTargets?: readonly unknown[];
  };
}

/**
 * The upload half of the File UI components, pointed at this feature's own
 * endpoint. `@nocobase/app-plugin-file`'s `ClientFileRepository` describes a
 * full CRUD repository, but `FileUploadField` only ever calls `uploadOne` (and
 * `deleteOne` when `removeOnDelete` is set, which this feature never does), so
 * a partial object cast to the interface is enough and needs no invented
 * collection route.
 */
export function createAttachmentRepository(
  api: ApiClient,
): ClientFileRepository {
  const repository = {
    async uploadOne(
      input: { readonly file: File },
      options?: { readonly signal?: AbortSignal },
    ): Promise<{ record: ProjectMaterialAttachment }> {
      const form = new FormData();
      form.append('file', input.file);
      const response = await api.request<UploadResponse>({
        path: 'projectMaterialAttachments/upload',
        method: 'POST',
        body: form,
        signal: options?.signal,
      });
      return { record: response.data.record };
    },
  };

  return repository as unknown as ClientFileRepository;
}

/** One repository per `ApiClient`, stable across renders so uploads are not restarted. */
export function useAttachmentRepository(): ClientFileRepository {
  const api = useApiClient();
  return useMemo(() => createAttachmentRepository(api), [api]);
}

export async function fetchMaterials(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<ProjectMaterial[]> {
  const result = await api.request<{ data: ProjectMaterial[] }>({
    path: 'projectMaterials',
    signal,
  });
  return result.data;
}

export async function fetchMaterial(
  api: ApiClient,
  materialId: string,
  signal?: AbortSignal,
): Promise<ProjectMaterial> {
  const result = await api.request<{ data: ProjectMaterial }>({
    path: `projectMaterials/${encodeURIComponent(materialId)}`,
    signal,
  });
  return result.data;
}

export async function createMaterial(
  api: ApiClient,
  input: ProjectMaterialInput,
): Promise<ProjectMaterial> {
  const result = await api.request<
    { data: ProjectMaterial },
    ProjectMaterialInput
  >({
    path: 'projectMaterials',
    method: 'POST',
    json: input,
  });
  return result.data;
}

export async function updateMaterial(
  api: ApiClient,
  materialId: string,
  input: ProjectMaterialInput,
): Promise<ProjectMaterial> {
  const result = await api.request<
    { data: ProjectMaterial },
    ProjectMaterialInput
  >({
    path: `projectMaterials/${encodeURIComponent(materialId)}`,
    method: 'PATCH',
    json: input,
  });
  return result.data;
}
