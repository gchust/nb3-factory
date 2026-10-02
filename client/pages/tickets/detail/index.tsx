import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { format } from 'date-fns';
import { CircleCheckIcon, ClockIcon, PlayIcon } from 'lucide-react';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteChildPage } from '@/components/route-child-page';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import type { TicketsOutletContext } from '../index.js';
import { completeTicket, fetchTicket, startTicket } from '../ticket-api.js';
import { STATUS_BADGE, type Ticket } from '../types.js';

function DetailRow({
  label,
  children,
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='grid gap-1'>
      <dt className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
        {label}
      </dt>
      <dd className='text-sm'>{children}</dd>
    </div>
  );
}

function formatMoment(value: string | null): string {
  return value ? format(new Date(value), 'PPp') : '—';
}

export default function TicketDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { ticketId } = useParams();
  const { reload } = useOutletContext<TicketsOutletContext>();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [resolution, setResolution] = useState('');
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketId) return undefined;
    let active = true;
    fetchTicket(api, ticketId)
      .then((data) => {
        if (!active) return;
        setTicket(data);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, ticketId]);

  const start = (): void => {
    if (!ticket) return;
    setBusy(true);
    startTicket(api, ticket.id)
      .then((updated) => {
        setTicket(updated);
        reload();
        toaster.show({ type: 'success', title: t('tickets.detail.started') });
      })
      .catch(() => {
        toaster.show({ type: 'error', title: t('tickets.detail.startFailed') });
      })
      .finally(() => setBusy(false));
  };

  const complete = (): void => {
    if (!ticket) return;
    if (!resolution.trim()) {
      setResolutionError(t('tickets.complete.required'));
      return;
    }
    setBusy(true);
    completeTicket(api, ticket.id, resolution.trim())
      .then((updated) => {
        setTicket(updated);
        setCompleting(false);
        setResolution('');
        reload();
        toaster.show({ type: 'success', title: t('tickets.detail.completed') });
      })
      .catch(() => {
        toaster.show({
          type: 'error',
          title: t('tickets.detail.completeFailed'),
        });
      })
      .finally(() => setBusy(false));
  };

  if (loading) {
    return (
      <RouteChildPage>
        <PageContainer>
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Spinner />
            {t('tickets.loading')}
          </div>
        </PageContainer>
      </RouteChildPage>
    );
  }

  if (failed) {
    return (
      <RouteChildPage>
        <PageContainer>
          <Alert variant='destructive'>
            <AlertTitle>{t('tickets.error.title')}</AlertTitle>
            <AlertDescription>{t('tickets.error.reload')}</AlertDescription>
          </Alert>
        </PageContainer>
      </RouteChildPage>
    );
  }

  if (!ticket) {
    return (
      <RouteChildPage>
        <PageContainer>
          <Alert>
            <AlertTitle>{t('tickets.detail.notFoundTitle')}</AlertTitle>
            <AlertDescription>{t('tickets.detail.notFound')}</AlertDescription>
          </Alert>
        </PageContainer>
      </RouteChildPage>
    );
  }

  return (
    <RouteChildPage>
      <PageContainer>
        <PageHeader
          title={ticket.title}
          description={t(`tickets.category.${ticket.category}`)}
          actions={
            <Badge variant={STATUS_BADGE[ticket.status]}>
              {t(`tickets.status.${ticket.status}`)}
            </Badge>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>{t('tickets.detail.overview')}</CardTitle>
            <CardDescription>
              {t('tickets.detail.overviewDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className='grid gap-4 sm:grid-cols-2'>
              <DetailRow label={t('tickets.columns.submitter')}>
                {ticket.submitterName}
              </DetailRow>
              <DetailRow label={t('tickets.columns.handler')}>
                {ticket.handlerName ?? '—'}
              </DetailRow>
              <DetailRow label={t('tickets.detail.submittedAt')}>
                {formatMoment(ticket.createdAt)}
              </DetailRow>
              <DetailRow label={t('tickets.detail.startedAt')}>
                {formatMoment(ticket.startedAt)}
              </DetailRow>
              <DetailRow label={t('tickets.detail.completedAt')}>
                {formatMoment(ticket.completedAt)}
              </DetailRow>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('tickets.detail.description')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-sm whitespace-pre-wrap'>
              {ticket.description || t('tickets.detail.noDescription')}
            </p>
          </CardContent>
        </Card>

        {ticket.status === 'completed' ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('tickets.detail.resolution')}</CardTitle>
              <CardDescription>
                {t('tickets.detail.resolutionDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className='text-sm whitespace-pre-wrap'>
                {ticket.resolution || '—'}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {ticket.canHandle && ticket.status !== 'completed' ? (
          <div className='flex flex-wrap gap-2'>
            {ticket.status === 'pending' ? (
              <Button onClick={start} disabled={busy}>
                <PlayIcon data-icon='inline-start' />
                {t('tickets.detail.start')}
              </Button>
            ) : (
              <Button onClick={() => setCompleting(true)} disabled={busy}>
                <CircleCheckIcon data-icon='inline-start' />
                {t('tickets.detail.complete')}
              </Button>
            )}
          </div>
        ) : null}

        {ticket.status === 'in_progress' && !ticket.canHandle ? (
          <Alert>
            <ClockIcon />
            <AlertTitle>{t('tickets.detail.inProgressTitle')}</AlertTitle>
            <AlertDescription>
              {t('tickets.detail.inProgress')}
            </AlertDescription>
          </Alert>
        ) : null}

        <Dialog open={completing} onOpenChange={setCompleting}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('tickets.complete.title')}</DialogTitle>
              <DialogDescription>
                {t('tickets.complete.description')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor='ticket-resolution'>
                  {t('tickets.complete.field')}
                </FieldLabel>
                <Textarea
                  id='ticket-resolution'
                  rows={4}
                  value={resolution}
                  onChange={(event) => {
                    setResolution(event.target.value);
                    if (resolutionError) setResolutionError(null);
                  }}
                  aria-invalid={resolutionError ? true : undefined}
                />
                {resolutionError ? (
                  <p className='text-sm text-destructive' role='alert'>
                    {resolutionError}
                  </p>
                ) : null}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => setCompleting(false)}
                disabled={busy}
              >
                {t('actions.cancel')}
              </Button>
              <Button onClick={complete} disabled={busy}>
                {t('tickets.complete.submit')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </RouteChildPage>
  );
}
