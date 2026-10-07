import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/** A value that settles only after the user stops changing it. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export interface LoadResult<T> {
  readonly data: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
}

interface Snapshot<T> {
  readonly key: string;
  readonly data?: T;
  readonly error?: unknown;
}

/**
 * Loads a value whenever `key` changes.
 *
 * The request runs in an effect, but the state it produces is written only from the promise callbacks, so nothing
 * renders twice inside one load. A result that belongs to a superseded key is ignored, and an effect that unmounts
 * aborts its request.
 */
export function useLoad<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  key: string,
): LoadResult<T> {
  const loaderRef = useRef(loader);
  useLayoutEffect(() => {
    loaderRef.current = loader;
  });
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    loaderRef.current(controller.signal).then(
      (data) => {
        if (active) setSnapshot({ key, data });
      },
      (error: unknown) => {
        if (active) setSnapshot({ key, error });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, revision]);

  const reload = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  const current = snapshot?.key === key ? snapshot : null;
  const failed =
    current != null && 'error' in current && current.error !== undefined;

  return {
    data: failed ? undefined : current?.data,
    error: failed ? current?.error : undefined,
    loading: current == null,
    reload,
  };
}
