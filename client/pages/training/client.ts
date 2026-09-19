import {
  ApiClientError,
  useApiClient,
  type ApiClient,
} from '@nocobase/app-client';
import { useCallback, useEffect, useState } from 'react';

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    const payload = error.payload;
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = (payload as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message;
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export interface TrainingQueryState<T> {
  readonly data: T | undefined;
  readonly error: string | undefined;
  readonly loading: boolean;
  readonly reload: () => void;
}

export function useTrainingQuery<T>(
  path: string,
  query?: Record<string, string | undefined>,
): TrainingQueryState<T> {
  const api = useApiClient();
  const key = `${path}?${JSON.stringify(query ?? {})}`;
  const [state, setState] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>({ key: '' });
  const [token, setToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestKey = key;
    void api
      .request<{ data: T }>({
        path,
        ...(query ? { query: definedQuery(query) } : {}),
        signal: controller.signal,
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        setState({ key: requestKey, data: response.data });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setState({ key: requestKey, error: errorMessage(cause, '加载失败') });
      });
    return () => controller.abort();
    // `key` already encodes `query`; depending on the object would refetch on
    // every render because callers pass an inline literal.
    // eslint-disable-next-line @eslint-react/exhaustive-deps, react-hooks/exhaustive-deps
  }, [api, path, key, token]);

  const reload = useCallback(() => setToken((value) => value + 1), []);
  const fresh = state.key === key;
  return {
    data: fresh ? state.data : undefined,
    error: fresh ? state.error : undefined,
    loading: !fresh,
    reload,
  };
}

export interface TrainingAction<T> {
  readonly run: (
    request: (api: ApiClient) => Promise<T>,
  ) => Promise<T | undefined>;
  readonly pending: boolean;
  readonly error: string | undefined;
  readonly clearError: () => void;
}

export function useTrainingAction<T = unknown>(): TrainingAction<T> {
  const api = useApiClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const run = useCallback(
    async (
      request: (client: ApiClient) => Promise<T>,
    ): Promise<T | undefined> => {
      setPending(true);
      setError(undefined);
      try {
        return await request(api);
      } catch (cause: unknown) {
        setError(errorMessage(cause, '操作失败'));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [api],
  );

  const clearError = useCallback(() => setError(undefined), []);
  return { run, pending, error, clearError };
}

function definedQuery(
  query: Record<string, string | undefined>,
): Record<string, string> {
  const defined: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') defined[key] = value;
  }
  return defined;
}

/**
 * Resolves the current caller's roles from the API.
 *
 * Client roles only decide what the interface offers; every endpoint checks the
 * same roles again on the server.
 */
export function useTrainingViewer(): TrainingQueryState<{
  userId: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isInstructor: boolean;
  isStudent: boolean;
}> {
  return useTrainingQuery('training/me');
}
