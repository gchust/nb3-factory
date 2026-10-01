import { useCan } from '@nocobase/app-plugin-authorization/client';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { TicketStatusBadge } from '../ticket-status-badge.js';
import type {
  ItTicketDetailOutletContext,
  ItTicketView,
  ItTicketsOutletContext,
} from '../types.js';

/** Route `/it-tickets/:ticketId`: the ticket detail drawer. */
export default function ItTicketDetailPage(): ReactElement {
  const { ticketId = '' } = useParams();
  // Key by id: when forward or back switches to another record, the drawer's state starts over.
  return <ItTicketDetail key={ticketId} ticketId={ticketId} />;
}

function ItTicketDetail({
  ticketId,
}: {
  readonly ticketId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload: reloadList } = useOutletContext<ItTicketsOutletContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${ticketId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly ticket?: ItTicketView;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${ticketId}:${reloadCount}`;
    api
      .request<{ data: ItTicketView }>({
        path: `it-tickets/${encodeURIComponent(ticketId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, ticket: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, error });
          // The ticket disappeared while the list still shows its row, so refresh the list.
          if (error instanceof ApiClientError && error.status === 404) {
            reloadList();
          }
        },
      );
    return () => controller.abort();
  }, [api, ticketId, reloadCount, reloadList]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;

  // A completed action returns the updated ticket; show it right away instead of waiting for a reload.
  const [saved, setSaved] = useState<ItTicketView>();
  const [gone, setGone] = useState(false);

  const notFound = gone || status === 404;
  const ticket = notFound ? undefined : (saved ?? result?.ticket);

  const outletContext = useMemo<ItTicketDetailOutletContext | undefined>(
    () =>
      ticket
        ? {
            ticket,
            onCompleted: (updated) => {
              setSaved(updated);
              reloadList();
            },
            onNotFound: () => {
              setGone(true);
              reloadList();
            },
          }
        : undefined,
    [ticket, reloadList],
  );

  let body: ReactElement;
  if (notFound || status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('itTickets.error.notFound')
            : t('itTickets.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('itTickets.error.requestFailed')}
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
      <div role='status' aria-label={t('status.loading')} className='space-y-3'>
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
      title={ticket?.title ?? t('itTickets.detail.title')}
      footer={
        ticket ? (
          <ItTicketDetailActions
            ticket={ticket}
            onUpdated={(updated) => {
              setSaved(updated);
              reloadList();
            }}
          />
        ) : undefined
      }
    >
      {body}
      {/* The completion dialog renders inside the drawer, stacked on it. Held outside the state branches so an open
          dialog is not unmounted when the drawer switches to "not found". */}
      {outletContext ? <Outlet context={outletContext} /> : null}
    </RouteDrawer>
  );
}

/**
 * Record actions at the bottom of the drawer. The footer renders inside the drawer, so useRouteOverlay() can be
 * called here.
 */
function ItTicketDetailActions({
  ticket,
  onUpdated,
}: {
  readonly ticket: ItTicketView;
  readonly onUpdated: (ticket: ItTicketView) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const location = useLocation();
  const { close } = useRouteOverlay();

  const startAccess = useCan({
    resource: { type: 'composite', id: 'it.tickets' },
    action: 'start',
  });
  const completeAccess = useCan({
    resource: { type: 'composite', id: 'it.tickets' },
    action: 'complete',
  });

  const [starting, setStarting] = useState(false);

  async function start(): Promise<void> {
    if (starting) return;
    setStarting(true);
    try {
      const { data } = await api.request<{ data: ItTicketView }>({
        path: `it-tickets/${encodeURIComponent(ticket.id)}/start`,
        method: 'POST',
      });
      toaster.show({
        type: 'success',
        title: t('itTickets.start.success'),
      });
      onUpdated(data);
    } catch (error) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError && error.status === 403
            ? t('itTickets.error.forbidden')
            : t('itTickets.error.requestFailed'),
      });
    } finally {
      setStarting(false);
    }
  }

  const canStart = startAccess.can && ticket.status === 'pending';
  const canComplete = completeAccess.can && ticket.status === 'in_progress';

  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={starting}
        onClick={() => void close()}
      >
        {t('actions.close')}
      </Button>
      {canStart ? (
        <Button type='button' disabled={starting} onClick={() => void start()}>
          {starting ? <Spinner data-icon='inline-start' /> : null}
          {t('itTickets.start.action')}
        </Button>
      ) : null}
      {canComplete ? (
        <Button
          nativeButton={false}
          render={
            <Link to={{ pathname: 'complete', search: location.search }} />
          }
        >
          {t('itTickets.complete.action')}
        </Button>
      ) : null}
    </>
  );
}

function ItTicketFields({
  ticket,
}: {
  readonly ticket: ItTicketView;
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

  return (
    <dl className='grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-sm'>
      <dt className='text-muted-foreground'>{t('itTickets.fields.status')}</dt>
      <dd>
        <TicketStatusBadge status={ticket.status} />
      </dd>

      <dt className='text-muted-foreground'>
        {t('itTickets.fields.category')}
      </dt>
      <dd>{t(`itTickets.category.${ticket.category}`)}</dd>

      <dt className='text-muted-foreground'>{t('itTickets.fields.owner')}</dt>
      <dd className='min-w-0 wrap-anywhere'>{ticket.ownerName ?? '—'}</dd>

      <dt className='text-muted-foreground'>{t('itTickets.fields.handler')}</dt>
      <dd className='min-w-0 wrap-anywhere'>{ticket.handlerName ?? '—'}</dd>

      <dt className='text-muted-foreground'>
        {t('itTickets.fields.createdAt')}
      </dt>
      <dd>{dateFormat.format(new Date(ticket.createdAt))}</dd>

      {ticket.startedAt ? (
        <>
          <dt className='text-muted-foreground'>
            {t('itTickets.fields.startedAt')}
          </dt>
          <dd>{dateFormat.format(new Date(ticket.startedAt))}</dd>
        </>
      ) : null}

      {ticket.completedAt ? (
        <>
          <dt className='text-muted-foreground'>
            {t('itTickets.fields.completedAt')}
          </dt>
          <dd>{dateFormat.format(new Date(ticket.completedAt))}</dd>
        </>
      ) : null}

      <dt className='text-muted-foreground'>
        {t('itTickets.fields.description')}
      </dt>
      <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
        {ticket.description}
      </dd>

      {ticket.resolution ? (
        <>
          <dt className='text-muted-foreground'>
            {t('itTickets.fields.resolution')}
          </dt>
          <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
            {ticket.resolution}
          </dd>
        </>
      ) : null}
    </dl>
  );
}
