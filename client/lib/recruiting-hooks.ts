import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  status: 'loading' | 'ready' | 'error';
  data?: T;
  message?: string;
}

export interface AsyncResult<T> extends AsyncState<T> {
  reload: () => void;
}

/** Reads a human-readable message from an API error, falling back to a caller-provided string. */
export function errorText(error: unknown, fallback: string): string {
  const message = errorMessage(error);
  return message === 'Request failed' ? fallback : message;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return 'Request failed';
}

/**
 * Loads data on mount and whenever a dependency changes, exposing an explicit reload for after a mutation.
 * Errors are surfaced as data rather than thrown, so a page can render its own error state.
 *
 * The loader is read from a ref updated after each render, so a fresh closure is used without making the caller
 * memoize it. The dependency list is the caller's explicit statement of when a reload is required.
 */
export function useAsyncData<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
): AsyncResult<T> {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let active = true;
    loadRef.current().then(
      (data) => {
        if (active) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (active) setState({ status: 'error', message: errorMessage(error) });
      },
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);
  return { ...state, reload };
}

export type BadgeTone =
  'default' | 'secondary' | 'destructive' | 'outline' | 'success';

export const STAGE_TONES: Record<string, BadgeTone> = {
  screening: 'outline',
  invited: 'secondary',
  interviewing: 'default',
  pending: 'secondary',
  hired: 'success',
  rejected: 'destructive',
};

export const STATUS_TONES: Record<string, BadgeTone> = {
  open: 'success',
  paused: 'secondary',
  completed: 'outline',
  scheduled: 'default',
  cancelled: 'destructive',
  pass: 'success',
  fail: 'destructive',
  accepted: 'success',
  declined: 'destructive',
};
