import { appApiClientToken, useService } from '@nocobase/app-client';
import { useCallback, useState } from 'react';

/**
 * Small client for the application's own equipment API. `appClient.request`
 * throws `AppRequestError` (status + payload) on non-2xx responses, so every
 * loader maps failures to a user-facing message with the request status kept
 * for the pages that need to branch on it.
 */

export interface ApiFailure {
  readonly status: number;
  readonly code?: string;
  readonly message: string;
}

export function useAppApiClient() {
  return useService(appApiClientToken);
}

export function describeError(error: unknown): ApiFailure {
  if (error instanceof Error) {
    const rawStatus: unknown = Reflect.get(error, 'status');
    const rawPayload: unknown = Reflect.get(error, 'payload');
    const rawCode: unknown =
      typeof rawPayload === 'object' && rawPayload !== null
        ? Reflect.get(rawPayload, 'code')
        : undefined;
    return {
      status: typeof rawStatus === 'number' ? rawStatus : 0,
      code: typeof rawCode === 'string' ? rawCode : undefined,
      message: error.message || 'Unexpected error.',
    };
  }
  return { status: 0, message: 'Unexpected error.' };
}

export interface Loadable<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly reload: () => Promise<void>;
}

/**
 * Fetches a paged endpoint and exposes loading/error state plus a manual
 * reload. The reload callback is stable so pages can wire it straight into
 * dialog `onSaved` handlers.
 */
export function useLoad<T>(load: () => Promise<T>): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await load());
    } catch (caught) {
      setError(describeError(caught).message);
    } finally {
      setIsLoading(false);
    }
  }, [load]);

  return { data, error, isLoading, reload };
}
