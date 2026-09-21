import { useApiClient, type ApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  complianceRequest,
  normalizeError,
  type AccessContext,
  type NormalizedError,
} from './api.js';

export interface AccessState {
  readonly api: ApiClient;
  readonly access?: AccessContext;
  readonly loading: boolean;
  readonly error?: NormalizedError;
  readonly reload: () => Promise<void>;
}

/**
 * Loads the signed-in user's compliance memberships once per page.
 *
 * The server remains authoritative: pages use this only to decide which controls to show, and every
 * mutation is still authorized again on the server.
 */
export function useAccess(): AccessState {
  const api = useApiClient();
  const [access, setAccess] = useState<AccessContext>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<NormalizedError>();
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await complianceRequest<AccessContext>(api, '/me');
      if (!activeRef.current) return;
      setAccess(data);
      setError(undefined);
    } catch (cause) {
      if (!activeRef.current) return;
      setError(normalizeError(cause));
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    // Defer to a microtask so the effect body itself does not synchronously update state.
    queueMicrotask(() => void reload());
  }, [reload]);

  return { api, access, loading, error, reload };
}
