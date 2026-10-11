import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  FileTextIcon,
  PaperclipIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { useOutletContext, useParams } from 'react-router';

import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Separator } from '#components/ui/separator';
import { Skeleton } from '#components/ui/skeleton';

import { TicketStatusBadge, TicketUrgencyBadge } from '../status-badge.js';
import type {
  ItRole,
  ItUser,
  Ticket,
  TicketAttachment,
  TicketRecord,
  TicketsOutletContext,
} from '../types.js';
import { TicketActionDialog, type TicketActionKind } from './action-dialog.js';

export default function TicketDetailPage(): ReactElement {
  const params = useParams<{ ticketId: string }>();
  const ticketId = Number(params.ticketId);

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return <NotFoundPage />;
  }
  return <TicketDetail ticketId={ticketId} />;
}

function TicketDetail({
  ticketId,
}: {
  readonly ticketId: number;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload: reloadList } = useOutletContext<TicketsOutletContext>();
  const session = useAuthentication().session;
  const currentUserId = session?.user?.id ?? null;

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly ticket?: Ticket;
    readonly role?: ItRole;
    readonly engineers?: ItUser[];
    readonly error?: unknown;
  }>();
  const requestKey = String(reloadCount);

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    Promise.all([
      api.request<{ data: Ticket }>({
        path: `itTickets/${ticketId}`,
        signal: controller.signal,
      }),
      api.request<{ data: ItRole }>({
        path: 'itMe',
        signal: controller.signal,
      }),
      // The assign dialog needs the engineers; only the service desk may assign, so only it needs the list.
      api
        .request<{ data: ItUser[] }>({
          path: 'itUsers',
          signal: controller.signal,
        })
        .catch(() => ({ data: [] as ItUser[] })),
    ]).then(
      ([ticketResponse, roleResponse, engineersResponse]) => {
        if (!controller.signal.aborted) {
          setResult({
            key,
            ticket: ticketResponse.data,
            role: roleResponse.data,
            engineers: engineersResponse.data,
          });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult((previous) => ({ ...previous, key, error }));
        }
      },
    );
    return () => controller.abort();
  }, [api, ticketId, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const ticket = result?.ticket;
  const role = result?.role;
  const engineers = useMemo(
    () => (result?.engineers ?? []).filter((user) => user.role === 'engineer'),
    [result?.engineers],
  );

  const [action, setAction] = useState<{
    readonly kind: TicketActionKind;
    readonly open: boolean;
  } | null>(null);

  const role_: ItRole | undefined = role;
  const status = ticket?.status;
  const isDesk = role_?.isServiceDesk ?? false;
  const isReporter =
    currentUserId !== null && ticket?.reporterId === currentUserId;
  const isAssignee =
    currentUserId !== null && ticket?.assigneeId === currentUserId;
  const working = status === 'pending' || status === 'processing';
  const canAssign = isDesk && working;
  const canWork = (isDesk || isAssignee) && working;
  const canConfirm = (isDesk || isReporter) && status === 'resolved';

  const afterAction = (): void => {
    reload();
    reloadList();
  };

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = <SessionExpiredAlert />;
  } else if (error instanceof ApiClientError && error.status === 404) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('tickets.detail.notFoundTitle')}</AlertTitle>
        <AlertDescription>
          {t('tickets.detail.notFoundDescription')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('tickets.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('tickets.error.forbidden')
            : t('tickets.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (!ticket) {
    content = <DetailSkeleton label={t('status.loading')} />;
  } else {
    content = (
      <>
        <PageHeader
          title={
            <span className='flex flex-wrap items-center gap-3'>
              <span>#{ticket.id}</span>
              <span>{ticket.title}</span>
            </span>
          }
          actions={
            <div className='flex flex-wrap items-center gap-2'>
              {canAssign ? (
                <Button
                  variant='outline'
                  onClick={() => setAction({ kind: 'assign', open: true })}
                >
                  {t('tickets.actions.assign.action')}
                </Button>
              ) : null}
              {canWork ? (
                <Button
                  variant='outline'
                  onClick={() => setAction({ kind: 'process', open: true })}
                >
                  {t('tickets.actions.process.action')}
                </Button>
              ) : null}
              {canWork ? (
                <Button
                  onClick={() => setAction({ kind: 'resolve', open: true })}
                >
                  {t('tickets.actions.resolve.action')}
                </Button>
              ) : null}
              {canConfirm ? (
                <Button
                  variant='outline'
                  onClick={() => setAction({ kind: 'return', open: true })}
                >
                  {t('tickets.actions.return.action')}
                </Button>
              ) : null}
              {canConfirm ? (
                <Button
                  onClick={() => setAction({ kind: 'close', open: true })}
                >
                  {t('tickets.actions.close.action')}
                </Button>
              ) : null}
              <Button
                variant='ghost'
                onClick={() => setAction({ kind: 'comment', open: true })}
              >
                {t('tickets.actions.comment.action')}
              </Button>
            </div>
          }
        />
        <TicketSummary ticket={ticket} />
        <TicketBody ticket={ticket} />
        {ticket.records && ticket.records.length > 0 ? (
          <TicketTimeline records={ticket.records} />
        ) : null}
        <TicketActionDialog
          // A new action remounts the dialog, so it starts from an empty field.
          key={action?.open ? action.kind : 'closed'}
          kind={action?.open ? action.kind : null}
          ticket={ticket}
          engineers={engineers}
          onOpenChange={(open) =>
            setAction((current) => (current ? { ...current, open } : current))
          }
          onDone={afterAction}
        />
      </>
    );
  }

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        {content}
      </PageContainer>
    </RouteChildPage>
  );
}

