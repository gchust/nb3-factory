import { ApiClientError, type ApiClient } from '@nocobase/app-client';

import type { FileRecord } from '@/extensions/nocobase-file-component-ui';

/**
 * The Client half of the project-materials API.
 *
 * The server routes are custom (`:list`, `:create`, ...) rather than the
 * repository's `findMany`/`createOne`, because a material and its attachments
 * are written together by {@link createMaterial}/{@link updateMaterial}. Every
 * request goes through the application's `ApiClient`, so the base path and the
 * session cookie come from the running application and are never built here.
 */

export const MATERIALS_RESOURCE = 'project_materials';
export const MATERIAL_FILES_RESOURCE = 'project_material_files';

/** The extension the first version accepts, for the file input's `accept`. */
export const MATERIAL_ACCEPT: readonly string[] = [
  '.png',
  '.docx',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export interface MaterialRecord {
  readonly id: number;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: readonly FileRecord[];
}

export interface MaterialCreateInput {
  readonly title: string;
  readonly fileIds: readonly string[];
}

export interface MaterialUpdateInput {
  readonly title?: string;
  readonly fileIds?: readonly string[];
}

interface Envelope<T> {
  readonly data: T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 404;
}

/**
 * The locale key for a failure the service reported. The service's own message
 * is deliberately not shown: it is written in one language, while the key is
 * the application's own wording.
 */
export function materialErrorKey(error: unknown): string {
  const code =
    error instanceof ApiClientError ? error.code : codeFromPayload(error);
  switch (code) {
    case 'TITLE_REQUIRED':
      return 'materials.errors.titleRequired';
    case 'TITLE_TOO_LONG':
      return 'materials.errors.titleTooLong';
    case 'INVALID_FILE_IDS':
      return 'materials.errors.invalidFileIds';
    case 'TOO_MANY_FILES':
      return 'materials.errors.tooManyFiles';
    case 'FILE_NOT_AVAILABLE':
      return 'materials.errors.fileNotAvailable';
    case 'UNSUPPORTED_FILE_TYPE':
      return 'materials.errors.unsupportedFileType';
    default:
      return 'materials.errors.saveFailed';
  }
}

function codeFromPayload(error: unknown): string | undefined {
  if (!(error instanceof ApiClientError) || !isRecord(error.payload)) {
    return undefined;
  }
  return typeof error.payload.code === 'string'
    ? error.payload.code
    : undefined;
}

export async function listMaterials(
  api: ApiClient,
): Promise<readonly MaterialRecord[]> {
  const { data } = await api.request<Envelope<MaterialRecord[]>>({
    path: `/${MATERIALS_RESOURCE}:list`,
    method: 'POST',
    json: {},
  });
  return data;
}

/** `undefined` when the material does not exist or belongs to another account. */
export async function getMaterial(
  api: ApiClient,
  id: number,
): Promise<MaterialRecord | undefined> {
  try {
    const { data } = await api.request<Envelope<MaterialRecord>>({
      path: `/${MATERIALS_RESOURCE}:get`,
      method: 'POST',
      json: { id },
    });
    return data;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

export async function createMaterial(
  api: ApiClient,
  input: MaterialCreateInput,
): Promise<MaterialRecord> {
  const { data } = await api.request<Envelope<MaterialRecord>>({
    path: `/${MATERIALS_RESOURCE}:create`,
    method: 'POST',
    json: input,
  });
  return data;
}

/** `undefined` when the material does not exist or belongs to another account. */
export async function updateMaterial(
  api: ApiClient,
  id: number,
  input: MaterialUpdateInput,
): Promise<MaterialRecord | undefined> {
  try {
    const { data } = await api.request<Envelope<MaterialRecord>>({
      path: `/${MATERIALS_RESOURCE}:update`,
      method: 'POST',
      json: { id, ...input },
    });
    return data;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

/** `false` when the material does not exist or belongs to another account. */
export async function destroyMaterial(
  api: ApiClient,
  id: number,
): Promise<boolean> {
  try {
    await api.request({
      path: `/${MATERIALS_RESOURCE}:destroy`,
      method: 'POST',
      json: { id },
    });
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

/**
 * The caller's own uploaded attachments, optionally narrowed to one material.
 * Used to recover files that were uploaded before a save that failed.
 */
export async function listMaterialFiles(
  api: ApiClient,
  materialId?: number,
): Promise<readonly FileRecord[]> {
  const { data } = await api.request<Envelope<FileRecord[]>>({
    path: `/${MATERIAL_FILES_RESOURCE}:list`,
    method: 'POST',
    json: materialId === undefined ? {} : { materialId },
  });
  return data;
}
