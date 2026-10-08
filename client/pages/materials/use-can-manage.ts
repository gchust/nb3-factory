import {
  useAuthorizationClient,
  useAuthorizationRevision,
} from '@nocobase/app-plugin-authorization/client';
import { useEffect, useState } from 'react';

/**
 * Whether the signed-in user may maintain materials. The check is the composite `manage` action both the server and the
 * assistant go through, so the page only ever offers what the server would accept; the endpoint re-checks it anyway.
 */
export function useCanManageMaterials(): boolean {
  const client = useAuthorizationClient();
  const revision = useAuthorizationRevision();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    client
      .can({
        resource: { type: 'composite', id: 'materials' },
        action: 'manage',
      })
      .then(
        (value) => {
          if (active) setAllowed(value);
        },
        () => {
          if (active) setAllowed(false);
        },
      );
    return () => {
      active = false;
    };
  }, [client, revision]);

  return allowed;
}
