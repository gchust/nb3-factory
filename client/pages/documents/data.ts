import { useApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useState } from 'react';

export interface DocumentResource<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly reload: () => void;
}

interface ResourceState<T> {
  readonly path: string;
  readonly revision: number;
  readonly data?: T;
  readonly loading: boolean;
  readonly error?: unknown;
}

/**
 * Loads one document endpoint relative to the API base. `reload()` is the only
 * way a view sees a change made elsewhere, which is exactly what makes a
 * revoked share disappear in the reader's browser only after a refresh or a
 * reopen — the server has already stopped returning it.
 */
export function useDocumentResource<T>(
  path: string,
  { enabled = true }: { readonly enabled?: boolean } = {},
): DocumentResource<T> {
  const api = useApiClient();
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({
    path,
    revision: -1,
    loading: enabled,
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void api
      .request<T>({ path })
      .then((data) => {
        if (active) {
          setState({ path, revision: version, data, loading: false });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ path, revision: version, loading: false, error });
        }
      });
    return () => {
      active = false;
    };
  }, [api, enabled, path, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const stale = state.path !== path || state.revision !== version;
  return {
    data: enabled && !stale ? state.data : undefined,
    loading: enabled && (stale || state.loading),
    error: enabled && !stale ? state.error : undefined,
    reload,
  };
}

export function formatInstant(value: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDateTimeInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
