import type { ApiClient } from '@nocobase/app-client';

import type {
  LibraryDocument,
  LibraryDocumentInput,
  LibraryDocumentList,
} from './types.js';

/** The list endpoint caps a page at 100; the library is small, so one request shows everything. */
export const LIBRARY_PAGE_SIZE = 100;

export async function fetchLibraryDocuments(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<LibraryDocumentList> {
  return api.request<LibraryDocumentList>({
    path: 'library/documents',
    query: { page: 1, pageSize: LIBRARY_PAGE_SIZE },
    signal,
  });
}

export async function fetchLibraryDocument(
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

export async function createLibraryDocument(
  api: ApiClient,
  input: LibraryDocumentInput,
): Promise<LibraryDocument> {
  const { data } = await api.request<
    { data: LibraryDocument },
    LibraryDocumentInput
  >({
    path: 'library/documents',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateLibraryDocument(
  api: ApiClient,
  id: string,
  input: LibraryDocumentInput,
): Promise<LibraryDocument> {
  const { data } = await api.request<
    { data: LibraryDocument },
    LibraryDocumentInput
  >({
    path: `library/documents/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function deleteLibraryDocument(
  api: ApiClient,
  id: string,
): Promise<void> {
  await api.request<void>({
    path: `library/documents/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}
