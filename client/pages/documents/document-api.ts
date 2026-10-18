import type { ApiClient } from '@nocobase/app-client';

import type {
  DocumentChanges,
  DocumentList,
  DocumentShare,
  DocumentShareList,
  LibraryDocument,
} from './types.js';

/**
 * The document library's endpoints. Plain functions, so the caller passes the client in: components get it from
 * `useApiClient()`. Every id is encoded before it goes into the path.
 */
const path = (documentId: string): string =>
  `documents/${encodeURIComponent(documentId)}`;

export async function fetchDocuments(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<DocumentList> {
  return api.request<DocumentList>({ path: 'documents', signal });
}

export async function fetchDocument(
  api: ApiClient,
  documentId: string,
  signal?: AbortSignal,
): Promise<LibraryDocument> {
  const { data } = await api.request<{ data: LibraryDocument }>({
    path: path(documentId),
    signal,
  });
  return data;
}

export async function createDocument(
  api: ApiClient,
  changes: DocumentChanges,
): Promise<LibraryDocument> {
  const { data } = await api.request<
    { data: LibraryDocument },
    DocumentChanges
  >({ path: 'documents', method: 'POST', json: changes });
  return data;
}

export async function updateDocument(
  api: ApiClient,
  documentId: string,
  changes: DocumentChanges,
): Promise<LibraryDocument> {
  const { data } = await api.request<
    { data: LibraryDocument },
    DocumentChanges
  >({ path: path(documentId), method: 'PATCH', json: changes });
  return data;
}

export async function deleteDocument(
  api: ApiClient,
  documentId: string,
): Promise<void> {
  await api.request<void>({ path: path(documentId), method: 'DELETE' });
}

export async function fetchDocumentShares(
  api: ApiClient,
  documentId: string,
  signal?: AbortSignal,
): Promise<DocumentShareList> {
  return api.request<DocumentShareList>({
    path: `${path(documentId)}/shares`,
    signal,
  });
}

export async function shareDocument(
  api: ApiClient,
  documentId: string,
  userId: string,
): Promise<DocumentShare> {
  const { data } = await api.request<
    { data: DocumentShare },
    { userId: string }
  >({
    path: `${path(documentId)}/shares`,
    method: 'POST',
    json: { userId },
  });
  return data;
}

export async function revokeDocumentShare(
  api: ApiClient,
  documentId: string,
  userId: string,
): Promise<void> {
  await api.request<void>({
    path: `${path(documentId)}/shares/${encodeURIComponent(userId)}`,
    method: 'DELETE',
  });
}
