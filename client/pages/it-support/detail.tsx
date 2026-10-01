import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { fetchItTicket, startItTicket } from './api.js';
import { ItTicketStatusBadge } from './status-badge.js';
import {
  type ItTicket,
  type ItTicketCapabilities,
  type ItSupportOutletContext,
  type ItTicketDetailOutletContext,
} from './types.js';

/** Route `/it-support/:ticketId`: the ticket detail drawer. */
export default function ItTicketDetailPage(): ReactElement {
  const { ticketId = '' } = useParams();
  // Key by id so forward/back to another ticket starts the drawer state over.
  return <ItTicketDetail key={ticketId} ticketId={ticketId} />;
}

function ItTicketDetail({
  ticketId,
}: {
  readonly ticketId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  // The list page passes these through <Outlet context>.
  const { reload: reloadList } = useOutletContext<ItSupportOutletContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${ticketId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly ticket?: ItTicket;
    readonly capabilities?: ItTicketCapabilities;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${ticketId}:${reloadCount}`;
    fetchItTicket(api, ticketId, controller.signal).then(
      ({ data, capabilities }) => {
        if (!controller.signal.aborted) {
          setResult({ key, ticket: data, capabilities });
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error });
        // The record is gone, or it is not visible to this identity: the row behind may be stale.
        if (error instanceof ApiClientError && error.status === 404) {
          reloadList();
        }
      },
    );
    return () => controller.abort();
  }, [api, reloadCount, reloadList, ticketId]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;

  // After a start or complete, show the record the endpoint returned immediately.
  const [updated, setUpdated] = useState<ItTicket>();
  const [gone, setGone] = useState(false);

  const notFound = gone || status === 404;
  const ticket = notFound ? undefined : (updated ?? result?.ticket);
  const capabilities = result?.capabilities;

  const outletContext = useMemo<ItTicketDetailOutletContext>(
    () => ({
      onUpdated: (next) => setUpdated(next),
      onNotFound: () => {
        setGone(true);
        reloadList();
      },
      refresh: () => setReloadCount((count) => count + 1),
    }),
    [reloadList],
  );

  let body: ReactElement;
  if (notFound) {
    // An employee opening somebody else's link gets 404, so this is also what hides another person's problem.
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('itSupport.error.notFound')}</AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('itSupport.error.requestFailed')}
        </AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!ticket) {
    body = (
      <div aria-label={t('status.loading')} role='status' className='space-y-3'>
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-4 w-2/3' />
      </div>
    );
  } else {
    body = <ItTicketFields ticket={ticket} />;
  }

  return (
    <RouteDrawer
      title={ticket?.title ?? t('itSupport.detail.title')}
      footer={
        ticket ? (
          <ItTicketActions
            ticket={ticket}
            capabilities={capabilities}
            onUpdated={(next) => {
              setUpdated(next);
              reloadList();
            }}
            onNotFound={outletContext.onNotFound}
          />
        ) : undefined
      }
    >
      {body}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

/** Record actions at the bottom of the drawer; rendered inside it, so `useRouteOverlay` is available. */
function ItTicketActions({
  ticket,
  capabilities,
  onUpdated,
  onNotFound,
}: {
  readonly ticket: ItTicket;
  readonly capabilities?: ItTicketCapabilities;
  readonly onUpdated: (ticket: ItTicket) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const location = useLocation();
  const { close, isClosing } = useRouteOverlay();
  const [starting, setStarting] = useState(false);

  const canStart = capabilities?.start === true && ticket.status === 'pending';
  const canComplete =
    capabilities?.complete === true && ticket.status === 'processing';

  async function start(): Promise<void> {
    setStarting(true);
    try {
      const next = await startItTicket(api, String(ticket.id));
      toaster.show({ type: 'success', title: t('itSupport.start.success') });
      onUpdated(next);
    } catch (caught: unknown) {
      if (caught instanceof ApiClientError && caught.status === 404) {
        onNotFound();
      } else if (caught instanceof ApiClientError && caught.status === 409) {
        toaster.show({
          type: 'error',
          title: t('itSupport.error.invalidState'),
        });
      } else {
        toaster.show({
          type: 'error',
          title: t('itSupport.error.requestFailed'),
        });
      }
    } finally {
      setStarting(false);
    }
  }

  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={isClosing}
        onClick={() => void close()}
      >
        {t('actions.close')}
      </Button>
      {canStart ? (
        <Button
          type='button'
          disabled={starting || isClosing}
          onClick={() => void start()}
        >
          {starting ? <Spinner data-icon='inline-start' /> : null}
          {t('itSupport.start.action')}
        </Button>
      ) : null}
      {canComplete ? (
        <Button
          nativeButton={false}
          render={
            <Link to={{ pathname: 'complete', search: location.search }} />
          }
        >
          {t('itSupport.complete.action')}
        </Button>
      ) : null}
    </>
  );
}

function ItTicketFields({
  ticket,
}: {
  readonly ticket: ItTicket;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const format = (value: string | null): string =>
    value ? dateFormat.format(new Date(value)) : '—';

  return (
    <div className='space-y-4'>
      <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
        <dt className='text-muted-foreground'>
          {t('itSupport.column.status')}
        </dt>
        <dd>
          <ItTicketStatusBadge status={ticket.status} />
        </dd>
        <dt className='text-muted-foreground'>
          {t('itSupport.column.category')}
        </dt>
        <dd>{t(`itSupport.category.${ticket.category}`)}</dd>
        <dt className='text-muted-foreground'>
          {t('itSupport.column.submitter')}
        </dt>
        <dd className='min-w-0 wrap-anywhere'>{ticket.submitterName ?? '—'}</dd>
        <dt className='text-muted-foreground'>
          {t('itSupport.column.handler')}
        </dt>
        <dd className='min-w-0 wrap-anywhere'>{ticket.handlerName ?? '—'}</dd>
        <dt className='text-muted-foreground'>
          {t('itSupport.column.createdAt')}
        </dt>
        <dd>{format(ticket.createdAt)}</dd>
        <dt className='text-muted-foreground'>
          {t('itSupport.field.startedAt')}
        </dt>
        <dd>{format(ticket.startedAt)}</dd>
        <dt className='text-muted-foreground'>
          {t('itSupport.field.completedAt')}
        </dt>
        <dd>{format(ticket.completedAt)}</dd>
      </dl>

      <Separator />

      <section className='space-y-1'>
        <h2 className='text-sm font-medium'>
          {t('itSupport.field.description')}
        </h2>
        <p className='min-w-0 text-sm whitespace-pre-wrap text-muted-foreground wrap-anywhere'>
          {ticket.description?.trim() ? ticket.description : '—'}
        </p>
      </section>

      <section className='space-y-1'>
        <h2 className='text-sm font-medium'>
          {t('itSupport.field.resolution')}
        </h2>
        <p className='min-w-0 text-sm whitespace-pre-wrap text-muted-foreground wrap-anywhere'>
          {ticket.resolution?.trim() ? ticket.resolution : '—'}
        </p>
      </section>
    </div>
  );
}
