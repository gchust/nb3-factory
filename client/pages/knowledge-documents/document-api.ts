import type { ApiClient } from '@nocobase/app-client';

/** One document as `GET /api/knowledge/documents` returns it. */
export interface KnowledgeDocument {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly visibility: 'public' | 'restricted';
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface DocumentListResponse {
  readonly data: readonly KnowledgeDocument[];
  readonly meta: { readonly total: number };
}

export interface DocumentChanges {
  readonly title?: string;
  readonly body?: string;
}

/** The documents the signed-in identity may read; the server already scoped them. */
export async function fetchDocuments(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<KnowledgeDocument[]> {
  const result = await api.request<DocumentListResponse>({
    path: 'knowledge/documents',
    signal,
  });
  return [...result.data];
}

export async function updateDocument(
  api: ApiClient,
  id: number,
  changes: DocumentChanges,
): Promise<KnowledgeDocument> {
  const { data } = await api.request<
    { data: KnowledgeDocument },
    DocumentChanges
  >({
    path: `knowledge/documents/${encodeURIComponent(String(id))}`,
    method: 'PATCH',
    json: changes,
  });
  return data;
}
