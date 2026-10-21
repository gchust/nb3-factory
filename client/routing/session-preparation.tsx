import {
  realtimeClientToken,
  useClientApplication,
} from '@nocobase/app-client';
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

/** How long to wait before retrying a connection the preparation gave up on. */
const AUTO_RETRY_DELAY_MS = 1_500;

/** The first identity handshake must invalidate permissions before pages mount. */
export function SessionPreparation({
  children,
}: PropsWithChildren): ReactElement {
  const { preparation, retryPreparation, client, refresh } =
    useAuthentication();
  const { t } = useTranslation();
  const { services } = useClientApplication();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [autoRetries, setAutoRetries] = useState(0);

  // The authentication provider stops waiting once it reports failure, so a realtime connection that opens after
  // the timeout would leave this screen up until someone presses Retry. Keep listening for that connection, and
  // retry once on our own, so a slow connection returns people to the page they asked for without an extra click.
  // That first retry stays on the loading screen: a connection that was merely late should not look like a failure.
  // Only the retry's own failure is reported, and a connection that opens afterwards still brings the page back.
  useEffect(() => {
    if (preparation !== 'failed') return undefined;
    const realtime = services.has(realtimeClientToken)
      ? services.resolveIfCreated(realtimeClientToken)
      : undefined;
    const unsubscribe = realtime?.onOpen(retryPreparation);
    const timer =
      autoRetries === 0
        ? setTimeout(() => {
            setAutoRetries(1);
            retryPreparation();
          }, AUTO_RETRY_DELAY_MS)
        : undefined;
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      unsubscribe?.();
    };
  }, [autoRetries, preparation, retryPreparation, services]);

  if (preparation === 'ready') return <>{children}</>;
  if (preparation === 'preparing' || autoRetries === 0) {
    return <Loading className='min-h-svh' label={t('auth.preparingSession')} />;
  }

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
          <Button
            disabled={signingOut}
            onClick={() => {
              // A person asking again is owed the outcome, not another silent retry.
              setAutoRetries((count) => Math.max(count, 1));
              retryPreparation();
            }}
          >
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
