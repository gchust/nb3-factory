import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Outlet, useOutletContext, useParams } from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { fetchItTicket } from '../it-ticket-api.js';
import { isSessionExpired } from '../it-ticket-errors.js';
import { SessionExpiredNotice } from '../session-expired-notice.js';
import { ItTicketStatusBadge } from '../status-badge.js';
import {
  type ItTicket,
  type ItTicketDetailOutletContext,
  type ItTicketsOutletContext,
} from '../types.js';
import { ItTicketDetailActions } from './it-ticket-actions.js';

/**
 * One ticket, opened as a `:ticketId` child route of the list.
 *
 * The drawer shows only what the server returned under the reader's own data
 * scope: a ticket that is not theirs, or does not exist, answers 404, and this
 * view says so rather than implying it is hidden.
 */
export default function ItTicketDetailPage(): ReactElement {
  const { ticketId = '' } = useParams();
  // Key by id: switching to another record through the browser's back and
  // forward starts the drawer's state over.
  return <ItTicketDetail key={ticketId} ticketId={ticketId} />;
}

function ItTicketDetail({
  ticketId,
}: {
  readonly ticketId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  // Functions of the page behind the drawer, through <Outlet context>.
  const { reload: reloadPage } = useOutletContext<ItTicketsOutletContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${ticketId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly ticket?: ItTicket;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort when the parameters change or the component unmounts, so an old
    // result never overwrites a new one.
    const controller = new AbortController();
    const key = `${ticketId}:${reloadCount}`;
    fetchItTicket(api, ticketId, controller.signal).then(
      (ticket) => {
        if (!controller.signal.aborted) setResult({ key, ticket });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error });
        // The record is gone, or no longer this account's to see: the page
        // behind may still show it, so refresh that page.
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

  // After a transition succeeds, show the record the endpoint returned right
  // away instead of waiting for a reload.
  const [saved, setSaved] = useState<ItTicket>();
  // The complete dialog found that the record no longer exists.
  const [gone, setGone] = useState(false);

  const notFound = gone || status === 404;
  const ticket = notFound ? undefined : (saved ?? result?.ticket);

  // The complete dialog (child route `complete`) reads these through
  // <Outlet context>. Keep them stable with useMemo: the dialog's effect
  // depends on them.
  const outletContext = useMemo<ItTicketDetailOutletContext>(
    () => ({
      onUpdated: (updated) => {
        setSaved(updated);
        reloadPage();
      },
      onGone: () => {
        setGone(true);
        reloadPage();
      },
      // A refused transition means this drawer is showing a status the server
      // has already moved past, so read the record again.
      onRefresh: () => setReloadCount((count) => count + 1),
    }),
    [reloadPage],
  );

  let body: ReactElement;
  if (isSessionExpired(error)) {
    body = <SessionExpiredNotice />;
  } else if (notFound || status === 403) {
    // Missing or not permitted: a retry will not succeed either, so only
    // explain the situation.
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
    body = <ItTicketFields ticket={ticket} />;
  }

  return (
    <RouteDrawer
      title={ticket?.title ?? t('itTickets.detail.title')}
      // Show no record actions before the record has loaded, or when it no
      // longer exists.
      footer={
        ticket ? (
          <ItTicketDetailActions
            ticket={ticket}
            onUpdated={outletContext.onUpdated}
            onGone={outletContext.onGone}
            onRefresh={outletContext.onRefresh}
          />
        ) : undefined
      }
    >
      {body}
      {/* The complete form (child route `complete`) renders inside the drawer,
          stacked on it; placed outside the state branches, it survives a change
          of the drawer's own state. */}
      <Outlet context={outletContext} />
    </RouteDrawer>
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
  return (
    <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
      <dt className='text-muted-foreground'>{t('itTickets.fields.status')}</dt>
      <dd>
        <ItTicketStatusBadge status={ticket.status} />
      </dd>
      <dt className='text-muted-foreground'>
        {t('itTickets.fields.category')}
      </dt>
      <dd>{t(`itTickets.category.${ticket.category}`)}</dd>
      <dt className='text-muted-foreground'>
        {t('itTickets.fields.submitter')}
      </dt>
      <dd className='min-w-0 wrap-anywhere'>{ticket.submitterName}</dd>
      <dt className='text-muted-foreground'>{t('itTickets.fields.handler')}</dt>
      <dd className='min-w-0 wrap-anywhere'>{ticket.handlerName ?? '—'}</dd>
      <dt className='text-muted-foreground'>
        {t('itTickets.fields.description')}
      </dt>
      {/* Long text without spaces still wraps instead of widening the drawer. */}
      <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
        {ticket.description ?? '—'}
      </dd>
      <dt className='text-muted-foreground'>
        {t('itTickets.fields.createdAt')}
      </dt>
      <dd>{dateFormat.format(new Date(ticket.createdAt))}</dd>
      <dt className='text-muted-foreground'>
        {t('itTickets.fields.startedAt')}
      </dt>
      <dd>
        {ticket.startedAt ? dateFormat.format(new Date(ticket.startedAt)) : '—'}
      </dd>
      <dt className='text-muted-foreground'>
        {t('itTickets.fields.completedAt')}
      </dt>
      <dd>
        {ticket.completedAt
          ? dateFormat.format(new Date(ticket.completedAt))
          : '—'}
      </dd>
      <dt className='text-muted-foreground'>
        {t('itTickets.fields.resolutionNote')}
      </dt>
      <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
        {ticket.resolutionNote ?? '—'}
      </dd>
    </dl>
  );
}
