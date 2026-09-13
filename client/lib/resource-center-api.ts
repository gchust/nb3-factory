import type { ApiClient } from '@nocobase/app-client';

export interface ResourceAttachmentView {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly contentUrl: string;
}

export interface ResourceView {
  readonly id: number;
  readonly title: string;
  readonly category: string;
  readonly cover: ResourceAttachmentView | null;
  readonly document: ResourceAttachmentView | null;
  readonly createdAt: string;
}

export interface CreateResourceInput {
  readonly title: string;
  readonly category: string;
  readonly coverFileId: string | null;
  readonly documentFileId: string | null;
}

export async function listResources(api: ApiClient): Promise<ResourceView[]> {
  const response = await api.request<{ readonly data: ResourceView[] }>({
    path: 'resources',
  });
  return response.data;
}

export async function getResource(
  api: ApiClient,
  id: string,
): Promise<ResourceView> {
  const response = await api.request<{ readonly data: ResourceView }>({
    path: `resources/${encodeURIComponent(id)}`,
  });
  return response.data;
}

export async function createResource(
  api: ApiClient,
  input: CreateResourceInput,
): Promise<ResourceView> {
  const response = await api.request<{ readonly data: ResourceView }>({
    path: 'resources',
    method: 'POST',
    json: input,
  });
  return response.data;
}

/** Reads the `{ code }` the resource API returns on a rejected request. */
export function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const payload = (error as { readonly payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return undefined;
  const code = (payload as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
