import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

import { ItTicketCategoryBadge, ItTicketStatusBadge } from '../status-badge.js';
import {
  IT_TICKETS_RESOURCE,
  type ItTicket,
  type ItRequestsOutletContext,
} from '../types.js';
import { CompleteTicketDialog } from './complete-dialog.js';

/** Route `/it/requests/:ticketId`: the ticket detail drawer. */
export default function TicketDetailPage(): ReactElement {
  const { ticketId = '' } = useParams();
  // Key by id so switching records by browser back/forward starts over.
  return <TicketDetail key={ticketId} ticketId={ticketId} />;
}

function TicketDetail({
  ticketId,
}: {
  readonly ticketId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload: reloadList } = useOutletContext<ItRequestsOutletContext>();

  // Enforced by the endpoint for every read: a ticket the signed-in user may
  // not see comes back as 404, so a guessed id reveals nothing.
  const canHandle = useCan({
    resource: { type: 'composite', id: IT_TICKETS_RESOURCE },
    action: 'handle',
  }).can;

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${ticketId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly ticket?: ItTicket;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${ticketId}:${reloadCount}`;
    api
      .request<{ data: ItTicket }>({
        path: `it/tickets/${encodeURIComponent(ticketId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, ticket: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, error });
          // The row may still be listed behind the drawer, so refresh it.
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

  // Show the record the endpoint returned right after an action, without
  // waiting for a reload.
  const [saved, setSaved] = useState<ItTicket>();

  const notFound = status === 404;
  const ticket = notFound ? undefined : (saved ?? result?.ticket);

  let body: ReactElement;
  if (notFound || status === 403) {
    // No retry: neither a missing ticket nor a forbidden one becomes readable
    // by trying again.
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound ? t('it.error.notFound') : t('it.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('it.error.requestFailed')}</AlertDescription>
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
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-2/3' />
      </div>
    );
  } else {
    body = <TicketFields ticket={ticket} />;
  }

  return (
    <RouteDrawer
      title={ticket?.title ?? t('it.detail.title')}
      // Actions appear only once the record has loaded; a completed ticket has
      // none, because neither transition is allowed from it.
      footer={
        ticket ? (
          <TicketDetailActions
            ticket={ticket}
            canHandle={canHandle}
            onChanged={(updated) => {
              setSaved(updated);
              reloadList();
            }}
            onConflict={() => setReloadCount((count) => count + 1)}
          />
        ) : undefined
      }
    >
      {body}
    </RouteDrawer>
  );
}

/**
 * Transition buttons at the bottom of the drawer. Rendered as the drawer's
 * `footer`, so `useRouteOverlay` is available here. A completed ticket is
 * terminal and shows no action.
 */
function TicketDetailActions({
  ticket,
  canHandle,
  onChanged,
  onConflict,
}: {
  readonly ticket: ItTicket;
  readonly canHandle: boolean;
  readonly onChanged: (ticket: ItTicket) => void;
  readonly onConflict: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [starting, setStarting] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  if (!canHandle || ticket.status === 'completed') {
    return <></>;
  }

  if (ticket.status === 'pending') {
    const start = async (): Promise<void> => {
      setStarting(true);
      try {
        const result = await api.request<{ data: ItTicket }>({
          path: `it/tickets/${encodeURIComponent(String(ticket.id))}`,
          method: 'PATCH',
          json: { action: 'start' },
        });
        toast.add({ type: 'success', title: t('it.detail.startSuccess') });
        onChanged(result.data);
      } catch (error: unknown) {
        const apiError = error instanceof ApiClientError ? error : undefined;
        if (apiError?.status === 409) {
          toast.add({
            type: 'error',
            title: t('it.error.invalidTransition'),
          });
          onConflict();
        } else {
          toast.add({
            type: 'error',
            title:
              apiError?.status === 403
                ? t('it.error.forbidden')
                : t('it.error.requestFailed'),
          });
        }
      } finally {
        setStarting(false);
      }
    };
    return (
      <Button type='button' disabled={starting} onClick={() => void start()}>
        {starting ? <Spinner data-icon='inline-start' /> : null}
        {t('it.detail.start')}
      </Button>
    );
  }

  return (
    <>
      <Button type='button' onClick={() => setCompleteOpen(true)}>
        {t('it.detail.complete')}
      </Button>
      <CompleteTicketDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        ticket={ticket}
        onCompleted={onChanged}
        onConflict={onConflict}
      />
    </>
  );
}

function TicketFields({ ticket }: { readonly ticket: ItTicket }): ReactElement {
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
  const submitted = dateFormat.format(new Date(ticket.createdAt));

  return (
    <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
      <dt className='text-muted-foreground'>{t('it.fields.category')}</dt>
      <dd>
        <ItTicketCategoryBadge category={ticket.category} />
      </dd>
      <dt className='text-muted-foreground'>{t('it.fields.status')}</dt>
      <dd>
        <ItTicketStatusBadge status={ticket.status} />
      </dd>
      <dt className='text-muted-foreground'>{t('it.fields.submitter')}</dt>
      <dd className='min-w-0 wrap-anywhere'>{ticket.submitter?.name ?? '—'}</dd>
      <dt className='text-muted-foreground'>{t('it.fields.handler')}</dt>
      <dd className='min-w-0 wrap-anywhere'>{ticket.handler?.name ?? '—'}</dd>
      <dt className='text-muted-foreground'>{t('it.fields.createdAt')}</dt>
      <dd>{submitted}</dd>
      {ticket.startedAt ? (
        <>
          <dt className='text-muted-foreground'>{t('it.fields.startedAt')}</dt>
          <dd>{dateFormat.format(new Date(ticket.startedAt))}</dd>
        </>
      ) : null}
      {ticket.completedAt ? (
        <>
          <dt className='text-muted-foreground'>
            {t('it.fields.completedAt')}
          </dt>
          <dd>{dateFormat.format(new Date(ticket.completedAt))}</dd>
        </>
      ) : null}
      <dt className='text-muted-foreground'>{t('it.fields.description')}</dt>
      <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
        {ticket.description ?? '—'}
      </dd>
      {ticket.resolution ? (
        <>
          <dt className='text-muted-foreground'>{t('it.fields.resolution')}</dt>
          <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
            {ticket.resolution}
          </dd>
        </>
      ) : null}
    </dl>
  );
}
