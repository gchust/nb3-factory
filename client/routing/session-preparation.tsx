import { realtimeClientToken, useService } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import { Loading } from '#components/loading';
import { Button } from '#components/ui/button';

/**
 * The first identity handshake must invalidate permissions before pages mount.
 *
 * The authentication provider owns the handshake and reports `ready` when its own
 * open notification arrives. This boundary watches the realtime transport as well:
 * a socket that actually opens after the session change proves the same thing, so a
 * notification that was missed (a replaced listener, an open that arrived after the
 * provider stopped listening) cannot leave a reachable application behind the
 * failure screen. Without that fallback the screen blocks a page whose WebSocket is
 * demonstrably working, and Retry only repeats the same missed notification.
 */
export function SessionPreparation({
  children,
}: PropsWithChildren): ReactElement {
  const { preparation, retryPreparation, client, refresh, session } =
    useAuthentication();
  const realtime = useService(realtimeClientToken);
  const { t } = useTranslation();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [openedSession, setOpenedSession] = useState<string | null>(null);

  // Only an open that follows this session counts: a connection kept from the
  // previous identity must not satisfy the new session's preparation.
  const sessionKey = session?.session.id ?? null;
  useEffect(() => {
    if (sessionKey === null) return undefined;
    return realtime.onOpen(() => setOpenedSession(sessionKey));
  }, [realtime, sessionKey]);
  const transportOpen = sessionKey !== null && openedSession === sessionKey;

  if (preparation === 'ready') return <>{children}</>;
  if (preparation === 'preparing') {
    return <Loading className='min-h-svh' label={t('auth.preparingSession')} />;
  }
  if (transportOpen) return <>{children}</>;

  return (
    <section className='grid min-h-svh place-items-center px-6'>
      <div className='w-full max-w-lg space-y-4 text-center'>
        <h1 className='text-xl font-semibold'>{t('auth.connectionFailed')}</h1>
        <p className='text-sm text-muted-foreground'>
          {t('auth.connectionFailedDescription')}
        </p>
        {signOutFailed ? (
          <p role='alert'>{t('account.signOutFailed')}</p>
        ) : null}
        <div className='flex justify-center gap-3'>
          <Button disabled={signingOut} onClick={retryPreparation}>
            {t('auth.retry')}
          </Button>
          <Button
            variant='outline'
            disabled={signingOut}
            onClick={() => {
              void (async () => {
                setSigningOut(true);
                setSignOutFailed(false);
                try {
                  const result = await client.signOut();
                  if (result.error) {
                    setSignOutFailed(true);
                    return;
                  }
                  await refresh();
                } catch {
                  setSignOutFailed(true);
                } finally {
                  setSigningOut(false);
                }
              })();
            }}
          >
            {t(signingOut ? 'account.signingOut' : 'account.signOut')}
          </Button>
        </div>
      </div>
    </section>
  );
}
