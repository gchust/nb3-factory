import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, CheckIcon, Undo2Icon } from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useLocation, useOutletContext, useParams } from 'react-router';

import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import {
  assignTicket,
  confirmTicket,
  fetchEngineers,
  fetchTicket,
  fetchViewer,
  processTicket,
  rejectTicket,
  resolveTicket,
} from './api.js';
import { TicketStatusBadge, TicketUrgencyBadge } from './status-badge.js';
import {
  isOverseer,
  type Engineer,
  type Ticket,
  type TicketLog,
  type TicketsOutletContext,
  type Viewer,
} from './types.js';

/** Route `/tickets/:ticketId`: a ticket's own page, covering the list that opened it. */
export default function TicketDetailPage(): ReactElement {
  const { ticketId = '' } = useParams();
  return <TicketDetail key={ticketId} ticketId={ticketId} />;
}

function TicketDetail({
  ticketId,
}: {
  readonly ticketId: string;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const { reload: reloadPage } = useOutletContext<TicketsOutletContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${ticketId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly ticket?: Ticket;
    readonly viewer?: Viewer;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${ticketId}:${reloadCount}`;
    Promise.all([
      fetchTicket(api, ticketId, controller.signal),
      fetchViewer(api, controller.signal),
    ]).then(
      ([ticket, viewer]) => {
        if (!controller.signal.aborted) {
          setResult({ key, ticket, viewer });
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error });
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
  const ticket = loading ? undefined : result?.ticket;
  const viewer = result?.viewer;

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  function refresh(): void {
    setReloadCount((count) => count + 1);
    reloadPage();
  }

  let content: ReactElement;
  if (status === 401) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('tickets.error.sessionExpired')}</AlertDescription>
      </Alert>
    );
  } else if (status === 404 || status === 403) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {status === 404
            ? t('tickets.error.notFound')
            : t('tickets.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    content = (
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
  } else if (!ticket || !viewer) {
    content = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-3'
      >
        <Skeleton className='h-5 w-1/2' />
        <Skeleton className='h-4 w-2/3' />
        <Skeleton className='h-4 w-1/3' />
      </div>
    );
  } else {
    content = (
      <>
        <TicketFields ticket={ticket} dateFormat={dateFormat} />
        <TicketActions ticket={ticket} viewer={viewer} onChanged={refresh} />
        <TicketTimeline logs={ticket.logs ?? []} dateFormat={dateFormat} />
      </>
    );
  }

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton to={{ pathname: '..', search: location.search }}>
          {t('tickets.detail.back')}
        </BackButton>
        <PageHeader
          title={
            ticket ? (
              <span className='flex flex-wrap items-center gap-3'>
                <span className='font-mono text-base text-muted-foreground'>
                  {ticket.ticketNo}
                </span>
                <span>{ticket.title}</span>
              </span>
            ) : (
              t('tickets.detail.title')
            )
          }
          description={
            ticket ? (
              <span className='flex flex-wrap items-center gap-2'>
                <TicketStatusBadge status={ticket.status} />
                <TicketUrgencyBadge urgency={ticket.urgency} />
                {ticket.overdue ? (
                  <span className='text-xs text-destructive'>
                    {t('tickets.overdue')}
                  </span>
                ) : null}
              </span>
            ) : undefined
          }
        />
        {content}
      </PageContainer>
    </RouteChildPage>
  );
}

function TicketFields({
  ticket,
  dateFormat,
}: {
  readonly ticket: Ticket;
  readonly dateFormat: Intl.DateTimeFormat;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent>
        <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
          <dt className='text-muted-foreground'>
            {t('tickets.fields.description')}
          </dt>
          <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
            {ticket.description}
          </dd>
          <dt className='text-muted-foreground'>
            {t('tickets.fields.reporter')}
          </dt>
          <dd>{ticket.reporterName}</dd>
          <dt className='text-muted-foreground'>
            {t('tickets.fields.assignee')}
          </dt>
          <dd>
            {ticket.assigneeName ?? (
              <span className='text-muted-foreground'>
                {t('tickets.unassigned')}
              </span>
            )}
          </dd>
          <dt className='text-muted-foreground'>
            {t('tickets.fields.createdAt')}
          </dt>
          <dd>{dateFormat.format(new Date(ticket.createdAt))}</dd>
          {ticket.resolvedAt ? (
            <>
              <dt className='text-muted-foreground'>
                {t('tickets.fields.resolvedAt')}
              </dt>
              <dd>{dateFormat.format(new Date(ticket.resolvedAt))}</dd>
            </>
          ) : null}
          {ticket.closedAt ? (
            <>
              <dt className='text-muted-foreground'>
                {t('tickets.fields.closedAt')}
              </dt>
              <dd>{dateFormat.format(new Date(ticket.closedAt))}</dd>
            </>
          ) : null}
          {ticket.screenshot ? (
            <>
              <dt className='text-muted-foreground'>
                {t('tickets.fields.screenshot')}
              </dt>
              <dd>
                <a
                  href={ticket.screenshot}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-block'
                >
                  <img
                    src={ticket.screenshot}
                    alt={t('tickets.form.screenshotPreview')}
                    className='max-h-48 rounded-md border object-contain'
                  />
                </a>
              </dd>
            </>
          ) : null}
          {ticket.solution ? (
            <>
              <dt className='text-muted-foreground'>
                {t('tickets.fields.solution')}
              </dt>
              <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
                {ticket.solution}
              </dd>
            </>
          ) : null}
          {ticket.lastRejectedReason ? (
            <>
              <dt className='text-muted-foreground'>
                {t('tickets.fields.lastRejectedReason')}
              </dt>
              <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere text-destructive'>
                {ticket.lastRejectedReason}
              </dd>
            </>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

function TicketActions({
  ticket,
  viewer,
  onChanged,
}: {
  readonly ticket: Ticket;
  readonly viewer: Viewer;
  readonly onChanged: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overseer = isOverseer(viewer.role);
  const canDispatch =
    overseer && ticket.status !== 'closed' && ticket.status !== 'resolved';
  const canHandle =
    (overseer ||
      (viewer.role === 'engineer' && ticket.assigneeId === viewer.userId)) &&
    (ticket.status === 'pending' || ticket.status === 'processing');
  const canConfirm =
    (overseer || ticket.reporterId === viewer.userId) &&
    ticket.status === 'resolved';

  useEffect(() => {
    if (!overseer) return;
    const controller = new AbortController();
    fetchEngineers(api, controller.signal).then(
      (list) => {
        if (!controller.signal.aborted) setEngineers(list);
      },
      () => {
        // The dispatch control simply stays without options.
      },
    );
    return () => controller.abort();
  }, [api, overseer]);

  async function run(
    action: () => Promise<unknown>,
    successMessage: string,
  ): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      toaster.show({ type: 'success', title: successMessage });
      onChanged();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message || t('tickets.error.requestFailed')
          : t('tickets.error.requestFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!canDispatch && !canHandle && !canConfirm) return null;

  return (
    <div className='grid gap-4 md:grid-cols-2'>
      {canDispatch ? (
        <DispatchCard
          ticket={ticket}
          engineers={engineers}
          busy={busy}
          onDispatch={(assigneeId) =>
            void run(
              () => assignTicket(api, ticket.id, assigneeId),
              t('tickets.messages.assigned'),
            )
          }
        />
      ) : null}
      {canHandle ? (
        <HandlingCard
          busy={busy}
          onProcess={(content) =>
            void run(
              () => processTicket(api, ticket.id, content),
              t('tickets.messages.processed'),
            )
          }
          onResolve={(solution) =>
            void run(
              () => resolveTicket(api, ticket.id, solution),
              t('tickets.messages.resolved'),
            )
          }
        />
      ) : null}
      {canConfirm ? (
        <ConfirmCard
          busy={busy}
          onConfirm={() =>
            void run(
              () => confirmTicket(api, ticket.id),
              t('tickets.messages.confirmed'),
            )
          }
          onReject={(content) =>
            void run(
              () => rejectTicket(api, ticket.id, content),
              t('tickets.messages.rejected'),
            )
          }
        />
      ) : null}
      {error ? (
        <p role='alert' className='text-sm text-destructive md:col-span-2'>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DispatchCard({
  ticket,
  engineers,
  busy,
  onDispatch,
}: {
  readonly ticket: Ticket;
  readonly engineers: readonly Engineer[];
  readonly busy: boolean;
  readonly onDispatch: (assigneeId: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [assigneeId, setAssigneeId] = useState(ticket.assigneeId ?? '');
  const items = engineers.map((engineer) => ({
    value: engineer.id,
    label: engineer.name,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tickets.actions.dispatchTitle')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='space-y-2'>
          <Label htmlFor='ticket-assignee'>
            {t('tickets.actions.selectEngineer')}
          </Label>
          <Select
            items={items}
            value={assigneeId}
            onValueChange={(value) => setAssigneeId(value ?? '')}
          >
            <SelectTrigger id='ticket-assignee' className='w-full'>
              <SelectValue placeholder={t('tickets.actions.selectEngineer')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Button
          disabled={busy || !assigneeId}
          onClick={() => onDispatch(assigneeId)}
        >
          {busy ? <Spinner data-icon='inline-start' /> : null}
          {t('tickets.actions.assign')}
        </Button>
      </CardContent>
    </Card>
  );
}

function HandlingCard({
  busy,
  onProcess,
  onResolve,
}: {
  readonly busy: boolean;
  readonly onProcess: (content: string) => void;
  readonly onResolve: (solution: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [progress, setProgress] = useState('');
  const [solution, setSolution] = useState('');

  function submitProgress(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (progress.trim()) onProcess(progress.trim());
  }
  function submitSolution(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (solution.trim()) onResolve(solution.trim());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tickets.actions.handleTitle')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-6'>
        <form className='space-y-2' onSubmit={submitProgress}>
          <Label htmlFor='ticket-progress'>
            {t('tickets.actions.processPlaceholder')}
          </Label>
          <Textarea
            id='ticket-progress'
            rows={3}
            value={progress}
            onChange={(event) => setProgress(event.target.value)}
          />
          <Button type='submit' variant='outline' disabled={busy}>
            {t('tickets.actions.submitProgress')}
          </Button>
        </form>
        <form className='space-y-2' onSubmit={submitSolution}>
          <Label htmlFor='ticket-solution'>
            {t('tickets.actions.resolvePlaceholder')}
          </Label>
          <Textarea
            id='ticket-solution'
            rows={3}
            value={solution}
            onChange={(event) => setSolution(event.target.value)}
          />
          <Button type='submit' disabled={busy}>
            {t('tickets.actions.submitSolution')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ConfirmCard({
  busy,
  onConfirm,
  onReject,
}: {
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onReject: (content: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  function submitReject(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (reason.trim()) onReject(reason.trim());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tickets.actions.confirmTitle')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-6'>
        <Button disabled={busy} onClick={onConfirm}>
          <CheckIcon data-icon='inline-start' />
          {t('tickets.actions.confirm')}
        </Button>
        <form className='space-y-2' onSubmit={submitReject}>
          <Label htmlFor='ticket-reject'>
            {t('tickets.actions.rejectPlaceholder')}
          </Label>
          <Textarea
            id='ticket-reject'
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button type='submit' variant='outline' disabled={busy}>
            <Undo2Icon data-icon='inline-start' />
            {t('tickets.actions.submitReject')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TicketTimeline({
  logs,
  dateFormat,
}: {
  readonly logs: readonly TicketLog[];
  readonly dateFormat: Intl.DateTimeFormat;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tickets.detail.history')}</CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('tickets.detail.noHistory')}
          </p>
        ) : (
          <ol className='space-y-4'>
            {logs.map((log) => (
              <li key={log.id} className='flex gap-3'>
                <span className='mt-1.5 size-2 shrink-0 rounded-full bg-primary' />
                <div className='min-w-0 space-y-1'>
                  <p className='text-sm font-medium'>
                    {t(`tickets.log.${log.action}`, {
                      defaultValue: log.action,
                    })}
                  </p>
                  {log.content ? (
                    <p className='text-sm whitespace-pre-wrap wrap-anywhere text-muted-foreground'>
                      {log.content}
                    </p>
                  ) : null}
                  <p className='text-xs text-muted-foreground'>
                    {[
                      log.authorName,
                      dateFormat.format(new Date(log.createdAt)),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
