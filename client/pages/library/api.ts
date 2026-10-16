import type { ApiClient } from '@nocobase/app-client';

import type {
  LibraryDocument,
  LibraryDocumentInput,
  LibraryDocumentPage,
  LibraryDocumentPatch,
  LibraryDocumentVisibility,
  LibraryShare,
} from './types.js';

/**
 * The document library's HTTP calls, against the application's own endpoints
 * under `/api/library` (`server/routes/library/document-routes.ts`). Every
 * function takes the `ApiClient` the page obtained from `useApiClient()`, so the
 * mount path and credentials live in one place.
 *
 * A failed call throws the client's `ApiClientError`, carrying the status the
 * page distinguishes 403 (no permission) and 404 (out of the requester's scope,
 * which is also how a revoked share presents itself) by.
 */

interface DataResponse<T> {
  readonly data: T;
}

export interface LibraryDocumentListQuery {
  readonly q?: string;
  readonly visibility?: LibraryDocumentVisibility;
}

export async function fetchDocuments(
  api: ApiClient,
  query: LibraryDocumentListQuery = {},
): Promise<LibraryDocumentPage> {
  const response = await api.request<{
    readonly data: readonly LibraryDocument[];
    readonly meta?: { readonly total?: number; readonly canCreate?: boolean };
  }>({
    path: '/library/documents',
    query: {
      q: query.q || undefined,
      visibility: query.visibility || undefined,
    },
  });
  return {
    items: response.data,
    total: response.meta?.total ?? response.data.length,
    canCreate: response.meta?.canCreate ?? false,
  };
}

export async function fetchDocument(
  api: ApiClient,
  documentId: string,
): Promise<LibraryDocument> {
  const response = await api.request<DataResponse<LibraryDocument>>({
    path: `/library/documents/${encodeURIComponent(documentId)}`,
  });
  return response.data;
}

export async function createDocument(
  api: ApiClient,
  input: LibraryDocumentInput,
): Promise<LibraryDocument> {
  const response = await api.request<DataResponse<LibraryDocument>>({
    path: '/library/documents',
    method: 'POST',
    json: input,
  });
  return response.data;
}

export async function updateDocument(
  api: ApiClient,
  documentId: string,
  patch: LibraryDocumentPatch,
): Promise<LibraryDocument> {
  const response = await api.request<DataResponse<LibraryDocument>>({
    path: `/library/documents/${encodeURIComponent(documentId)}`,
    method: 'PATCH',
    json: patch,
  });
  return response.data;
}

export async function fetchShares(
  api: ApiClient,
  documentId: string,
): Promise<readonly LibraryShare[]> {
  const response = await api.request<DataResponse<readonly LibraryShare[]>>({
    path: `/library/documents/${encodeURIComponent(documentId)}/shares`,
  });
  return response.data;
}

export async function createShare(
  api: ApiClient,
  documentId: string,
  subjectId: string,
  reason?: string,
): Promise<LibraryShare> {
  const response = await api.request<DataResponse<LibraryShare>>({
    path: `/library/documents/${encodeURIComponent(documentId)}/shares`,
    method: 'POST',
    json: { subjectId, reason: reason || undefined },
  });
  return response.data;
}

export async function deleteShare(
  api: ApiClient,
  documentId: string,
  shareKey: string,
): Promise<void> {
  await api.request<unknown>({
    path: `/library/documents/${encodeURIComponent(documentId)}/shares/${encodeURIComponent(shareKey)}`,
    method: 'DELETE',
  });
}
