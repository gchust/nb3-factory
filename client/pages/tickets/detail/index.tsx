import {
  ApiClientError,
  resolveAppUrl,
  useApiClient,
} from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { FilePreviewField } from '#extensions/nocobase-file-component-ui/components/file-preview-field';
import type { FileRecord } from '#extensions/nocobase-file-component-ui/types';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  MessageSquarePlusIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useOutletContext, useParams } from 'react-router';

import { BackButton } from '#components/back-button';
import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Textarea } from '#components/ui/textarea';

import { TicketPriorityBadge, TicketStatusBadge } from '../ticket-badges.js';
import {
  TICKET_PRIORITIES,
  type Engineer,
  type OfferedTransition,
  type Ticket,
  type TicketDetail,
  type TicketPriority,
  type TicketsOutletContext,
} from '../types.js';
import { fireTicket } from './actions.js';

const NEEDS_INPUT = new Set(['assign', 'resolve', 'reopen']);

export default function TicketDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const api = useApiClient();
  // This page opens over the list, which stays mounted behind it. A transition changes the row the list shows, so the
  // list's reload runs with the detail's own; otherwise the row keeps its old status until the page is reloaded.
  const outletContext = useOutletContext<TicketsOutletContext | undefined>();
  const reloadList = outletContext?.reload;
  const [reloadCount, setReloadCount] = useState(0);
  const [detail, setDetail] = useState<TicketDetail>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    api
      .request<{ data: TicketDetail }>({
        path: `tickets/${encodeURIComponent(id)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setDetail(data);
            setError(undefined);
          }
        },
        (cause: unknown) => {
          if (!controller.signal.aborted) setError(cause);
        },
      );
    return () => controller.abort();
  }, [api, id, reloadCount]);

  const reload = useCallback((): void => {
    setReloadCount((count) => count + 1);
    reloadList?.();
  }, [reloadList]);

  if (!id) return <></>;

  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-4xl'>
        <BackButton to='/tickets' />
        {error ? (
          <LoadError error={error} onRetry={reload} />
        ) : !detail ? (
          <Loading label={t('status.loading')} />
        ) : (
          <TicketView detail={detail} onChanged={reload} />
        )}
      </PageContainer>
    </RouteChildPage>
  );
}

function TicketView({
  detail,
  onChanged,
}: {
  readonly detail: TicketDetail;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { ticket } = detail;
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  return (
    <div className='flex flex-col gap-6'>
      <PageHeader
        title={ticket.title}
        description={
          <span className='flex flex-wrap items-center gap-2'>
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} />
            {ticket.category ? (
              <span className='text-sm text-muted-foreground'>
                {ticket.category}
              </span>
            ) : null}
          </span>
        }
      />

      <TransitionsCard
        ticketId={ticket.id}
        ticket={ticket}
        transitions={detail.available}
        onChanged={onChanged}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('helpdesk.detail.description')}</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <p className='text-sm leading-6 whitespace-pre-wrap'>
            {ticket.description}
          </p>
          <dl className='grid gap-x-6 gap-y-2 sm:grid-cols-2'>
            <Meta label={t('helpdesk.fields.reporter')}>
              {ticket.reporterName}
            </Meta>
            <Meta label={t('helpdesk.fields.assignee')}>
              {ticket.assigneeName ?? t('helpdesk.unassigned')}
            </Meta>
            <Meta label={t('helpdesk.fields.createdAt')}>
              {dateFormat.format(new Date(ticket.createdAt))}
            </Meta>
            <Meta label={t('helpdesk.fields.updatedAt')}>
              {dateFormat.format(new Date(ticket.updatedAt))}
            </Meta>
          </dl>
          {ticket.serviceDeskNote ? (
            <Note title={t('helpdesk.fields.serviceDeskNote')}>
              {ticket.serviceDeskNote}
            </Note>
          ) : null}
          {ticket.resolution ? (
            <Note title={t('helpdesk.fields.resolution')}>
              {ticket.resolution}
            </Note>
          ) : null}
          {ticket.reopenReason ? (
            <Note title={t('helpdesk.fields.reopenReason')}>
              {ticket.reopenReason}
            </Note>
          ) : null}
        </CardContent>
      </Card>

      {detail.attachments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('helpdesk.fields.screenshots')}</CardTitle>
          </CardHeader>
          <CardContent>
            <FilePreviewField files={attachmentFiles(detail, ticket)} />
          </CardContent>
        </Card>
      ) : null}

      <CommentsCard
        ticketId={ticket.id}
        comments={detail.comments}
        dateFormat={dateFormat}
        onChanged={onChanged}
      />
    </div>
  );
}

function TransitionsCard({
  ticketId,
  ticket,
  transitions,
  onChanged,
}: {
  readonly ticketId: string;
  readonly ticket: Ticket;
  readonly transitions: readonly OfferedTransition[];
  readonly onChanged: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApiClient();
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  if (transitions.length === 0) return null;

  async function run(
    transition: string,
    input: Record<string, unknown>,
  ): Promise<boolean> {
    setBusy(true);
    setError(undefined);
    try {
      await fireTicket(api, ticketId, transition, input);
      onChanged();
      return true;
    } catch (cause) {
      setError(cause);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('helpdesk.detail.actions')}</CardTitle>
        <CardDescription>{t('helpdesk.detail.actionsHint')}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <div className='flex flex-wrap gap-2'>
          {transitions.map((transition) => {
            const blocked = !transition.allowed;
            return (
              <div key={transition.name} className='flex flex-col gap-1'>
                <Button
                  disabled={blocked || busy}
                  size='sm'
                  variant={blocked ? 'outline' : 'default'}
                  onClick={() => {
                    if (NEEDS_INPUT.has(transition.name)) {
                      setActive(transition.name);
                    } else {
                      void run(transition.name, {});
                    }
                  }}
                >
                  {transition.title}
                  {!blocked && !NEEDS_INPUT.has(transition.name) ? (
                    <ArrowRightIcon />
                  ) : null}
                </Button>
                {blocked
                  ? transition.blockers.map((blocker) => (
                      <span
                        key={blocker.code}
                        className='text-xs text-muted-foreground'
                      >
                        {blocker.message}
                      </span>
                    ))
                  : null}
              </div>
            );
          })}
        </div>
        {error ? (
          <p className='flex items-center gap-2 text-sm text-destructive'>
            <AlertCircleIcon className='size-4' aria-hidden />
            {error instanceof ApiClientError && error.status === 409
              ? t('helpdesk.detail.conflict')
              : t('helpdesk.detail.transitionFailed')}
          </p>
        ) : null}
      </CardContent>
      {active ? (
        <TransitionDialog
          active={active}
          ticket={ticket}
          onClose={() => setActive(null)}
          onSubmit={run}
        />
      ) : null}
    </Card>
  );
}

function TransitionDialog({
  active,
  ticket,
  onClose,
  onSubmit,
}: {
  readonly active: string;
  readonly ticket: Ticket;
  readonly onClose: () => void;
  readonly onSubmit: (
    transition: string,
    input: Record<string, unknown>,
  ) => Promise<boolean>;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [engineers, setEngineers] = useState<readonly Engineer[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  // The form starts from the ticket it is acting on, so confirming without touching a field keeps the current values
  // instead of silently replacing them with a default.
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
  const [category, setCategory] = useState(ticket.category ?? '');
  const [note, setNote] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const priorityItems = useMemo(
    () =>
      TICKET_PRIORITIES.map((value) => ({
        value,
        label: t(`helpdesk.priority.${value}`),
      })),
    [t],
  );
  // `Select.Value` shows the raw value unless the root is told the labels, which is why the chosen engineer used to
  // appear as an internal user id.
  const assigneeItems = useMemo(
    () =>
      engineers.map((engineer) => ({
        value: engineer.id,
        label: engineer.name,
      })),
    [engineers],
  );

  useEffect(() => {
    if (active !== 'assign') return;
    const controller = new AbortController();
    api
      .request<{ data: Engineer[] }>({
        path: 'helpdesk/engineers',
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setEngineers(data);
        },
        () => undefined,
      );
    return () => controller.abort();
  }, [active, api]);

  const ready =
    active === 'assign'
      ? assigneeId !== ''
      : active === 'resolve'
        ? text.trim() !== ''
        : text.trim() !== '';

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    const input =
      active === 'assign'
        ? {
            assigneeId,
            priority,
            category: category.trim() || undefined,
            serviceDeskNote: note.trim() || undefined,
          }
        : active === 'resolve'
          ? { resolution: text.trim() }
          : { reopenReason: text.trim() };
    const ok = await onSubmit(active, input);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <form
          className='flex flex-col gap-4'
          onSubmit={(event) => void submit(event)}
        >
          <DialogHeader>
            <DialogTitle>
              {t(`helpdesk.transition.${active}.title`)}
            </DialogTitle>
            <DialogDescription>
              {t(`helpdesk.transition.${active}.description`)}
            </DialogDescription>
          </DialogHeader>
          {active === 'assign' ? (
            <>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='assign-engineer'>
                  {t('helpdesk.fields.assignee')}
                </Label>
                <Select
                  items={assigneeItems}
                  value={assigneeId}
                  onValueChange={(value) => setAssigneeId(value ?? '')}
                >
                  <SelectTrigger id='assign-engineer'>
                    <SelectValue
                      placeholder={t('helpdesk.transition.assign.choose')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {engineers.map((engineer) => (
                      <SelectItem key={engineer.id} value={engineer.id}>
                        {engineer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='flex flex-col gap-2'>
                  <Label htmlFor='assign-priority'>
                    {t('helpdesk.fields.priority')}
                  </Label>
                  <Select
                    items={priorityItems}
                    value={priority}
                    onValueChange={(value) =>
                      setPriority(value as TicketPriority)
                    }
                  >
                    <SelectTrigger id='assign-priority'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_PRIORITIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`helpdesk.priority.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='flex flex-col gap-2'>
                  <Label htmlFor='assign-category'>
                    {t('helpdesk.fields.category')}
                  </Label>
                  <Input
                    id='assign-category'
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                  />
                </div>
              </div>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='assign-note'>
                  {t('helpdesk.fields.serviceDeskNote')}
                </Label>
                <Textarea
                  id='assign-note'
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
            </>
          ) : (
            <div className='flex flex-col gap-2'>
              <Label htmlFor='transition-text'>
                {active === 'resolve'
                  ? t('helpdesk.fields.resolution')
                  : t('helpdesk.fields.reopenReason')}
              </Label>
              <Textarea
                id='transition-text'
                required
                rows={4}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button disabled={!ready || busy} type='submit'>
              {busy ? t('helpdesk.form.submitting') : t('actions.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CommentsCard({
  ticketId,
  comments,
  dateFormat,
  onChanged,
}: {
  readonly ticketId: string;
  readonly comments: TicketDetail['comments'];
  readonly dateFormat: Intl.DateTimeFormat;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (body.trim() === '' || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.request({
        path: `tickets/${encodeURIComponent(ticketId)}/comments`,
        method: 'POST',
        json: { body: body.trim() },
      });
      setBody('');
      onChanged();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('helpdesk.detail.comments')}</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {comments.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('helpdesk.detail.noComments')}
          </p>
        ) : (
          <ul className='flex flex-col gap-3'>
            {comments.map((comment) => (
              <li
                key={comment.id}
                className='rounded-lg border border-border p-3'
              >
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <span className='text-sm font-medium'>
                    {comment.authorName}
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    {dateFormat.format(new Date(comment.createdAt))}
                  </span>
                </div>
                <p className='mt-1 text-sm whitespace-pre-wrap'>
                  {comment.body}
                </p>
              </li>
            ))}
          </ul>
        )}
        <form
          className='flex flex-col gap-2'
          onSubmit={(event) => void submit(event)}
        >
          <Label htmlFor='comment-body'>
            {t('helpdesk.detail.addComment')}
          </Label>
          <Textarea
            id='comment-body'
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          {error ? (
            <p className='text-sm text-destructive'>
              {t('helpdesk.detail.commentFailed')}
            </p>
          ) : null}
          <div className='flex justify-end'>
            <Button disabled={body.trim() === '' || busy} type='submit'>
              <MessageSquarePlusIcon />
              {t('helpdesk.detail.addComment')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Meta({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='text-sm'>{children}</dd>
    </div>
  );
}

function Note({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='rounded-lg bg-muted/50 p-3'>
      <p className='text-xs font-medium text-muted-foreground'>{title}</p>
      <p className='mt-1 text-sm whitespace-pre-wrap'>{children}</p>
    </div>
  );
}

function attachmentFiles(detail: TicketDetail, ticket: Ticket): FileRecord[] {
  return detail.attachments.map((attachment) => ({
    id: attachment.id,
    disk: 'local',
    key: attachment.id,
    filename: attachment.filename,
    ext: attachment.ext,
    mimeType: attachment.mimeType,
    size: attachment.size,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    contentUrl: resolveAppUrl(
      `/uploads/ticketAttachments/${encodeURIComponent(attachment.id)}${attachment.ext ? `.${encodeURIComponent(attachment.ext)}` : ''}`,
    ),
  }));
}

function LoadError({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const status = error instanceof ApiClientError ? error.status : undefined;
  if (status === 404) {
    return (
      <Alert>
        <AlertCircleIcon />
        <AlertTitle>{t('helpdesk.detail.notFound.title')}</AlertTitle>
        <AlertDescription>
          {t('helpdesk.detail.notFound.description')}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertTitle>{t('helpdesk.detail.error.title')}</AlertTitle>
      <AlertDescription>
        {status === 401
          ? t('helpdesk.detail.error.unauthorized')
          : t('helpdesk.detail.error.requestFailed')}
      </AlertDescription>
      {status === 401 ? null : (
        <AlertAction>
          <Button size='sm' variant='outline' onClick={onRetry}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
