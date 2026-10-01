/**
 * The document library's endpoints, as plain functions.
 *
 * A plain function cannot call `useApiClient()`, so the caller passes the
 * client in — the pages get it from `useApiClient()` and hand it to these.
 * Keeping the URLs and response shapes here means the pages never spell out a
 * path or an envelope themselves.
 */
import type { ApiClient } from '@nocobase/app-client';

import type {
  LibraryAccount,
  LibraryDocument,
  LibraryDocumentInput,
  LibraryShare,
} from './types.js';

/** Every document the signed-in account is allowed to see. */
export async function fetchDocuments(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<LibraryDocument[]> {
  const { data } = await api.request<{ data: LibraryDocument[] }>({
    path: 'library/documents',
    signal,
  });
  return data;
}

/** One document; a document outside the caller's scope answers 404. */
export async function fetchDocument(
  api: ApiClient,
  documentId: string,
  signal?: AbortSignal,
): Promise<LibraryDocument> {
  const { data } = await api.request<{ data: LibraryDocument }>({
    path: `library/documents/${encodeURIComponent(documentId)}`,
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
  documentId: string,
  input: LibraryDocumentInput,
): Promise<LibraryDocument> {
  const { data } = await api.request<
    { data: LibraryDocument },
    LibraryDocumentInput
  >({
    path: `library/documents/${encodeURIComponent(documentId)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function deleteDocument(
  api: ApiClient,
  documentId: string,
): Promise<void> {
  await api.request({
    path: `library/documents/${encodeURIComponent(documentId)}`,
    method: 'DELETE',
  });
}

/** The accounts a document is currently open to. Root only. */
export async function fetchShares(
  api: ApiClient,
  documentId: string,
  signal?: AbortSignal,
): Promise<LibraryShare[]> {
  const { data } = await api.request<{ data: LibraryShare[] }>({
    path: `library/documents/${encodeURIComponent(documentId)}/shares`,
    signal,
  });
  return data;
}

export async function createShare(
  api: ApiClient,
  documentId: string,
  userId: string,
): Promise<LibraryShare> {
  const { data } = await api.request<
    { data: LibraryShare },
    { userId: string }
  >({
    path: `library/documents/${encodeURIComponent(documentId)}/shares`,
    method: 'POST',
    json: { userId },
  });
  return data;
}

export async function deleteShare(
  api: ApiClient,
  documentId: string,
  shareId: string,
): Promise<void> {
  await api.request({
    path: `library/documents/${encodeURIComponent(documentId)}/shares/${encodeURIComponent(shareId)}`,
    method: 'DELETE',
  });
}

/** The accounts a document may be shared with. Root only. */
export async function fetchAccounts(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<LibraryAccount[]> {
  const { data } = await api.request<{ data: LibraryAccount[] }>({
    path: 'library/accounts',
    signal,
  });
  return data;
}
