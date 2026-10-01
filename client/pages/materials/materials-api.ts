import { ApiClientError, type ApiClient } from '@nocobase/app-client';

import type { FileRecord } from '@/extensions/nocobase-file-component-ui';

/** A material and the attachments that currently belong to it, as the API returns them. */
export interface MaterialRecord {
  readonly id: string;
  readonly title: string;
  readonly createdById: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: readonly FileRecord[];
}

/**
 * A failed material request, carrying the server's stable error code so the page can choose wording
 * rather than showing whatever English sentence the server happened to send.
 */
export class MaterialRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MaterialRequestError';
    this.code = code;
  }
}

function toRequestError(error: unknown): unknown {
  if (!(error instanceof ApiClientError)) return error;
  const payload = error.payload as
    { error?: { code?: string; message?: string } } | undefined;
  return new MaterialRequestError(
    payload?.error?.code ?? `HTTP_${error.status}`,
    payload?.error?.message ?? error.message,
  );
}

async function request<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toRequestError(error);
  }
}

export async function listMaterials(api: ApiClient): Promise<MaterialRecord[]> {
  const response = await request(() =>
    api.request<{ data: MaterialRecord[] }>({
      method: 'GET',
      path: '/project-materials',
    }),
  );
  return response.data ?? [];
}

export async function createMaterial(
  api: ApiClient,
  input: { readonly title: string; readonly fileIds: readonly string[] },
): Promise<MaterialRecord> {
  const response = await request(() =>
    api.request<{ data: MaterialRecord }>({
      method: 'POST',
      path: '/project-materials',
      json: input,
    }),
  );
  return response.data;
}

export async function updateMaterial(
  api: ApiClient,
  id: string,
  input: { readonly title?: string; readonly fileIds?: readonly string[] },
): Promise<MaterialRecord> {
  const response = await request(() =>
    api.request<{ data: MaterialRecord }>({
      method: 'PUT',
      path: `/project-materials/${encodeURIComponent(id)}`,
      json: input,
    }),
  );
  return response.data;
}

export async function deleteMaterial(
  api: ApiClient,
  id: string,
): Promise<void> {
  await request(() =>
    api.request({
      method: 'DELETE',
      path: `/project-materials/${encodeURIComponent(id)}`,
    }),
  );
}
