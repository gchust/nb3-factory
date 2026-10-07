import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, PlayCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { TicketStatusBadge } from '../status-badge.js';
import type {
  Ticket,
  TicketDetailOutletContext,
  TicketsOutletContext,
} from '../types.js';

const TICKET_RESOURCE = 'tickets';

/** Route `/tickets/:ticketId`: the ticket detail drawer. */
export default function TicketDetailPage(): ReactElement {
  const { ticketId = '' } = useParams();
  // Key by id: when forward or back switches to another record, the drawer's state starts over.
  return <TicketDetail key={ticketId} ticketId={ticketId} />;
}

function TicketDetail({
  ticketId,
}: {
  readonly ticketId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  // The list behind the drawer, through <Outlet context>.
  const { reload: reloadPage } = useOutletContext<TicketsOutletContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${ticketId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly ticket?: Ticket;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort the request when the parameters change or the component unmounts, so an old result never overwrites a new one.
    const controller = new AbortController();
    const key = `${ticketId}:${reloadCount}`;
    api
      .request<{ data: Ticket }>({
        path: `tickets/${encodeURIComponent(ticketId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, ticket: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, error });
          // The record does not exist or is outside this user's scope: the list behind may still show it, so refresh it.
          if (error instanceof ApiClientError && error.status === 404) {
            reloadPage();
          }
        },
      );
    return () => controller.abort();
  }, [api, ticketId, reloadCount, reloadPage]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;

  // After a write is saved, show the record the endpoint returned right away instead of waiting for a reload.
  const [saved, setSaved] = useState<Ticket>();
  // The complete dialog found that the record no longer exists.
  const [gone, setGone] = useState(false);

  const notFound = gone || status === 404;
  const ticket = notFound ? undefined : (saved ?? result?.ticket);

  // The ticket's status moved on behind this view: reload it, and the list behind too.
  const handleStale = useMemo(
    () => () => {
      setReloadCount((count) => count + 1);
      reloadPage();
    },
    [reloadPage],
  );

  // The complete dialog (child route complete) gets these callbacks through <Outlet context>.
  // Keep them stable with useMemo: the dialog's loading effect depends on them.
  const outletContext = useMemo<TicketDetailOutletContext>(
    () => ({
      onUpdated: (updated) => {
        setSaved(updated);
        reloadPage();
      },
      onNotFound: () => {
        setGone(true);
        reloadPage();
      },
      onStale: handleStale,
    }),
    [handleStale, reloadPage],
  );

  let body: ReactElement;
  if (status === 401) {
    body = <SessionExpiredAlert />;
  } else if (notFound || status === 403) {
    // Record not found or no permission: a retry will not succeed either, so only explain the situation.
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('tickets.error.notFound')
            : t('tickets.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('tickets.error.requestFailed')}</AlertDescription>
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
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-3'
      >
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-4 w-2/3' />
      </div>
    );
  } else {
    body = <TicketFields ticket={ticket} />;
  }

  return (
    <RouteDrawer
      title={ticket?.title ?? t('tickets.detail.title')}
      // Show no record actions before the record has loaded or when it does not exist.
      footer={
        ticket ? (
          <TicketDetailActions
            ticket={ticket}
            onUpdated={(updated) => {
              setSaved(updated);
              reloadPage();
            }}
            onStale={handleStale}
          />
        ) : undefined
      }
    >
      {body}
      {/* The complete dialog (child route complete) renders inside the drawer, stacked on it; placed outside the state branches, it is not unmounted when the drawer switches state. */}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

/**
 * The record actions at the bottom of the drawer. The footer renders inside the drawer, so useRouteOverlay() can be
 * called from it. Each action appears only when the ticket's state allows it and the session's grants include it;
 * the server enforces both independently.
 */
function TicketDetailActions({
  ticket,
  onUpdated,
  onStale,
}: {
  readonly ticket: Ticket;
  readonly onUpdated: (ticket: Ticket) => void;
  readonly onStale: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const location = useLocation();
  const { can: canStart, isPending: startPending } = useCan({
    resource: { type: 'composite', id: TICKET_RESOURCE },
    action: 'start',
  });
  const { can: canComplete, isPending: completePending } = useCan({
    resource: { type: 'composite', id: TICKET_RESOURCE },
    action: 'complete',
  });

  const showStart = ticket.status === 'pending' && canStart && !startPending;
  const showComplete =
    ticket.status === 'in_progress' && canComplete && !completePending;

  // A completed ticket offers nothing: no action writes one, so it cannot change.
  if (!showStart && !showComplete) return null;

  return (
    <>
      {showStart ? (
        <StartTicketButton
          ticket={ticket}
          onStarted={onUpdated}
          onStale={onStale}
        />
      ) : null}
      {showComplete ? (
        // Complete is a child route: the button renders as a link that keeps the query parameters.
        <Button
          nativeButton={false}
          render={
            <Link to={{ pathname: 'complete', search: location.search }} />
          }
        >
          {t('tickets.actions.complete')}
        </Button>
      ) : null}
    </>
  );
}

/** "Start handling": a click records the handler, with no form or confirmation. */
function StartTicketButton({
  ticket,
  onStarted,
  onStale,
}: {
  readonly ticket: Ticket;
  readonly onStarted: (ticket: Ticket) => void;
  readonly onStale: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { refresh } = useAuthentication();
  const [pending, setPending] = useState(false);

  async function start(): Promise<void> {
    setPending(true);
    try {
      const result = await api.request<{ data: Ticket }>({
        path: `tickets/${encodeURIComponent(String(ticket.id))}/start`,
        method: 'POST',
      });
      toaster.show({
        type: 'success',
        title: t('tickets.start.success', { title: ticket.title }),
      });
      onStarted(result.data);
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 401) {
        // The session ended: offer to sign in again; the user chooses when.
        toaster.show({
          type: 'error',
          title: t('status.sessionExpired'),
          action: {
            label: t('actions.signInAgain'),
            onClick: () => void refresh(),
          },
        });
      } else if (error instanceof ApiClientError && error.status === 404) {
        toaster.show({
          type: 'error',
          title: t('tickets.error.notFound'),
        });
        onStale();
      } else if (
        error instanceof ApiClientError &&
        error.status === 400 &&
        error.reason === 'TICKET_ALREADY_STARTED'
      ) {
        // Someone else took it over first; show the current state rather than the stale one.
        toaster.show({
          type: 'error',
          title: t('tickets.start.alreadyStarted'),
        });
        onStale();
      } else if (error instanceof ApiClientError && error.status === 403) {
        toaster.show({ type: 'error', title: t('tickets.error.forbidden') });
      } else {
        // Network errors are not ApiClientError and end up here too. Do not show error.message.
        toaster.show({
          type: 'error',
          title: t('tickets.error.requestFailed'),
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Button disabled={pending} onClick={() => void start()}>
      {pending ? (
        <Spinner data-icon='inline-start' />
      ) : (
        <PlayCircleIcon data-icon='inline-start' />
      )}
      {t('tickets.actions.start')}
    </Button>
  );
}

function TicketFields({ ticket }: { readonly ticket: Ticket }): ReactElement {
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
    value === null ? '—' : dateFormat.format(new Date(value));

  return (
    <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
      <dt className='text-muted-foreground'>{t('tickets.fields.status')}</dt>
      <dd>
        <TicketStatusBadge status={ticket.status} />
      </dd>
      <dt className='text-muted-foreground'>{t('tickets.fields.category')}</dt>
      <dd>{t(`tickets.category.${ticket.category}`)}</dd>
      <dt className='text-muted-foreground'>{t('tickets.fields.submitter')}</dt>
      <dd className='min-w-0 wrap-anywhere'>
        {ticket.submitterName ?? ticket.submitterId}
      </dd>
      <dt className='text-muted-foreground'>{t('tickets.fields.handler')}</dt>
      <dd className='min-w-0 wrap-anywhere'>
        {ticket.handlerName ?? ticket.handlerId ?? '—'}
      </dd>
      <dt className='text-muted-foreground'>
        {t('tickets.fields.description')}
      </dt>
      <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
        {ticket.description ?? '—'}
      </dd>
      <dt className='text-muted-foreground'>
        {t('tickets.fields.resolution')}
      </dt>
      <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
        {ticket.resolution ?? '—'}
      </dd>
      <dt className='text-muted-foreground'>{t('tickets.fields.createdAt')}</dt>
      <dd>{format(ticket.createdAt)}</dd>
      <dt className='text-muted-foreground'>{t('tickets.fields.startedAt')}</dt>
      <dd>{format(ticket.startedAt)}</dd>
      <dt className='text-muted-foreground'>
        {t('tickets.fields.completedAt')}
      </dt>
      <dd>{format(ticket.completedAt)}</dd>
    </dl>
  );
}
