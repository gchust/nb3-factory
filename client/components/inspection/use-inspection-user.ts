import { useEffect, useState } from 'react';

import { useInspectionApi } from './api.js';
import type { InspectionUser } from './types.js';

export interface InspectionUserState {
  readonly user?: InspectionUser;
  readonly loading: boolean;
  readonly error?: unknown;
}

/**
 * Resolve the signed-in user and their application role. Fetched per mount so
 * a session change is never masked by a cached role.
 */
export function useInspectionUser(): InspectionUserState {
  const api = useInspectionApi();
  const [state, setState] = useState<InspectionUserState>({ loading: true });

  useEffect(() => {
    let active = true;
    api
      .me()
      .then((user) => {
        if (active) setState({ user, loading: false });
      })
      .catch((error: unknown) => {
        if (active) setState({ loading: false, error });
      });
    return () => {
      active = false;
    };
  }, [api]);

  return state;
}
