import type { ApiClient } from '@nocobase/app-client';

import type {
  LibraryDocument,
  LibraryDocumentInput,
  LibraryDocumentList,
  LibraryPerson,
} from './types.js';

interface DataResponse<T> {
  data: T;
}

interface ListResponse<T> {
  data: T[];
  meta: { page?: number; pageSize?: number; total: number };
}

export async function listDocuments(
  api: ApiClient,
  input: {
    q?: string;
    page: number;
    pageSize: number;
    mine?: boolean;
    signal?: AbortSignal;
  },
): Promise<LibraryDocumentList> {
  const response = await api.request<ListResponse<LibraryDocument>>({
    path: 'library/documents',
    query: {
      q: input.q?.trim() || undefined,
      page: input.page,
      pageSize: input.pageSize,
      mine: input.mine ? 'true' : undefined,
    },
    signal: input.signal,
  });
  return {
    documents: response.data,
    meta: {
      page: response.meta.page ?? input.page,
      pageSize: response.meta.pageSize ?? input.pageSize,
      total: response.meta.total,
    },
  };
}

export async function getDocument(
  api: ApiClient,
  id: string,
  signal?: AbortSignal,
): Promise<LibraryDocument> {
  const response = await api.request<DataResponse<LibraryDocument>>({
    path: `library/documents/${encodeURIComponent(id)}`,
    signal,
  });
  return response.data;
}

export async function createDocument(
  api: ApiClient,
  input: LibraryDocumentInput,
): Promise<LibraryDocument> {
  const response = await api.request<DataResponse<LibraryDocument>>({
    path: 'library/documents',
    method: 'POST',
    json: input,
  });
  return response.data;
}

export async function updateDocument(
  api: ApiClient,
  id: string,
  input: LibraryDocumentInput,
): Promise<LibraryDocument> {
  const response = await api.request<DataResponse<LibraryDocument>>({
    path: `library/documents/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: input,
  });
  return response.data;
}

export async function deleteDocument(
  api: ApiClient,
  id: string,
): Promise<void> {
  await api.request({
    path: `library/documents/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}

export async function listShareCandidates(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<readonly LibraryPerson[]> {
  const response = await api.request<ListResponse<LibraryPerson>>({
    path: 'library/shareCandidates',
    signal,
  });
  return response.data;
}

export async function listDocumentShares(
  api: ApiClient,
  id: string,
  signal?: AbortSignal,
): Promise<readonly LibraryPerson[]> {
  const response = await api.request<ListResponse<LibraryPerson>>({
    path: `library/documents/${encodeURIComponent(id)}/shares`,
    signal,
  });
  return response.data;
}

export async function setDocumentShares(
  api: ApiClient,
  id: string,
  userIds: readonly string[],
): Promise<readonly LibraryPerson[]> {
  const response = await api.request<ListResponse<LibraryPerson>>({
    path: `library/documents/${encodeURIComponent(id)}/shares`,
    method: 'PUT',
    json: { userIds },
  });
  return response.data;
}
