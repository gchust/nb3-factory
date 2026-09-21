import { useCallback, useEffect, useRef, useState } from 'react';

/** A failed API call, reduced to what the interface shows and decides on. */
export interface LabRequestError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

/**
 * Reads the error the API client throws without depending on its class.
 *
 * The client's `ApiClientError` carries the status and the server's `code`, but the class lives in a
 * package the application does not declare, and a bundle only needs the fields. Reading them
 * structurally keeps this module independent of that package's identity.
 */
export function toLabRequestError(error: unknown): LabRequestError {
  if (error && typeof error === 'object') {
    const record = error as {
      status?: unknown;
      code?: unknown;
      message?: unknown;
    };
    return {
      status: typeof record.status === 'number' ? record.status : 0,
      code: typeof record.code === 'string' ? record.code : 'REQUEST_FAILED',
      message:
        typeof record.message === 'string' && record.message
          ? record.message
          : 'The request failed.',
    };
  }
  return {
    status: 0,
    code: 'REQUEST_FAILED',
    message: typeof error === 'string' && error ? error : 'The request failed.',
  };
}

export interface AsyncResult<T> {
  readonly data: T | undefined;
  readonly error: LabRequestError | undefined;
  readonly loading: boolean;
  /** Re-runs the loader, for a retry button or after a write. */
  readonly reload: () => void;
}

/**
 * Loads one request and re-runs it when `key` changes.
 *
 * `key` is the request's identity: a page passes the endpoint and the filters that define it, and the
 * hook refetches exactly when that string changes. The loader therefore needs no dependency array of
 * its own, and a loader that closes over current props is always the one invoked.
 *
 * State is only written when a request settles, and it records which request settled in. `loading` is
 * then read as "the settled request is not the current one", which is why changing the key or asking
 * for a reload shows the spinner without the effect having to set one.
 */
export function useAsync<T>(
  key: string,
  load: () => Promise<T>,
): AsyncResult<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{
    token: string;
    data: T | undefined;
    error: LabRequestError | undefined;
  } | null>(null);
  const token = `${attempt}\u0000${key}`;
  const loadRef = useRef(load);

  // Refreshed on every render, before the effect below runs in the same commit: effect order follows
  // declaration order, so the loader this hook invokes is always the latest one.
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let active = true;
    loadRef
      .current()
      .then(
        (data) => {
          if (active) setSettled({ token, data, error: undefined });
        },
        (error: unknown) => {
          if (active) {
            setSettled({
              token,
              data: undefined,
              error: toLabRequestError(error),
            });
          }
        },
      )
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token]);

  const reload = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const current = settled?.token === token ? settled : null;

  return {
    data: current?.data,
    error: current?.error,
    loading: settled?.token !== token,
    reload,
  };
}
