import { useEffect, useState } from 'react';

import { useCrmApi, type CrmSession } from './api';

/**
 * Reads the caller's CRM roles so the UI can hide manager-only affordances.
 * Server routes enforce the same rules independently.
 */
export function useCrmSession(): {
  session?: CrmSession;
  loading: boolean;
  canManage: boolean;
} {
  const api = useCrmApi();
  const [session, setSession] = useState<CrmSession>();

  useEffect(() => {
    let active = true;
    void api
      .me()
      .then((next) => {
        if (active) setSession(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api]);

  return {
    session,
    loading: session === undefined,
    canManage: Boolean(session?.roles.admin || session?.roles.manager),
  };
}
