import type { ApiClient } from '@nocobase/app-client';

import type { Material, MaterialListMeta } from './types.js';

/** One page of the signed-in user's materials and how many there are in total. */
export interface MaterialPage {
  readonly data: readonly Material[];
  readonly meta: MaterialListMeta;
}

/** What creating or updating a material sends: the title, the notes, and the complete set of attachments. */
export interface MaterialDraft {
  readonly title: string;
  readonly description: string | null;
  /** Every attachment the material should end up with; a linked file absent here is detached, never deleted. */
  readonly fileIds: readonly string[];
}

/** The caller's own materials, newest first. A material of another user is never returned. */
export async function fetchMaterials(
  api: ApiClient,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<MaterialPage> {
  return await api.request<MaterialPage>({
    path: 'projectMaterials',
    query: { page, pageSize },
    signal,
  });
}

/** One material with its attachments; a material of another user answers `404`. */
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

/**
 * Creates a material. The attachments named by `fileIds` have already been uploaded through
 * `/projectMaterialFiles/uploadOne`; saving links them, so retrying after a failed save never uploads them again.
 */
export async function createMaterial(
  api: ApiClient,
  draft: MaterialDraft,
): Promise<Material> {
  const { data } = await api.request<{ data: Material }>({
    path: 'projectMaterials',
    method: 'POST',
    json: draft,
  });
  return data;
}

/** Updates a material; `fileIds` is the complete set of attachments it should end up with. */
export async function updateMaterial(
  api: ApiClient,
  id: string,
  draft: MaterialDraft,
): Promise<Material> {
  const { data } = await api.request<{ data: Material }>({
    path: `projectMaterials/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: draft,
  });
  return data;
}
