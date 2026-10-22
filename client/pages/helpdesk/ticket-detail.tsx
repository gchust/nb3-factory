import {
  ApiClientError,
  resolveAppUrl,
  useApiClient,
  useToaster,
} from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckCircle2Icon,
  DownloadIcon,
  MessageSquareIcon,
  PaperclipIcon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  UserIcon,
} from 'lucide-react';
import {
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
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
import { useApiData } from './api.js';
import {
  CategoryLabel,
  HelpdeskError,
  HelpdeskLoading,
  PriorityLabel,
  StatusLabel,
  TransitionLabel,
} from './shared.js';
import { formatDateTime } from './display.js';
import type {
  TicketAttachment,
  TicketComment,
  TicketDetailData,
  TicketLifecycle,
  UserOption,
} from './types.js';

const textFieldFor = (
  transition: string,
): 'progressNote' | 'resolution' | 'reason' | undefined =>
  transition === 'progress'
    ? 'progressNote'
    : transition === 'resolve'
      ? 'resolution'
      : transition === 'return'
        ? 'reason'
        : undefined;

const newRequestId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
};

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col gap-1'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='text-sm'>{children}</dd>
    </div>
  );
}

function TransitionsCard({
  detail,
  reload,
}: {
  readonly detail: TicketDetailData;
  readonly reload: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [selected, setSelected] =
    useState<TicketLifecycle['available'][number]>();
  const [text, setText] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const canAssign = detail.permissions.assign === true;
  const users = useApiData<{ data: readonly UserOption[] }>(
    canAssign ? 'helpdesk/assignees' : null,
  );
  const options = users.data?.data ?? [];
  const needsText = selected ? textFieldFor(selected.name) : undefined;
  const needsAssignee =
    selected?.name === 'assign' || selected?.name === 'reassign';
  const available = detail.lifecycle.available.filter(
    (transition) => transition.allowed,
  );

  const open = (transition: TicketLifecycle['available'][number]) => {
    setSelected(transition);
    setText('');
    setAssigneeId(
      transition.name === 'reassign' ? (detail.ticket.assigneeId ?? '') : '',
    );
    setRequestId(newRequestId());
    setSubmitted(false);
    setError(undefined);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || busy) return;
    setSubmitted(true);
    if (needsText && !text.trim()) return;
    if (needsAssignee && !assigneeId.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.request({
        path: `helpdesk/tickets/${encodeURIComponent(detail.ticket.id)}/fire`,
        method: 'POST',
        json: {
          transition: selected.name,
          requestId,
          ...(detail.lifecycle.version
            ? { expectVersion: detail.lifecycle.version }
            : {}),
          input: needsText
            ? { [needsText]: text.trim() }
            : needsAssignee
              ? { assigneeId: assigneeId.trim() }
              : {},
        },
      });
      toaster.show({
        type: 'success',
        title: t('helpdesk.detail.actionDone', {
          action: t(`helpdesk.transition.${selected.name}`, {
            defaultValue: selected.title,
          }),
        }),
      });
      setSelected(undefined);
      reload();
    } catch (next) {
      setError(next);
    } finally {
      setBusy(false);
    }
  };

  const busyTransition =
    error instanceof ApiClientError &&
    (error.status === 409 || error.status === 400);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('helpdesk.detail.actions')}</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {available.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('helpdesk.detail.noActions')}
          </p>
        ) : (
          <div className='flex flex-wrap gap-2'>
            {available.map((transition) => (
              <Button
                key={transition.name}
                variant={
                  transition.name === 'resolve' || transition.name === 'confirm'
                    ? 'default'
                    : 'outline'
                }
                size='sm'
                onClick={() => open(transition)}
              >
                <ArrowRightIcon data-icon='inline-start' />
                <TransitionLabel
                  transition={transition.name}
                  title={transition.title}
                />
              </Button>
            ))}
          </div>
        )}
        <p className='text-xs text-muted-foreground'>
          {t('helpdesk.detail.actionsHint')}
        </p>
      </CardContent>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(next) => {
          if (!next && !busy) setSelected(undefined);
        }}
      >
        <DialogContent>
          <form
            className='flex flex-col gap-5'
            onSubmit={(event) => void submit(event)}
          >
            <DialogHeader>
              <DialogTitle>
                {selected ? (
                  <TransitionLabel
                    transition={selected.name}
                    title={selected.title}
                  />
                ) : null}
              </DialogTitle>
              <DialogDescription>
                {t('helpdesk.detail.actionDescription', {
                  ticket: detail.ticket.ticketNo,
                })}
              </DialogDescription>
            </DialogHeader>
            {needsAssignee && (
              <div className='flex flex-col gap-2'>
                <Label htmlFor='transition-assignee'>
                  {t('helpdesk.fields.assignee')}
                </Label>
                {options.length ? (
                  <Select
                    value={assigneeId}
                    onValueChange={(value) => setAssigneeId(String(value))}
                  >
                    <SelectTrigger id='transition-assignee' className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name || user.email || user.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id='transition-assignee'
                    value={assigneeId}
                    aria-invalid={submitted && !assigneeId.trim()}
                    placeholder={t('helpdesk.fields.assigneeId')}
                    onChange={(event) => setAssigneeId(event.target.value)}
                  />
                )}
                {submitted && !assigneeId.trim() && (
                  <p className='text-xs text-destructive'>
                    {t('helpdesk.errors.required')}
                  </p>
                )}
              </div>
            )}
            {needsText && (
              <div className='flex flex-col gap-2'>
                <Label htmlFor='transition-text'>
                  {t(`helpdesk.detail.field.${needsText}`)}
                </Label>
                <Textarea
                  id='transition-text'
                  rows={needsText === 'progressNote' ? 4 : 5}
                  maxLength={20000}
                  value={text}
                  aria-invalid={submitted && !text.trim()}
                  onChange={(event) => setText(event.target.value)}
                />
                {submitted && !text.trim() && (
                  <p className='text-xs text-destructive'>
                    {t('helpdesk.errors.required')}
                  </p>
                )}
              </div>
            )}
            <HelpdeskError error={error} />
            {busyTransition && (
              <p className='text-xs text-muted-foreground'>
                {t('helpdesk.detail.conflictHint')}
              </p>
            )}
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                disabled={busy}
                onClick={() => setSelected(undefined)}
              >
                {t('helpdesk.actions.cancel')}
              </Button>
              <Button type='submit' disabled={busy}>
                <CheckCircle2Icon data-icon='inline-start' />
                {t(
                  busy ? 'helpdesk.actions.saving' : 'helpdesk.actions.confirm',
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CommentsCard({
  ticketId,
  comments,
  reload,
}: {
  readonly ticketId: string;
  readonly comments: readonly TicketComment[];
  readonly reload: () => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.request({
        path: `helpdesk/tickets/${encodeURIComponent(ticketId)}/comments`,
        method: 'POST',
        json: { body: body.trim() },
      });
      setBody('');
      toaster.show({ type: 'success', title: t('helpdesk.comments.added') });
      reload();
    } catch (next) {
      setError(next);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <MessageSquareIcon className='size-4' />
          {t('helpdesk.comments.title')}
          <span className='text-sm font-normal text-muted-foreground'>
            {comments.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {comments.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('helpdesk.comments.empty')}
          </p>
        ) : (
          <ol className='flex flex-col gap-4'>
            {comments.map((comment) => (
              <li key={comment.id} className='flex gap-3'>
                <span className='mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'>
                  {comment.kind === 'system' ? (
                    <RefreshCwIcon className='size-4' />
                  ) : (
                    <UserIcon className='size-4' />
                  )}
                </span>
                <div className='flex min-w-0 flex-1 flex-col gap-1'>
                  <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1'>
                    <span className='text-sm font-medium'>
                      {comment.kind === 'system'
                        ? t('helpdesk.comments.system')
                        : comment.authorName ||
                          t('helpdesk.comments.person', {
                            id: comment.authorId?.slice(0, 8) ?? '—',
                          })}
                    </span>
                    <span className='text-xs text-muted-foreground'>
                      {formatDateTime(comment.createdAt, i18n.language)}
                    </span>
                  </div>
                  <p className='text-sm whitespace-pre-wrap break-words'>
                    {comment.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <form
          className='flex flex-col gap-2 border-t pt-4'
          onSubmit={(event) => void submit(event)}
        >
          <Label htmlFor='new-comment'>{t('helpdesk.comments.add')}</Label>
          <Textarea
            id='new-comment'
            rows={3}
            maxLength={20000}
            value={body}
            placeholder={t('helpdesk.comments.placeholder')}
            onChange={(event) => setBody(event.target.value)}
          />
          <HelpdeskError error={error} />
          <div className='flex justify-end'>
            <Button type='submit' size='sm' disabled={busy || !body.trim()}>
              <SendIcon data-icon='inline-start' />
              {t(busy ? 'helpdesk.comments.sending' : 'helpdesk.comments.send')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AttachmentsCard({
  ticketId,
  attachments,
  reload,
}: {
  readonly ticketId: string;
  readonly attachments: readonly TicketAttachment[];
  readonly reload: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const upload = async (file: File) => {
    setBusy(true);
    setError(undefined);
    try {
      const body = new FormData();
      body.append('file', file);
      await api.request({
        path: `helpdesk/tickets/${encodeURIComponent(ticketId)}/attachments`,
        method: 'POST',
        body,
      });
      toaster.show({
        type: 'success',
        title: t('helpdesk.attachments.uploaded'),
      });
      reload();
    } catch (next) {
      setError(next);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <PaperclipIcon className='size-4' />
          {t('helpdesk.attachments.title')}
          <span className='text-sm font-normal text-muted-foreground'>
            {attachments.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {attachments.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('helpdesk.attachments.empty')}
          </p>
        ) : (
          <ul className='flex flex-col gap-2'>
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                <a
                  className='flex items-center gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-muted/50'
                  href={resolveAppUrl(
                    `/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(attachment.id)}/content`,
                  )}
                  download={attachment.file.filename}
                >
                  <PaperclipIcon className='size-4 shrink-0 text-muted-foreground' />
                  <span className='min-w-0 flex-1 truncate'>
                    {attachment.file.filename}
                  </span>
                  <span className='shrink-0 text-xs text-muted-foreground'>
                    {Number(attachment.file.size) > 1024
                      ? `${Math.round(Number(attachment.file.size) / 1024)} KB`
                      : t('helpdesk.attachments.download')}
                  </span>
                  <DownloadIcon className='size-4 shrink-0 text-muted-foreground' />
                </a>
              </li>
            ))}
          </ul>
        )}
        <HelpdeskError error={error} />
        <label className='inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring'>
          <PlusIcon className='size-4' />
          {t(
            busy
              ? 'helpdesk.attachments.uploading'
              : 'helpdesk.attachments.upload',
          )}
          <input
            type='file'
            className='sr-only'
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
        </label>
        <p className='text-xs text-muted-foreground'>
          {t('helpdesk.attachments.limit')}
        </p>
      </CardContent>
    </Card>
  );
}

function HistoryCard({
  lifecycle,
  currentUserId,
}: {
  readonly lifecycle: TicketLifecycle;
  readonly currentUserId?: string;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const transitions = [...lifecycle.history.transitions].reverse();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('helpdesk.history.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {transitions.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('helpdesk.history.empty')}
          </p>
        ) : (
          <ol className='relative flex flex-col gap-4 border-s ps-4'>
            {transitions.map((entry) => (
              <li key={entry.id} className='relative flex flex-col gap-1'>
                <span className='absolute top-1.5 -left-[1.32rem] size-2 rounded-full bg-primary' />
                <div className='flex flex-wrap items-center gap-2 text-sm'>
                  <span className='font-medium'>
                    <TransitionLabel transition={entry.transition} />
                  </span>
                  {entry.from && (
                    <span className='flex items-center gap-1 text-xs text-muted-foreground'>
                      <StatusLabel status={entry.from} />
                      <ArrowRightIcon className='size-3' />
                      <StatusLabel status={entry.to} />
                    </span>
                  )}
                </div>
                <span className='text-xs text-muted-foreground'>
                  {entry.actorId === currentUserId
                    ? t('helpdesk.history.you')
                    : entry.actorId === 'system'
                      ? t('helpdesk.history.system')
                      : (entry.actorName ??
                        t('helpdesk.history.person', {
                          id: entry.actorId.slice(0, 8),
                        }))}{' '}
                  · {formatDateTime(entry.at, i18n.language)}
                </span>
                {entry.input && Object.keys(entry.input).length > 0 && (
                  <dl className='mt-1 flex flex-col gap-1 rounded-md bg-muted/40 p-2 text-xs'>
                    {Object.entries(entry.input).map(([key, value]) => (
                      <div key={key} className='flex gap-2'>
                        <dt className='shrink-0 text-muted-foreground'>
                          {key}:
                        </dt>
                        <dd className='break-words'>
                          {typeof value === 'string'
                            ? value
                            : JSON.stringify(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default function TicketDetailPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const { ticketId } = useParams();
  const location = useLocation();
  const session = useAuthentication();
  const request = useApiData<{ data: TicketDetailData }>(
    ticketId ? `helpdesk/tickets/${encodeURIComponent(ticketId)}` : null,
  );
  const detail = request.data?.data;
  const ticket = detail?.ticket;
  const errorStatus =
    request.error &&
    typeof request.error === 'object' &&
    'status' in request.error
      ? request.error.status
      : undefined;
  const currentUserId = session.session
    ? String((session.session.user as { id?: string }).id ?? '')
    : undefined;

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton to={{ pathname: '..', search: location.search }}>
          {t('helpdesk.tickets.backToList')}
        </BackButton>
        {request.error && errorStatus === 404 ? (
          <div className='flex flex-col items-start gap-3 rounded-lg border border-dashed p-6'>
            <p className='text-sm text-muted-foreground'>
              {t('helpdesk.detail.notFound')}
            </p>
            <Button
              nativeButton={false}
              variant='outline'
              render={<Link to='..' />}
            >
              <ArrowLeftIcon data-icon='inline-start' />
              {t('helpdesk.tickets.backToList')}
            </Button>
          </div>
        ) : request.error ? (
          <HelpdeskError error={request.error} retry={request.reload} />
        ) : request.loading && !detail ? (
          <HelpdeskLoading rows={4} />
        ) : !detail || !ticket ? (
          <p className='text-sm text-muted-foreground'>
            {t('helpdesk.detail.notFound')}
          </p>
        ) : (
          <>
            <PageHeader
              title={
                <span className='flex min-w-0 flex-col gap-1'>
                  <span className='text-sm font-normal text-muted-foreground'>
                    {ticket.ticketNo}
                  </span>
                  <span className='break-words'>{ticket.title}</span>
                </span>
              }
              description={t('helpdesk.detail.opened', {
                date: formatDateTime(ticket.createdAt, i18n.language),
              })}
              actions={
                <div className='flex flex-wrap items-center gap-2'>
                  <StatusLabel status={ticket.status} />
                  <PriorityLabel priority={ticket.priority} />
                </div>
              }
            />
            <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]'>
              <div className='flex min-w-0 flex-col gap-4'>
                <Card>
                  <CardHeader>
                    <CardTitle>{t('helpdesk.fields.description')}</CardTitle>
                  </CardHeader>
                  <CardContent className='flex flex-col gap-4'>
                    <p className='text-sm whitespace-pre-wrap break-words'>
                      {ticket.description}
                    </p>
                    {ticket.resolution && (
                      <div className='rounded-lg border border-(--status-success)/20 bg-(--status-success-background) p-3'>
                        <p className='mb-1 text-xs font-medium text-(--status-success)'>
                          {t('helpdesk.fields.resolution')}
                        </p>
                        <p className='text-sm whitespace-pre-wrap break-words'>
                          {ticket.resolution}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <TransitionsCard detail={detail} reload={request.reload} />
                <CommentsCard
                  ticketId={ticket.id}
                  comments={detail.comments}
                  reload={request.reload}
                />
              </div>
              <div className='flex min-w-0 flex-col gap-4'>
                <Card>
                  <CardHeader>
                    <CardTitle>{t('helpdesk.detail.information')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className='grid grid-cols-2 gap-4'>
                      <Field label={t('helpdesk.fields.status')}>
                        <StatusLabel status={ticket.status} />
                      </Field>
                      <Field label={t('helpdesk.fields.priority')}>
                        <PriorityLabel priority={ticket.priority} />
                      </Field>
                      <Field label={t('helpdesk.fields.category')}>
                        <CategoryLabel category={ticket.category} />
                      </Field>
                      <Field label={t('helpdesk.fields.updated')}>
                        {formatDateTime(ticket.updatedAt, i18n.language)}
                      </Field>
                      <Field label={t('helpdesk.fields.reporter')}>
                        {ticket.reporterId === currentUserId
                          ? t('helpdesk.history.you')
                          : ticket.reporterName ||
                            t('helpdesk.history.person', {
                              id: ticket.reporterId.slice(0, 8),
                            })}
                      </Field>
                      <Field label={t('helpdesk.fields.assignee')}>
                        {ticket.assigneeId
                          ? ticket.assigneeId === currentUserId
                            ? t('helpdesk.history.you')
                            : ticket.assigneeName ||
                              t('helpdesk.history.person', {
                                id: ticket.assigneeId.slice(0, 8),
                              })
                          : t('helpdesk.fields.unassigned')}
                      </Field>
                      <Field label={t('helpdesk.fields.created')}>
                        <span className='inline-flex items-center gap-1'>
                          <CalendarIcon className='size-3 text-muted-foreground' />
                          {formatDateTime(ticket.createdAt, i18n.language)}
                        </span>
                      </Field>
                      <Field label={t('helpdesk.fields.version')}>
                        {ticket.lifecycleVersion ?? '—'}
                      </Field>
                    </dl>
                  </CardContent>
                </Card>
                <AttachmentsCard
                  ticketId={ticket.id}
                  attachments={detail.attachments}
                  reload={request.reload}
                />
                <HistoryCard
                  lifecycle={detail.lifecycle}
                  currentUserId={currentUserId}
                />
                {detail.lifecycle.available.some(
                  (transition) => !transition.allowed,
                ) && (
                  <p className='flex items-start gap-2 px-1 text-xs text-muted-foreground'>
                    <AlertTriangleIcon className='mt-0.5 size-3.5 shrink-0' />
                    {t('helpdesk.detail.permissionHint')}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </PageContainer>
    </RouteChildPage>
  );
}
