import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeftIcon, ShieldAlertIcon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { completeTicket, fetchTicket, startTicket } from './api.js';
import { TicketDetail } from './ticket-detail.js';
import type { Ticket, TicketMeta } from './types.js';

interface LoadedTicket {
  readonly ticket: Ticket;
  readonly meta: TicketMeta;
}

interface DetailState {
  /** The ticket and reload token the payload belongs to, so a stale response is dropped. */
  readonly key: string;
  readonly loaded?: LoadedTicket;
  readonly error?: unknown;
}

/**
 * Loads one ticket, keyed by the requested id and reload token.
 *
 * The response is stored together with the key it answers, so a slow reply to
 * a superseded request cannot overwrite newer data, and nothing is written to
 * state synchronously from the effect body.
 */
function useTicketDetail(
  ticketId: string,
  reloadToken: number,
): DetailState & {
  readonly loading: boolean;
  readonly apply: (loaded: LoadedTicket) => void;
} {
  const api = useApiClient();
  const key = `${ticketId}:${reloadToken}`;
  const [state, setState] = useState<DetailState>({ key });

  useEffect(() => {
    if (!ticketId) return;
    const controller = new AbortController();
    void fetchTicket(api, ticketId, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setState({ key, loaded: { ticket: result.data, meta: result.meta } });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, ticketId, key]);

  return {
    ...state,
    loading: Boolean(ticketId) && state.key !== key,
    // Adopt the payload a start/complete call just returned, so the page
    // reflects the new status without a second round trip.
    apply: (loaded) => setState({ key, loaded }),
  };
}

export default function TicketDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { ticketId = '' } = useParams<{ ticketId: string }>();

  const [reloadToken, setReloadToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const { loading, loaded, error, apply } = useTicketDetail(
    ticketId,
    reloadToken,
  );

  const reportActionError = useCallback(
    (cause: unknown, fallbackKey: string): void => {
      const message =
        cause instanceof ApiClientError && cause.message
          ? cause.message
          : t(fallbackKey);
      toaster.show({ type: 'error', title: message });
      // Somebody else may have moved the ticket on since it was loaded; ask
      // the server for the truth again instead of trusting the local copy.
      setReloadToken((token) => token + 1);
    },
    [toaster, t],
  );

  async function handleStart(): Promise<void> {
    if (!loaded) return;
    setBusy(true);
    try {
      const result = await startTicket(api, loaded.ticket.id);
      apply({ ticket: result.data, meta: result.meta });
      toaster.show({ type: 'success', title: t('tickets.detail.started') });
    } catch (cause) {
      reportActionError(cause, 'tickets.detail.startFailed');
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete(resolution: string): Promise<void> {
    if (!loaded) return;
    setBusy(true);
    try {
      const result = await completeTicket(api, loaded.ticket.id, resolution);
      apply({ ticket: result.data, meta: result.meta });
      toaster.show({ type: 'success', title: t('tickets.detail.completed') });
    } catch (cause) {
      reportActionError(cause, 'tickets.detail.completeFailed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <Button
        render={<Link to='/tickets' />}
        variant='ghost'
        size='sm'
        className='-ml-2 w-fit'
      >
        <ArrowLeftIcon data-icon='inline-start' />
        {t('tickets.detail.back')}
      </Button>

      {loading ? (
        <div className='space-y-4'>
          <Skeleton className='h-8 w-64' />
          <Skeleton className='h-40 w-full' />
        </div>
      ) : !loaded ? (
        <Alert variant='destructive'>
          <ShieldAlertIcon />
          <AlertTitle>
            {error instanceof ApiClientError && error.status === 403
              ? t('tickets.detail.forbiddenTitle')
              : t('tickets.detail.notFoundTitle')}
          </AlertTitle>
          <AlertDescription className='space-y-3'>
            <p>
              {error instanceof ApiClientError && error.message
                ? error.message
                : t('tickets.detail.notFoundHint')}
            </p>
            <Button render={<Link to='/tickets' />} variant='outline' size='sm'>
              {t('tickets.detail.backToList')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <PageHeader
            title={loaded.ticket.title}
            description={loaded.ticket.reference}
          />
          <TicketDetail
            ticket={loaded.ticket}
            meta={loaded.meta}
            busy={busy}
            onStart={handleStart}
            onComplete={handleComplete}
          />
        </>
      )}
    </PageContainer>
  );
}
