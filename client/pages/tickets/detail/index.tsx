import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDrawer } from '#components/route-drawer';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';

import { fetchTicket } from '../api.js';
import type { TicketsOutletContext } from '../context.js';
import type { TicketDetail as TicketDetailData } from '../types.js';
import { TicketActions } from './ticket-actions.js';
import { TicketFields } from './ticket-fields.js';

/** Routes `/tickets/:ticketId` and any child route that opens a ticket: the detail drawer. */
export default function TicketDetailPage(): ReactElement {
  const { ticketId = '' } = useParams();
  // Key by id, so forward or back to another ticket starts the drawer's state over.
  return <TicketDetail key={ticketId} ticketId={Number(ticketId)} />;
}

function TicketDetail({
  ticketId,
}: {
  readonly ticketId: number;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload: reloadList } = useOutletContext<TicketsOutletContext>();
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${ticketId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly detail?: TicketDetailData;
    readonly error?: unknown;
  }>();
  // After an action the endpoint returns the updated detail; show it without waiting for a reload.
  const [saved, setSaved] = useState<TicketDetailData>();

  useEffect(() => {
    if (!Number.isInteger(ticketId) || ticketId <= 0) return;
    const controller = new AbortController();
    const key = requestKey;
    fetchTicket(api, ticketId).then(
      (detail) => {
        if (!controller.signal.aborted) setResult({ key, detail });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error });
        // The record no longer exists: refresh the list behind the drawer.
        if (error instanceof ApiClientError && error.status === 404) {
          reloadList();
        }
      },
    );
    return () => controller.abort();
  }, [api, ticketId, requestKey, reloadList]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const notFound =
    !Number.isInteger(ticketId) || ticketId <= 0 || status === 404;
  const detail = notFound || loading ? undefined : (saved ?? result?.detail);

  let body: ReactElement;
  if (loading) {
    body = (
      <div
        role='status'
        aria-label={t('tickets.detail.loading')}
        className='flex flex-col gap-4'
      >
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-20 w-full' />
        <Skeleton className='h-4 w-1/2' />
      </div>
    );
  } else if (notFound) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('tickets.detail.notFound')}</AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {status === 403
            ? t('tickets.detail.forbidden')
            : t('tickets.detail.error')}
        </AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('actions.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (detail) {
    body = <TicketFields detail={detail} />;
  } else {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('tickets.detail.error')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <RouteDrawer
      title={
        detail
          ? `#${detail.ticket.id} · ${detail.ticket.title}`
          : t('tickets.detail.title')
      }
      footer={
        detail ? (
          <TicketActions
            detail={detail}
            onChanged={(updated) => {
              setSaved(updated);
              reloadList();
            }}
          />
        ) : undefined
      }
    >
      {body}
    </RouteDrawer>
  );
}
