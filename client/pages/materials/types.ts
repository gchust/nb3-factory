import type { ApiClient } from '@nocobase/app-client';
import type { FileRecord } from '@nocobase/app-plugin-file/client';

/**
 * A material attachment as this application's API returns it. The storage columns the file plugin keeps (`disk`, `key`)
 * stay on the server; the file UI components never read them.
 */
export interface MaterialFile {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly contentUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A material with the files currently attached to it. */
export interface Material {
  readonly id: number;
  readonly title: string;
  readonly ownerId: string;
  readonly files: readonly MaterialFile[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The writable part of a material: its title and the attachments to keep. */
export interface MaterialInput {
  readonly title: string;
  readonly fileIds: readonly string[];
}

/** The first version keeps PNG photos and DOCX documents. */
export const MATERIAL_FILE_ACCEPT = [
  '.png',
  'image/png',
  '.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

/** The file UI components take the plugin's wider record; the two fields they never read are filled in. */
export function asFileRecord(file: MaterialFile): FileRecord {
  return { ...file, disk: '', key: '' };
}

export async function listMaterials(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<Material[]> {
  const { data } = await api.request<{ data: Material[] }>({
    path: 'materials',
    signal,
  });
  return data;
}

export async function getMaterial(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<Material> {
  const { data } = await api.request<{ data: Material }>({
    path: `materials/${id}`,
    signal,
  });
  return data;
}

export async function createMaterial(
  api: ApiClient,
  input: MaterialInput,
): Promise<Material> {
  const { data } = await api.request<{ data: Material }, MaterialInput>({
    path: 'materials',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateMaterial(
  api: ApiClient,
  id: number,
  input: MaterialInput,
): Promise<Material> {
  const { data } = await api.request<{ data: Material }, MaterialInput>({
    path: `materials/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function deleteMaterial(
  api: ApiClient,
  id: number,
): Promise<void> {
  await api.request<void>({ path: `materials/${id}`, method: 'DELETE' });
}
