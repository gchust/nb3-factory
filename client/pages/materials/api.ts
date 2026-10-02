import { ApiClientError, type ApiClient } from '@nocobase/app-client';
import type { FileRecord } from '@nocobase/app-plugin-file/client';

// Browser-side access to the application's material API.
//
// Every call goes through the application's `ApiClient`, so the deployment base
// path and the session cookie travel with the request. Nothing here hard-codes
// `/api` or reaches for `fetch`.

/** The file-plugin Repository name the upload field posts to. */
export const MATERIAL_FILE_REPOSITORY = 'materialFiles';

/** An attachment as the material API returns it. Matches the file plugin's `FileRecord`. */
export type MaterialAttachment = FileRecord;

export interface Material {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: readonly MaterialAttachment[];
}

export interface MaterialInput {
  readonly title?: string;
  readonly fileIds?: readonly string[];
}

export async function listMaterials(api: ApiClient): Promise<Material[]> {
  const payload = await api.request<{ data: Material[] }>({
    path: '/materials',
  });
  return payload.data ?? [];
}

export async function getMaterial(
  api: ApiClient,
  id: string,
): Promise<Material> {
  const payload = await api.request<{ data: Material }>({
    path: `/materials/${encodeURIComponent(id)}`,
  });
  return payload.data;
}

export async function createMaterial(
  api: ApiClient,
  input: Required<Pick<MaterialInput, 'title'>> & MaterialInput,
): Promise<Material> {
  const payload = await api.request<{ data: Material }>({
    path: '/materials',
    method: 'POST',
    json: input,
  });
  return payload.data;
}

export async function updateMaterial(
  api: ApiClient,
  id: string,
  input: MaterialInput,
): Promise<Material> {
  const payload = await api.request<{ data: Material }>({
    path: `/materials/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: input,
  });
  return payload.data;
}

export async function deleteMaterial(api: ApiClient, id: string): Promise<void> {
  await api.request({
    path: `/materials/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}

/**
 * The stable failure code the server sent, if it sent one.
 *
 * The route layer answers failures with `{ code, message }`, and the API client
 * surfaces `code`, so a page can translate a failure instead of printing the
 * server's English message.
 */
export function materialErrorCode(error: unknown): string | undefined {
  return error instanceof ApiClientError ? error.code : undefined;
}

const MATERIAL_ERROR_KEYS: Readonly<Record<string, string>> = {
  MATERIAL_TITLE_REQUIRED: 'materials.errors.titleRequired',
  MATERIAL_TITLE_TOO_LONG: 'materials.errors.titleTooLong',
  MATERIAL_INVALID_FILES: 'materials.errors.invalidFiles',
  MATERIAL_INVALID_BODY: 'materials.errors.invalidBody',
  MATERIAL_NOT_FOUND: 'materials.errors.notFound',
  MATERIAL_FORBIDDEN: 'materials.errors.forbidden',
  MATERIAL_FILE_NOT_FOUND: 'materials.errors.fileNotFound',
  MATERIAL_FILE_FORBIDDEN: 'materials.errors.fileForbidden',
  UNAUTHORIZED: 'materials.errors.unauthenticated',
};

/** The locale key for a failure, defaulting to a generic message. */
export function materialErrorKey(code: string | undefined): string {
  return (code && MATERIAL_ERROR_KEYS[code]) ?? 'materials.errors.unknown';
}