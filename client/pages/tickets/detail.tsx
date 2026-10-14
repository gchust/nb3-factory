import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CheckIcon, PaperclipIcon, SendIcon, WrenchIcon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router';

import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button, buttonVariants } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Skeleton } from '#components/ui/skeleton';

import { fireTicket, getTicket } from './api.js';
import { TicketStatusBadge, UrgencyBadge } from './labels.js';
import type { Ticket, TicketDetailOutletContext } from './types.js';

/** The transitions that collect their input in a dialog; the others fire straight from the page. */
const DIALOG_TRANSITIONS = new Set([
  'assign',
  'reassign',
  'progress',
  'resolve',
  'return',
]);

const TRANSITION_LABEL_KEYS: Record<string, string> = {
  assign: 'tickets.transition.assign',
  reassign: 'tickets.transition.reassign',
  progress: 'tickets.transition.progress',
  resolve: 'tickets.transition.resolve',
  confirm: 'tickets.transition.confirm',
  return: 'tickets.transition.return',
  remind: 'tickets.transition.remind',
};

export default function TicketDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const params = useParams<{ ticketId: string }>();
  const ticketId = Number(params.ticketId);
  const invalidId = !Number.isFinite(ticketId) || ticketId <= 0;
  const [ticket, setTicket] = useState<Ticket>();
  const [error, setError] = useState<string>();
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const result = await getTicket(api, ticketId);
        if (!cancelled) setTicket(result);
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof ApiClientError && caught.status === 404) {
          setNotFound(true);
        } else {
          setError(
            caught instanceof ApiClientError
              ? caught.message
              : t('tickets.error.load'),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, ticketId, reloadCount, t]);

  const runDirect = async (transition: string): Promise<void> => {
    if (!ticket) return;
    setBusy(true);
    try {
      await fireTicket(api, ticket.id, transition, undefined);
      toaster.show({
        type: 'success',
        title: t('tickets.action.success'),
      });
      reload();
    } catch (caught) {
      toaster.show({
        type: 'error',
        title:
          caught instanceof ApiClientError
            ? caught.message
            : t('tickets.action.failed'),
      });
    } finally {
      setBusy(false);
    }
  };

  if (invalidId || notFound) {
    return (
      <PageContainer className='mx-auto max-w-4xl'>
        <BackButton />
        <PageHeader title={t('tickets.detail.notFound')} />
        <Link to='/tickets' className={buttonVariants({ variant: 'outline' })}>
          {t('tickets.detail.backToList')}
        </Link>
      </PageContainer>
    );
  }

  if (!ticket) {
    return (
      <PageContainer className='mx-auto max-w-4xl'>
        <Skeleton className='h-10 w-1/2' />
        <Skeleton className='h-40 w-full' />
        <Skeleton className='h-40 w-full' />
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </PageContainer>
    );
  }

  const allowedNames = new Set(
    ticket.available.filter((item) => item.allowed).map((item) => item.name),
  );
  const blockerFor = (name: string): string | undefined => {
    const entry = ticket.available.find((item) => item.name === name);
    if (!entry) return t('tickets.action.wrongState');
    if (entry.allowed) return undefined;
    return entry.blockers.length
      ? entry.blockers.join(', ')
      : t('tickets.action.wrongState');
  };

  const actions = ticket.canFire.filter(
    (name) => DIALOG_TRANSITIONS.has(name) || name === 'confirm',
  );

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <BackButton />
      <PageHeader
        title={`#${ticket.id} ${ticket.title}`}
        description={
          <span className='flex flex-wrap items-center gap-2'>
            <TicketStatusBadge status={ticket.status} />
            <UrgencyBadge urgency={ticket.urgency} />
          </span>
        }
        actions={
          actions.length ? (
            <div className='flex flex-wrap gap-2'>
              {actions.map((name) =>
                name === 'confirm' ? (
                  <Button
                    key={name}
                    disabled={busy || !allowedNames.has(name)}
                    title={blockerFor(name)}
                    onClick={() => void runDirect(name)}
                  >
                    <CheckIcon data-icon='inline-start' />
                    {t('tickets.transition.confirm')}
                  </Button>
                ) : (
                  <Link
                    key={name}
                    to={name}
                    className={buttonVariants({
                      variant: name === 'resolve' ? 'default' : 'outline',
                    })}
                    aria-disabled={!allowedNames.has(name)}
                    title={blockerFor(name)}
                    onClick={(event) => {
                      if (!allowedNames.has(name)) event.preventDefault();
                    }}
                  >
                    {t(TRANSITION_LABEL_KEYS[name] ?? name)}
                  </Link>
                ),
              )}
            </div>
          ) : null
        }
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('tickets.field.description')}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4 text-sm'>
          <p className='whitespace-pre-line'>{ticket.description}</p>
          <dl className='grid gap-x-6 gap-y-2 text-xs text-muted-foreground sm:grid-cols-2'>
            <Meta label={t('tickets.field.reporter')}>
              {ticket.reporterName ?? ticket.reporterId}
            </Meta>
            <Meta label={t('tickets.field.assignee')}>
              {ticket.assigneeName ?? t('tickets.field.unassigned')}
            </Meta>
            <Meta label={t('tickets.field.createdAt')}>
              {new Date(ticket.createdAt).toLocaleString()}
            </Meta>
            <Meta label={t('tickets.field.statusChangedAt')}>
              {new Date(ticket.statusChangedAt).toLocaleString()}
            </Meta>
          </dl>
        </CardContent>
      </Card>

      {ticket.attachments.length ? (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <PaperclipIcon className='size-4' aria-hidden />
              {t('tickets.field.screenshots')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className='flex flex-wrap gap-3'>
              {ticket.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <a
                    href={attachment.contentUrl}
                    target='_blank'
                    rel='noreferrer'
                    className='block overflow-hidden rounded-lg border border-border'
                  >
                    {attachment.mimeType.startsWith('image/') ? (
                      <img
                        src={attachment.contentUrl}
                        alt={attachment.filename}
                        className='h-32 w-48 object-cover'
                      />
                    ) : (
                      <span className='flex h-32 w-48 items-center justify-center px-3 text-center text-xs text-muted-foreground'>
                        {attachment.filename}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <WrenchIcon className='size-4' aria-hidden />
            {t('tickets.field.handling')}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4 text-sm'>
          <div>
            <p className='text-xs font-medium text-muted-foreground'>
              {t('tickets.field.handlingNote')}
            </p>
            <p className='whitespace-pre-line'>
              {ticket.handlingNote ?? t('tickets.field.empty')}
            </p>
          </div>
          <div>
            <p className='text-xs font-medium text-muted-foreground'>
              {t('tickets.field.solution')}
            </p>
            <p className='whitespace-pre-line'>
              {ticket.solution ?? t('tickets.field.empty')}
            </p>
          </div>
          {ticket.lastReturnReason ? (
            <div>
              <p className='text-xs font-medium text-muted-foreground'>
                {t('tickets.field.lastReturnReason')}
              </p>
              <p className='whitespace-pre-line'>{ticket.lastReturnReason}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <SendIcon className='size-4' aria-hidden />
            {t('tickets.field.history')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className='flex flex-col gap-3 text-sm'>
            {ticket.history.map((entry) => (
              <li
                key={entry.version}
                className='flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 border-border pl-3'
              >
                <span className='font-medium'>
                  {t(
                    TRANSITION_LABEL_KEYS[entry.transition] ?? entry.transition,
                  )}
                </span>
                <span className='text-xs text-muted-foreground'>
                  {entry.from ?? '—'} → {entry.to}
                </span>
                <span className='text-xs text-muted-foreground'>
                  {new Date(entry.at).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Outlet
        context={{ ticket, reload } satisfies TicketDetailOutletContext}
      />
    </PageContainer>
  );
}

function Meta({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col gap-0.5'>
      <dt className='font-medium'>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
