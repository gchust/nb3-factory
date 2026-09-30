import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { ResolutionForm } from '../resolution-form.js';
import { TicketStatusBadge } from '../status-badge.js';
import type { Ticket, TicketsOutletContext } from '../types.js';

/** The composite business operation the server registers; start and complete are checked against it. */
const TICKETS_RESOURCE = { type: 'composite', id: 'it.tickets' } as const;

const RESOLUTION_FORM_ID = 'ticket-resolution-form';

/** Route `/tickets/:ticketId`: the ticket detail drawer. */
export default function TicketDetailPage(): ReactElement {
  const { ticketId = '' } = useParams();
  // Key by id: switching records starts the state over.
  return <TicketDetail key={ticketId} ticketId={ticketId} />;
}

function TicketDetail({
  ticketId,
}: {
  readonly ticketId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload: reloadList } = useOutletContext<TicketsOutletContext>();
  // Feature visibility, not record scope: a handler holds these actions, an employee does not.
  const startPermission = useCan({
    resource: TICKETS_RESOURCE,
    action: 'start',
  });
  const completePermission = useCan({
    resource: TICKETS_RESOURCE,
    action: 'complete',
  });

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${ticketId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly ticket?: Ticket;
    readonly error?: unknown;
  }>();
  // After an action, show the ticket the endpoint returned at once instead of waiting for a reload.
  const [saved, setSaved] = useState<Ticket>();
  // The resolution form is submitting; the footer submit button reflects it.
  const [resolutionSubmitting, setResolutionSubmitting] = useState(false);
  const resolutionSubmittingRef = useRef(false);
  const handleResolutionSubmitting = (value: boolean): void => {
    resolutionSubmittingRef.current = value;
    setResolutionSubmitting(value);
  };

  useEffect(() => {
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
          // The ticket no longer exists, or it belongs to someone else: refresh the list behind.
          if (
            error instanceof ApiClientError &&
            (error.status === 404 || error.status === 403)
          ) {
            reloadList();
          }
        },
      );
    return () => controller.abort();
  }, [api, ticketId, reloadCount, reloadList]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const notFound = status === 404 || status === 403;
  const ticket = notFound ? undefined : (saved ?? result?.ticket);

  const handleUpdated = (updated: Ticket): void => {
    setSaved(updated);
    reloadList();
  };

  const canStart = startPermission.can && ticket?.status === 'pending';
  const canComplete =
    completePermission.can && ticket?.status === 'in_progress';

  let body: ReactElement;
  if (notFound) {
    // Not found and not permitted are the same answer: an employee never learns that somebody else's ticket exists.
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('tickets.error.notFound')}</AlertDescription>
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
      <div role='status' aria-label={t('status.loading')} className='space-y-3'>
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-4 w-2/3' />
      </div>
    );
  } else {
    body = (
      <div className='space-y-6'>
        <TicketFields ticket={ticket} />
        {canComplete ? (
          <ResolutionForm
            ticketId={ticket.id}
            formId={RESOLUTION_FORM_ID}
            onSubmittingChange={handleResolutionSubmitting}
            onCompleted={handleUpdated}
          />
        ) : null}
      </div>
    );
  }

  let footer: ReactElement | undefined;
  if (canStart && ticket) {
    footer = <StartTicketButton ticket={ticket} onStarted={handleUpdated} />;
  } else if (canComplete) {
    footer = (
      <Button
        type='submit'
        form={RESOLUTION_FORM_ID}
        disabled={resolutionSubmitting}
      >
        {resolutionSubmitting ? <Spinner data-icon='inline-start' /> : null}
        {resolutionSubmitting
          ? t('tickets.resolve.submitting')
          : t('tickets.resolve.action')}
      </Button>
    );
  }

  return (
    <RouteDrawer
      title={ticket?.title ?? t('tickets.detail.title')}
      beforeClose={() => !resolutionSubmittingRef.current}
      footer={footer}
    >
      {body}
    </RouteDrawer>
  );
}

/** "Start handling": a single click changes the status; the button owns its pending state. */
function StartTicketButton({
  ticket,
  onStarted,
}: {
  readonly ticket: Ticket;
  readonly onStarted: (ticket: Ticket) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [pending, setPending] = useState(false);

  async function start(): Promise<void> {
    setPending(true);
    try {
      const { data } = await api.request<{ data: Ticket }>({
        path: `tickets/${encodeURIComponent(String(ticket.id))}/start`,
        method: 'POST',
      });
      toaster.show({ type: 'success', title: t('tickets.start.success') });
      onStarted(data);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 403) {
        toaster.show({ type: 'error', title: t('tickets.error.forbidden') });
      } else if (apiError?.status === 404) {
        toaster.show({ type: 'error', title: t('tickets.error.notFound') });
      } else if (apiError?.status === 409) {
        toaster.show({
          type: 'error',
          title: t('tickets.error.stateConflict'),
        });
      } else {
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
      {pending ? <Spinner data-icon='inline-start' /> : null}
      {pending ? t('tickets.start.pending') : t('tickets.start.action')}
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
  const empty = <span className='text-muted-foreground'>—</span>;

  return (
    <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
      <dt className='text-muted-foreground'>{t('tickets.fields.status')}</dt>
      <dd>
        <TicketStatusBadge status={ticket.status} />
      </dd>
      <dt className='text-muted-foreground'>{t('tickets.fields.category')}</dt>
      <dd>{t(`tickets.category.${ticket.category}`)}</dd>
      <dt className='text-muted-foreground'>{t('tickets.fields.submitter')}</dt>
      <dd className='min-w-0 wrap-anywhere'>{ticket.submitterName ?? empty}</dd>
      <dt className='text-muted-foreground'>{t('tickets.fields.handler')}</dt>
      <dd className='min-w-0 wrap-anywhere'>{ticket.handlerName ?? empty}</dd>
      <dt className='text-muted-foreground'>{t('tickets.fields.createdAt')}</dt>
      <dd>{dateFormat.format(new Date(ticket.createdAt))}</dd>
      <dt className='text-muted-foreground'>{t('tickets.fields.handledAt')}</dt>
      <dd>
        {ticket.handledAt
          ? dateFormat.format(new Date(ticket.handledAt))
          : empty}
      </dd>
      <dt className='text-muted-foreground'>
        {t('tickets.fields.description')}
      </dt>
      <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
        {ticket.description || empty}
      </dd>
      <dt className='text-muted-foreground'>
        {t('tickets.fields.resolution')}
      </dt>
      <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
        {ticket.resolution || empty}
      </dd>
    </dl>
  );
}
