import type { ApiClient } from '@nocobase/app-client';

import type { LibraryDocument, LibraryDocumentList } from './types.js';

/** The fields a create or update request may carry. */
export interface DocumentChanges {
  readonly title: string;
  readonly body: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
}

/**
 * The document library's own REST endpoints. A plain function cannot call
 * hooks, so the caller passes the API client in.
 */
export async function listDocuments(
  api: ApiClient,
  options: {
    readonly page?: number;
    readonly pageSize?: number;
    readonly signal?: AbortSignal;
  } = {},
): Promise<LibraryDocumentList> {
  return api.request<LibraryDocumentList>({
    path: 'library/documents',
    query: { page: options.page, pageSize: options.pageSize },
    signal: options.signal,
  });
}

export async function fetchDocument(
  api: ApiClient,
  id: string,
  signal?: AbortSignal,
): Promise<LibraryDocument> {
  const { data } = await api.request<{ data: LibraryDocument }>({
    path: `library/documents/${encodeURIComponent(id)}`,
    signal,
  });
  return data;
}

export async function createDocument(
  api: ApiClient,
  values: DocumentChanges,
): Promise<LibraryDocument> {
  const { data } = await api.request<
    { data: LibraryDocument },
    DocumentChanges
  >({
    path: 'library/documents',
    method: 'POST',
    json: values,
  });
  return data;
}

export async function updateDocument(
  api: ApiClient,
  id: string,
  changes: DocumentChanges,
): Promise<LibraryDocument> {
  const { data } = await api.request<
    { data: LibraryDocument },
    DocumentChanges
  >({
    path: `library/documents/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: changes,
  });
  return data;
}

export async function deleteDocument(
  api: ApiClient,
  id: string,
): Promise<void> {
  await api.request<void>({
    path: `library/documents/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}
