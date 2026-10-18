import type { ApiClient } from '@nocobase/app-client';

import type {
  DocumentInput,
  DocumentShareCandidate,
  DocumentShareSummary,
  DocumentSummary,
} from './types.js';

/**
 * The document endpoints, typed once. The client's base URL already ends in `/api`, so every path here is the part
 * after it. Nothing here decides access: the server refuses an action the person does not hold, and the answers carry
 * the `canEdit` and `shared` the list renders.
 */
export async function listDocuments(
  api: ApiClient,
): Promise<DocumentSummary[]> {
  const { data } = await api.request<{ data: DocumentSummary[] }>({
    path: 'documents',
  });
  return data;
}

export async function getDocument(
  api: ApiClient,
  documentId: string,
): Promise<DocumentSummary> {
  const { data } = await api.request<{ data: DocumentSummary }>({
    path: `documents/${encodeURIComponent(documentId)}`,
  });
  return data;
}

export async function createDocument(
  api: ApiClient,
  input: DocumentInput,
): Promise<DocumentSummary> {
  const { data } = await api.request<{ data: DocumentSummary }, DocumentInput>({
    path: 'documents',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateDocument(
  api: ApiClient,
  documentId: string,
  input: Partial<DocumentInput>,
): Promise<DocumentSummary> {
  const { data } = await api.request<
    { data: DocumentSummary },
    Partial<DocumentInput>
  >({
    path: `documents/${encodeURIComponent(documentId)}`,
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
    path: `documents/${encodeURIComponent(documentId)}`,
    method: 'DELETE',
  });
}

export async function listDocumentShares(
  api: ApiClient,
  documentId: string,
): Promise<DocumentShareSummary[]> {
  const { data } = await api.request<{ data: DocumentShareSummary[] }>({
    path: `documents/${encodeURIComponent(documentId)}/shares`,
  });
  return data;
}

export async function addDocumentShare(
  api: ApiClient,
  documentId: string,
  userId: string,
): Promise<DocumentShareSummary> {
  const { data } = await api.request<
    { data: DocumentShareSummary },
    { userId: string }
  >({
    path: `documents/${encodeURIComponent(documentId)}/shares`,
    method: 'POST',
    json: { userId },
  });
  return data;
}

export async function removeDocumentShare(
  api: ApiClient,
  documentId: string,
  userId: string,
): Promise<void> {
  await api.request({
    path: `documents/${encodeURIComponent(documentId)}/shares/${encodeURIComponent(userId)}`,
    method: 'DELETE',
  });
}

/**
 * The enabled accounts a document may be shared with.
 *
 * Sharing is an administrative action, so this reads the application's own user list; the endpoint refuses it to
 * anyone without that permission and the dialog shows the refusal rather than the picker.
 */
export async function listShareCandidates(
  api: ApiClient,
): Promise<DocumentShareCandidate[]> {
  const { data } = await api.request<{ data: DocumentShareCandidate[] }>({
    path: 'users',
    query: { status: 'enabled', pageSize: 200 },
  });
  return data;
}
