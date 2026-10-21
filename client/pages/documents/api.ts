import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useState } from 'react';

export interface DocumentRecord {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly canEdit: boolean;
}

export interface DocumentListMeta {
  readonly total: number;
  readonly canCreate: boolean;
}

export interface DocumentListResponse {
  readonly data: readonly DocumentRecord[];
  readonly meta: DocumentListMeta;
}

export interface DocumentResponse {
  readonly data: DocumentRecord;
}

export interface DocumentShares {
  readonly userId: string;
  readonly name: string;
  readonly username: string | null;
}

export interface AdminDocument {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly shares: readonly DocumentShares[];
}

export interface AdminDocumentsResponse {
  readonly data: readonly AdminDocument[];
}

export interface Recipient {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
}

export interface RecipientsResponse {
  readonly data: readonly Recipient[];
}

export interface DocumentInput {
  readonly title: string;
  readonly content: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

/** Loads a JSON endpoint and keeps the last successful value while a reload is in flight. */
export function useApiData<T>(path: string) {
  const api = useApiClient();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    revision: number;
    data?: T;
    error?: unknown;
  }>({ path, revision: 0 });

  useEffect(() => {
    let active = true;
    void api.request<T>({ path }).then(
      (data) => {
        if (active) setResult({ path, revision, data });
      },
      (error: unknown) => {
        if (active) setResult({ path, revision, error });
      },
    );
    return () => {
      active = false;
    };
  }, [api, path, revision]);

  const current = result.path === path && result.revision === revision;
  return {
    path,
    data: result.path === path ? result.data : undefined,
    error: current ? result.error : undefined,
    loading: !current,
    reload: useCallback(() => setRevision((value) => value + 1), []),
    replaceData: useCallback(
      (data: T) => setResult({ path, revision, data }),
      [path, revision],
    ),
  };
}

export function errorReason(error: unknown): string | undefined {
  return error instanceof ApiClientError ? error.reason : undefined;
}

export function isNotFound(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.status === 404 || error.reason === 'DOCUMENT_NOT_FOUND')
  );
}

export function isDenied(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.status === 403 || error.reason === 'DOCUMENTS_ACCESS_DENIED')
  );
}
