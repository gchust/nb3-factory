import type { ApiClient } from '@nocobase/app-client';

/** The file Collection name shared by the upload path and every materials route. */
export const MATERIAL_FILE_COLLECTION = 'projectAttachments';

export interface MaterialAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: string | number;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Absolute URL of the protected content route; carries the session cookie. */
  readonly contentUrl: string;
}

export interface Material {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachments: readonly MaterialAttachment[];
}

export interface MaterialInput {
  readonly title: string;
  readonly attachmentIds: readonly string[];
}

interface Envelope<T> {
  readonly data: T;
}

export async function listMaterials(api: ApiClient): Promise<Material[]> {
  const { data } = await api.request<Envelope<Material[]>>({
    path: '/project-materials',
  });
  return data;
}

export async function getMaterial(
  api: ApiClient,
  id: string,
): Promise<Material> {
  const { data } = await api.request<Envelope<Material>>({
    path: `/project-materials/${encodeURIComponent(id)}`,
  });
  return data;
}

export async function createMaterial(
  api: ApiClient,
  input: MaterialInput,
): Promise<Material> {
  const { data } = await api.request<Envelope<Material>, MaterialInput>({
    path: '/project-materials',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateMaterial(
  api: ApiClient,
  id: string,
  input: MaterialInput,
): Promise<Material> {
  const { data } = await api.request<Envelope<Material>, MaterialInput>({
    path: `/project-materials/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}
