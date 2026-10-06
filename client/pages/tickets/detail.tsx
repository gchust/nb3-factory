import { useApiClient, useToaster } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { Loading } from '@/components/loading';
import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

import { completeTicket, errorKey, fetchTicket, startTicket } from './api.js';
import { TicketCategoryBadge, TicketStatusBadge } from './ticket-badges.js';
import { ticketResource, type TicketDto } from './types.js';

interface TicketsOutletContext {
  readonly reload: () => void | Promise<void>;
}

/**
 * The ticket detail drawer, reached from the list or a direct link.
 *
 * The server decides whether the ticket is visible: a request for somebody
 * else's ticket under an employee's own-scope grant answers `TICKET_NOT_FOUND`,
 * which this page renders as "not found" without confirming that the ticket
 * exists. Start and complete are offered only when the permission snapshot
 * allows them, and the server enforces the workflow state regardless.
 */
export default function TicketDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { session } = useAuthentication();
  const { ticketId } = useParams<{ ticketId: string }>();
  const outlet = useOutletContext<TicketsOutletContext | undefined>();

  const [ticket, setTicket] = useState<TicketDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [resolution, setResolution] = useState('');

  const { can: canStart } = useCan({
    resource: ticketResource(),
    action: 'start',
  });
  const { can: canComplete } = useCan({
    resource: ticketResource(),
    action: 'complete',
  });

  useEffect(() => {
    if (!ticketId) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const data = await fetchTicket(api, ticketId);
        if (!active) {
          return;
        }
        setTicket(data);
        setFailure(null);
      } catch (error) {
        if (!active) {
          return;
        }
        setFailure(errorKey(error));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [api, ticketId]);

  const failureKey =
    failure ?? (ticketId ? null : 'tickets.errors.TICKET_NOT_FOUND');

  const refresh = async (): Promise<void> => {
    await outlet?.reload();
  };

  const runAction = async (action: () => Promise<TicketDto>): Promise<void> => {
    setWorking(true);
    try {
      const updated = await action();
      setTicket(updated);
      await refresh();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('tickets.actionFailed'),
        description: t(errorKey(error)),
      });
    } finally {
      setWorking(false);
    }
  };

  let footer: ReactElement | null = null;
  if (ticket) {
    const isHandler = ticket.handlerId === session?.user.id;
    const canStartNow = canStart && ticket.status === 'pending';
    const canCompleteNow =
      canComplete && ticket.status === 'processing' && isHandler;
    footer = (
      <>
        {canStartNow ? (
          <Button
            disabled={working}
            onClick={() => void runAction(() => startTicket(api, ticket.id))}
          >
            {t('tickets.action.start')}
          </Button>
        ) : null}
        {canCompleteNow && !completing ? (
          <Button disabled={working} onClick={() => setCompleting(true)}>
            {t('tickets.action.complete')}
          </Button>
        ) : null}
        {canCompleteNow && completing ? (
          <>
            <Button
              variant='outline'
              disabled={working}
              onClick={() => setCompleting(false)}
            >
              {t('tickets.action.cancel')}
            </Button>
            <Button
              disabled={working || resolution.trim().length === 0}
              onClick={() =>
                void runAction(() =>
                  completeTicket(api, ticket.id, resolution.trim()),
                ).then(() => setCompleting(false))
              }
            >
              {t('tickets.action.confirmComplete')}
            </Button>
          </>
        ) : null}
      </>
    );
  }

  return (
    <RouteDrawer
      title={ticket ? ticket.title : t('tickets.detailTitle')}
      description={
        ticket
          ? t('tickets.detailDescription', { name: ticket.submitterName })
          : undefined
      }
      footer={footer}
    >
      {loading && !failureKey ? (
        <Loading className='py-24' />
      ) : failureKey ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('tickets.notFoundTitle')}</AlertTitle>
          <AlertDescription>
            {t(failureKey, { defaultValue: t('tickets.notFoundDescription') })}
          </AlertDescription>
        </Alert>
      ) : ticket ? (
        <div className='space-y-5'>
          <div className='flex flex-wrap items-center gap-2'>
            <TicketStatusBadge status={ticket.status} />
            <TicketCategoryBadge category={ticket.category} />
          </div>

          <dl className='grid grid-cols-2 gap-4 text-sm'>
            <Detail
              label={t('tickets.field.submitter')}
              value={ticket.submitterName}
            />
            <Detail
              label={t('tickets.field.handler')}
              value={ticket.handlerName ?? t('tickets.unassigned')}
            />
            <Detail
              label={t('tickets.field.createdAt')}
              value={formatDateTime(ticket.createdAt)}
            />
            <Detail
              label={t('tickets.field.startedAt')}
              value={ticket.startedAt ? formatDateTime(ticket.startedAt) : '—'}
            />
            <Detail
              label={t('tickets.field.completedAt')}
              value={
                ticket.completedAt ? formatDateTime(ticket.completedAt) : '—'
              }
            />
          </dl>

          <Separator />

          <section className='space-y-2'>
            <h2 className='text-sm font-medium'>
              {t('tickets.field.description')}
            </h2>
            <p className='text-sm whitespace-pre-wrap text-muted-foreground'>
              {ticket.description || '—'}
            </p>
          </section>

          {ticket.resolution ? (
            <section className='space-y-2'>
              <h2 className='text-sm font-medium'>
                {t('tickets.field.resolution')}
              </h2>
              <p className='text-sm whitespace-pre-wrap text-muted-foreground'>
                {ticket.resolution}
              </p>
            </section>
          ) : null}

          {completing ? (
            <Field>
              <FieldLabel htmlFor='ticket-resolution'>
                {t('tickets.field.resolution')}
              </FieldLabel>
              <Textarea
                id='ticket-resolution'
                rows={4}
                maxLength={5000}
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                placeholder={t('tickets.resolutionPlaceholder')}
              />
            </Field>
          ) : null}
        </div>
      ) : null}
    </RouteDrawer>
  );
}

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='font-medium'>{value}</dd>
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
