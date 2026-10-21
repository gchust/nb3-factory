import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import { Loading } from '#components/loading';

/**
 * How long the authenticated shell waits for the realtime channel before it
 * falls back to the HTTP session.
 *
 * The realtime channel only carries live invalidation; this application's
 * pages read and write through the HTTP API, and `AuthorizationProvider`
 * clears the permission snapshot whenever the session changes. A network that
 * does not carry WebSocket upgrades (a preview proxy, an extension, a strict
 * firewall) must therefore not lock the whole application behind the
 * authentication plugin's ten-second failure screen.
 */
const REALTIME_GRACE_MS = 1_500;

export function SessionPreparation({
  children,
}: PropsWithChildren): ReactElement {
  const { preparation } = useAuthentication();
  const { t } = useTranslation();
  const [graceElapsed, setGraceElapsed] = useState(false);

  useEffect(() => {
    if (preparation !== 'preparing') return;
    const timer = setTimeout(() => setGraceElapsed(true), REALTIME_GRACE_MS);
    return () => clearTimeout(timer);
  }, [preparation]);

  if (preparation === 'ready' || preparation === 'failed' || graceElapsed) {
    return <>{children}</>;
  }

  return <Loading className='min-h-svh' label={t('auth.preparingSession')} />;
}
