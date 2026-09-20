import type { ApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchMe, type Me } from './api.js';

export interface AsyncState<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly reload: () => void;
}

/**
 * Loads data whenever `key` changes and exposes a manual reload. The caller
 * passes the current filters as the key, so the effect depends on a single
 * stable string instead of a varying dependency list. Only the promise
 * callbacks update state, so a slow response cannot overwrite a newer one.
 */
export function useAsyncData<T>(
  load: () => Promise<T>,
  key: string,
): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let active = true;
    loadRef.current().then(
      (result) => {
        if (active) {
          setData(result);
          setError(undefined);
          setLoading(false);
        }
      },
      (cause: unknown) => {
        if (active) {
          setError(cause);
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [key, revision]);

  const reload = useCallback(() => {
    setLoading(true);
    setRevision((value) => value + 1);
  }, []);
  return { data, loading, error, reload };
}

export interface MeState {
  readonly me: Me | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly reload: () => void;
}

export function useRecruitmentMe(api: ApiClient): MeState {
  const state = useAsyncData(() => fetchMe(api), 'me');
  return {
    me: state.data,
    loading: state.loading,
    error: state.error,
    reload: state.reload,
  };
}

export interface SubmitGuard {
  /** Drives the submit button's disabled state. */
  readonly saving: boolean;
  /** Runs `run` unless a submission is already in flight. */
  readonly submit: (
    run: () => Promise<void>,
    onError: (cause: unknown) => void,
  ) => Promise<void>;
  /** Call when a form is opened; allows the next submission to run. */
  readonly reset: () => void;
}

/**
 * Prevents one form from producing two records.
 *
 * A disabled button is not enough on its own: after a successful save the
 * dialog is closing but still animating, so a second click can reach a button
 * React has already re-enabled. The lock is a ref, so it is set synchronously
 * and blocks a same-tick repeat, and it stays set after success until the form
 * is reopened. A failed submission unlocks so the user can correct and retry.
 */
export function useSubmitGuard(): SubmitGuard {
  const [saving, setSaving] = useState(false);
  const lockedRef = useRef(false);
  const reset = useCallback(() => {
    lockedRef.current = false;
    setSaving(false);
  }, []);
  const submit = useCallback(
    async (run: () => Promise<void>, onError: (cause: unknown) => void) => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      setSaving(true);
      try {
        await run();
      } catch (cause: unknown) {
        lockedRef.current = false;
        onError(cause);
      } finally {
        setSaving(false);
      }
    },
    [],
  );
  return { saving, submit, reset };
}

/**
 * A per-form key used to make candidate creation idempotent. The same key is
 * resent if the same open form is submitted again, so the server recognizes the
 * retry; reopening the form generates a new one.
 */
export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
