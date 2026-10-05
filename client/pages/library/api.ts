import type { ApiClient } from '@nocobase/app-client';

import type {
  LibraryDocument,
  LibraryDocumentInput,
  LibraryDocumentList,
  LibraryRecipient,
  LibraryShare,
} from './types.js';

/**
 * Every library request in one place, so the page components hold only state
 * and presentation. The caller passes the client in: these are plain functions
 * and cannot call `useApiClient()` themselves.
 */

export async function fetchDocuments(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<LibraryDocumentList> {
  const { data } = await api.request<{ data: LibraryDocumentList }>({
    path: 'library/documents',
    signal,
  });
  return data;
}

export async function fetchDocument(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<LibraryDocument> {
  const { data } = await api.request<{ data: LibraryDocument }>({
    path: `library/documents/${id}`,
    signal,
  });
  return data;
}

export async function createDocument(
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

export async function updateDocument(
  api: ApiClient,
  id: number,
  input: LibraryDocumentInput,
): Promise<LibraryDocument> {
  const { data } = await api.request<
    { data: LibraryDocument },
    LibraryDocumentInput
  >({
    path: `library/documents/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function deleteDocument(
  api: ApiClient,
  id: number,
): Promise<void> {
  await api.request({ path: `library/documents/${id}`, method: 'DELETE' });
}

export async function fetchShares(api: ApiClient): Promise<LibraryShare[]> {
  const { data } = await api.request<{ data: LibraryShare[] }>({
    path: 'library/shares',
  });
  return data;
}

export async function fetchRecipients(
  api: ApiClient,
): Promise<LibraryRecipient[]> {
  const { data } = await api.request<{ data: LibraryRecipient[] }>({
    path: 'library/recipients',
  });
  return data;
}

export async function createShare(
  api: ApiClient,
  documentId: number,
  recipientId: string,
): Promise<LibraryShare[]> {
  const { data } = await api.request<
    { data: LibraryShare[] },
    { documentId: number; recipientIds: string[] }
  >({
    path: 'library/shares',
    method: 'POST',
    json: { documentId, recipientIds: [recipientId] },
  });
  return data;
}

export async function deleteShare(api: ApiClient, key: string): Promise<void> {
  await api.request({
    path: `library/shares/${encodeURIComponent(key)}`,
    method: 'DELETE',
  });
}