function TicketSummary({ ticket }: { readonly ticket: Ticket }): ReactElement {
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
    <div className='flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground'>
      <span className='flex items-center gap-2'>
        <TicketStatusBadge status={ticket.status} />
        {ticket.overdue ? (
          <span className='text-(--status-warning)'>
            {t('tickets.overdue')}
          </span>
        ) : null}
      </span>
      <TicketUrgencyBadge urgency={ticket.urgency} />
      <span>
        {t('tickets.fields.reporter')}: {ticket.reporterName ?? '—'}
      </span>
      <span>
        {t('tickets.fields.assignee')}: {ticket.assigneeName ?? '—'}
      </span>
      <span>
        {t('tickets.fields.updatedAt')}:{' '}
        {dateFormat.format(new Date(ticket.updatedAt))}
      </span>
    </div>
  );
}

function TicketBody({ ticket }: { readonly ticket: Ticket }): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='grid gap-4 lg:grid-cols-3'>
      <Card className='lg:col-span-2'>
        <CardHeader>
          <CardTitle>{t('tickets.detail.description')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='whitespace-pre-wrap text-sm leading-6'>
            {ticket.description}
          </p>
        </CardContent>
      </Card>
      <div className='flex flex-col gap-4'>
        {ticket.resolution ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('tickets.detail.resolution')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className='whitespace-pre-wrap text-sm leading-6'>
                {ticket.resolution}
              </p>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>{t('tickets.detail.attachments')}</CardTitle>
          </CardHeader>
          <CardContent>
            <TicketAttachments attachments={ticket.attachments} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TicketAttachments({
  attachments,
}: {
  readonly attachments: readonly TicketAttachment[];
}): ReactElement {
  const { t } = useTranslation();
  if (attachments.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('tickets.detail.noAttachments')}
      </p>
    );
  }
  return (
    <ul className='flex flex-col gap-2'>
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <a
            href={attachment.contentUrl}
            target='_blank'
            rel='noreferrer'
            className='flex items-center gap-2 text-sm hover:underline'
          >
            {attachment.mimeType.startsWith('image/') ? (
              <img
                src={attachment.contentUrl}
                alt={attachment.filename}
                className='size-10 shrink-0 rounded border border-border object-cover'
              />
            ) : (
              <FileTextIcon className='size-4 shrink-0 text-muted-foreground' />
            )}
            <span className='min-w-0 flex-1 truncate'>
              {attachment.filename}
            </span>
            <span className='shrink-0 text-xs text-muted-foreground'>
              {formatFileSize(attachment.size)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function TicketTimeline({
  records,
}: {
  readonly records: readonly TicketRecord[];
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
    <Card>
      <CardHeader>
        <CardTitle>{t('tickets.detail.history')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className='flex flex-col gap-4'>
          {records.map((record) => (
            <li key={record.id} className='flex gap-3'>
              <PaperclipIcon
                aria-hidden='true'
                className='mt-1 size-4 shrink-0 text-muted-foreground'
              />
              <div className='min-w-0 flex-1 space-y-1'>
                <div className='flex flex-wrap items-center gap-2 text-sm'>
                  <span className='font-medium'>
                    {t(`tickets.record.${record.kind}`)}
                  </span>
                  {record.kind === 'assigned' && record.content ? (
                    <span className='text-muted-foreground'>
                      {record.content}
                    </span>
                  ) : null}
                  <span className='text-xs text-muted-foreground'>
                    {record.authorName ?? t('tickets.detail.system')}
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    {dateFormat.format(new Date(record.createdAt))}
                  </span>
                </div>
                {record.fromStatus && record.toStatus ? (
                  <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                    <TicketStatusBadge status={record.fromStatus} />
                    <ArrowRightIcon className='size-3' />
                    <TicketStatusBadge status={record.toStatus} />
                  </div>
                ) : null}
                {record.content && record.kind !== 'assigned' ? (
                  <p className='whitespace-pre-wrap text-sm leading-6'>
                    {record.content}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function NotFoundPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertTitle>{t('tickets.detail.notFoundTitle')}</AlertTitle>
          <AlertDescription>
            {t('tickets.detail.notFoundDescription')}
          </AlertDescription>
        </Alert>
      </PageContainer>
    </RouteChildPage>
  );
}

function DetailSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div role='status' aria-label={label} className='space-y-4'>
      <Skeleton className='h-6 w-64' />
      <div className='grid gap-4 lg:grid-cols-3'>
        <Skeleton className='h-40 lg:col-span-2' />
        <Skeleton className='h-40' />
      </div>
      <Separator />
      <Skeleton className='h-32' />
    </div>
  );
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
