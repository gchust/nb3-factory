import { resolveAppUrl, useApiClient } from '@nocobase/app-client';
import { useEffect, useMemo } from 'react';

import { LibraryClient, isUnauthorized } from './api.js';

/** One client for the page's lifetime; the API client itself is stable. */
export function useLibraryClient(): LibraryClient {
  const api = useApiClient();
  return useMemo(() => new LibraryClient(api), [api]);
}

/**
 * A session that has ended must leave the page rather than keep showing what it already loaded — the account may have
 * been disabled, or the session revoked. A full reload re-reads the session, so the sign-in page is what the person
 * lands on; navigating within the running application would keep the stale session in memory.
 */
export function useSessionExpiredRedirect(error: unknown): void {
  useEffect(() => {
    if (isUnauthorized(error)) {
      window.location.assign(resolveAppUrl('/login'));
    }
  }, [error]);
}
