import type { ApiClient } from '@nocobase/app-client';

import type {
  DocumentCapabilities,
  DocumentFilters,
  DocumentRecord,
  DocumentStats,
} from './types.js';

const BASE = '/document-library';

interface Envelope<T> {
  readonly data: T;
}

export async function fetchCapabilities(
  api: ApiClient,
): Promise<DocumentCapabilities> {
  const response = await api.request<Envelope<DocumentCapabilities>>({
    path: `${BASE}/context`,
    method: 'POST',
    json: {},
  });
  return response.data;
}

export async function fetchDocuments(
  api: ApiClient,
  filters: DocumentFilters,
): Promise<readonly DocumentRecord[]> {
  const response = await api.request<Envelope<readonly DocumentRecord[]>>({
    path: `${BASE}/list`,
    method: 'POST',
    json: { ...filters },
  });
  return response.data;
}

export async function fetchStats(api: ApiClient): Promise<DocumentStats> {
  const response = await api.request<Envelope<DocumentStats>>({
    path: `${BASE}/stats`,
    method: 'POST',
    json: {},
  });
  return response.data;
}

export async function uploadDocuments(
  api: ApiClient,
  input: {
    readonly discipline: string;
    readonly version: string;
    readonly files: readonly File[];
  },
): Promise<readonly DocumentRecord[]> {
  const body = new FormData();
  for (const file of input.files) body.append('file', file);
  body.append('discipline', input.discipline);
  if (input.version) body.append('version', input.version);
  const response = await api.request<Envelope<readonly DocumentRecord[]>>({
    path: `${BASE}/upload`,
    method: 'POST',
    body,
  });
  return response.data;
}

export async function updateDocument(
  api: ApiClient,
  id: string,
  values: Record<string, string | null>,
): Promise<DocumentRecord | null> {
  const response = await api.request<Envelope<DocumentRecord | null>>({
    path: `${BASE}/update`,
    method: 'POST',
    json: { id, values },
  });
  return response.data;
}

export async function deleteDocument(
  api: ApiClient,
  id: string,
): Promise<void> {
  await api.request({
    path: `${BASE}/delete`,
    method: 'POST',
    json: { id },
  });
}

/** The server's error code, when the request failed with one. */
export function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code: unknown = Reflect.get(error, 'code');
  return typeof code === 'string' ? code : undefined;
}
