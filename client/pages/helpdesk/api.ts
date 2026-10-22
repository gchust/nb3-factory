import { useState } from 'react';
import { useApiClient } from '@nocobase/app-client';
import { useQuery } from '@tanstack/react-query';

export interface ApiEnvelope<T> {
  data: T;
}

export interface ApiData<T> {
  data?: T;
  error?: unknown;
  loading: boolean;
  reload: () => void;
}

/** A small read hook: the pages below only need fetch, reload and an error to retry. */
export function useApiData<T extends object>(path: string | null): ApiData<T> {
  const api = useApiClient();
  const [revision, setRevision] = useState(0);
  // The response envelope is kept intact: paginated endpoints need `meta` too.
  const query = useQuery({
    queryKey: ['helpdesk', path, revision],
    enabled: Boolean(path),
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: () => api.request<T>({ path: path! }),
  });
  return {
    data: query.data,
    error: query.error ?? undefined,
    loading: query.isLoading,
    reload: () => setRevision((value) => value + 1),
  };
}

export const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message
  ) {
    return error.message;
  }
  return fallback;
};
