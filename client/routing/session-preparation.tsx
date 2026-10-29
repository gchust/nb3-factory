import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useAuthorizationClient } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import { Loading } from '#components/loading';

/**
 * Realtime readiness is an optimization for live updates, not a prerequisite for an authenticated HTTP session.
 * Waiting forever would turn a client-side socket failure into a total outage, so the application continues after
 * this grace period and the service provider keeps retrying the connection in the background.
 */
export const SESSION_PREPARATION_GRACE_MS = 3_000;

/** The first identity handshake invalidates permissions before pages mount. */
export function SessionPreparation({
  children,
}: PropsWithChildren): ReactElement {
  const { preparation, session } = useAuthentication();
  const authorization = useAuthorizationClient();
  const { t } = useTranslation();
  const sessionKey = session ? `${session.user.id}:${session.session.id}` : '';
  const [grace, setGrace] = useState({ sessionKey: '', elapsed: false });

  useEffect(() => {
    if (preparation !== 'preparing') return;
    const timer = setTimeout(() => {
      console.warn(
        'Realtime session preparation did not finish in time; continuing with HTTP authorization.',
      );
      // Entering without the realtime identity handshake still must not reuse the previous session's snapshot.
      authorization.invalidate();
      setGrace({ sessionKey, elapsed: true });
    }, SESSION_PREPARATION_GRACE_MS);
    return () => clearTimeout(timer);
  }, [authorization, preparation, sessionKey]);

  // A provider timeout is already later than the grace period; the application must not stay blocked on it.
  const entered =
    preparation === 'ready' ||
    preparation === 'failed' ||
    (grace.elapsed && grace.sessionKey === sessionKey);
  if (!entered) {
    return <Loading className='min-h-svh' label={t('auth.preparingSession')} />;
  }
  return <>{children}</>;
}
