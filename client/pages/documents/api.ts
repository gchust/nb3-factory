import { ApiClientError, type ApiClient } from '@nocobase/app-client';

/** One document as `/api/documents` publishes it. */
export interface DocumentRecord {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly accessLevel: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DocumentUpdateInput {
  readonly title: string;
  readonly body: string;
}

interface ListResponse {
  readonly data: readonly DocumentRecord[];
}

interface ItemResponse {
  readonly data: DocumentRecord;
}

/**
 * The documents the signed-in caller may read.
 *
 * The server filters by the caller's data scope, so a colleague never receives the supervisor-only
 * document and a request the caller has no permission for is refused instead of answered empty.
 */
export async function listDocuments(
  api: ApiClient,
  query?: string,
): Promise<readonly DocumentRecord[]> {
  const response = await api.request<ListResponse>({
    method: 'GET',
    path: 'documents',
    query: query ? { q: query } : undefined,
  });
  return response.data;
}

/**
 * One document, or `undefined` when it is not visible to the caller. The endpoint answers an
 * out-of-scope row with 404, so "not found" and "not allowed to see it" are deliberately the same
 * answer here.
 */
export async function getDocument(
  api: ApiClient,
  id: number,
): Promise<DocumentRecord | undefined> {
  try {
    const response = await api.request<ItemResponse>({
      method: 'GET',
      path: `documents/${id}`,
    });
    return response.data;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404)
      return undefined;
    throw error;
  }
}

/** Saves the title and body. The access level is server-owned metadata and is never sent. */
export async function updateDocument(
  api: ApiClient,
  id: number,
  input: DocumentUpdateInput,
): Promise<DocumentRecord> {
  const response = await api.request<ItemResponse>({
    method: 'PUT',
    path: `documents/${id}`,
    json: input,
  });
  return response.data;
}

/** A single-line preview of a body, for the list. */
export function documentExcerpt(body: string, maxLength = 160): string {
  const text = body.replace(/\s+/gu, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** `2026-10-06T00:00:00.000Z` in the reader's own locale and time zone. */
export function formatUpdatedAt(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
