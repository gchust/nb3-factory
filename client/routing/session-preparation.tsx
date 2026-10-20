import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, type PropsWithChildren, type ReactElement } from 'react';

import { Loading } from '#components/loading';

/**
 * Waits for the first identity handshake, so pages mount with a permission snapshot for the signed-in session.
 *
 * A realtime connection can be unavailable while the HTTP API and the session are healthy: a proxy may block the
 * WebSocket, or the server may be briefly unable to resolve the session when the socket opens. The authorization
 * revision still guards every route and invalidates permissions on later notifications, so an unavailable socket must
 * not lock the user out of an otherwise working application. The handshake therefore falls back to the mounted
 * application with a warning, instead of a fatal screen that only offers retry or sign-out.
 */
export function SessionPreparation({
  children,
}: PropsWithChildren): ReactElement {
  const { preparation, retryPreparation } = useAuthentication();
  const toaster = useToaster();
  const { t } = useTranslation();

  useEffect(() => {
    if (preparation !== 'failed') return;
    const id = 'session-preparation-realtime-unavailable';
    toaster.show({
      id,
      type: 'warning',
      title: t('auth.realtimeUnavailable'),
      description: t('auth.realtimeUnavailableDescription'),
      duration: 0,
      action: {
        label: t('auth.retry'),
        onClick: () => {
          toaster.close(id);
          retryPreparation();
        },
      },
    });
  }, [preparation, retryPreparation, t, toaster]);

  if (preparation === 'preparing') {
    return <Loading className='min-h-svh' label={t('auth.preparingSession')} />;
  }

  return <>{children}</>;
}
