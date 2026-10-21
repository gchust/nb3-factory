import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CheckCircle2Icon,
  CircleCheckBigIcon,
  MessageSquareIcon,
  PaperclipIcon,
  RotateCcwIcon,
  SendIcon,
  UserCheckIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useParams } from 'react-router';

import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { StatusBadge } from '#components/status-badge';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button, buttonVariants } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Checkbox } from '#components/ui/checkbox';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import { Textarea } from '#components/ui/textarea';

import { TicketsClient } from '../api.js';
import {
  TicketOverdueBadge,
  TicketPriorityBadge,
  TicketStatusBadge,
} from '../badges.js';
import { AttachmentCard } from '../attachment-card.js';
import { formatDate } from '../format.js';
import type { TicketComment, TicketDetail } from '../types.js';

type Transition = 'resolve' | 'close' | 'reopen';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function CommentItem({
  comment,
}: {
  readonly comment: TicketComment;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <article
      className={
        comment.internal
          ? 'flex flex-col gap-2 rounded-lg border border-dashed bg-muted/40 p-4'
          : 'flex flex-col gap-2 rounded-lg border bg-card p-4'
      }
    >
      <header className='flex flex-wrap items-center gap-2'>
        <span className='flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium'>
          {initials(comment.author?.name ?? '?')}
        </span>
        <span className='text-sm font-medium'>
          {comment.author?.name ?? t('tickets.unknownRequester')}
        </span>
        <time
          className='text-xs text-muted-foreground'
          dateTime={comment.createdAt}
        >
          {formatDate(comment.createdAt)}
        </time>
        {comment.internal ? (
          <StatusBadge size='sm' tone='warning'>
            {t('tickets.internalNote')}
          </StatusBadge>
        ) : null}
      </header>
      <p className='whitespace-pre-wrap text-sm leading-6'>{comment.body}</p>
      {comment.attachments.length > 0 ? (
        <div className='grid gap-3 sm:grid-cols-2'>
          {comment.attachments.map((attachment) => (
            <AttachmentCard key={attachment.id} attachment={attachment} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function TicketDetailPage(): ReactElement {
  const { ticketId = '' } = useParams();
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const client = useMemo(() => new TicketsClient(api), [api]);
  const [storedTicket, setStoredTicket] = useState<TicketDetail>();
  const [revision, setRevision] = useState(0);
  const ticket = storedTicket?.id === ticketId ? storedTicket : undefined;
  const enabled = Boolean(ticketId);
  const canComment = useCan(
    {
      resource: { type: 'composite', id: 'support.tickets' },
      action: 'comment',
    },
    { enabled },
  ).can;
  const canAttach = useCan(
    {
      resource: { type: 'composite', id: 'support.tickets' },
      action: 'attach',
    },
    { enabled },
  ).can;

  const load = useCallback(() => setRevision((value) => value + 1), []);
  const requestKey = `${ticketId}:${revision}`;
  const [request, setRequest] = useState<{
    readonly key: string;
    readonly error?: unknown;
    readonly loading: boolean;
  }>({ key: '', loading: true });

  useEffect(() => {
    if (!ticketId) return;
    let active = true;
    void client.get(ticketId).then(
      (next) => {
        if (!active) return;
        setStoredTicket(next);
        setRequest({ key: requestKey, loading: false });
      },
      (error: unknown) => {
        if (active) setRequest({ key: requestKey, error, loading: false });
      },
    );
    return () => {
      active = false;
    };
  }, [client, ticketId, requestKey]);

  const current: {
    readonly error?: unknown;
    readonly loading: boolean;
  } = request.key === requestKey ? request : { loading: true };
  const error = current.error;
  const loading = current.loading;

  const [transition, setTransition] = useState<Transition>();
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [transitionError, setTransitionError] = useState<unknown>();

  const [assignOpen, setAssignOpen] = useState(false);
  const [engineers, setEngineers] = useState<
    readonly {
      readonly id: string;
      readonly name: string;
      readonly email: string;
    }[]
  >([]);
  const [engineersLoading, setEngineersLoading] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<unknown>();

  // Loading the engineer list is a response to opening the assign dialog, so it
  // runs in the click handler instead of an effect: an effect would have to set
  // its loading state synchronously while rendering already handles that.
  const openAssign = () => {
    setAssignOpen(true);
    if (engineers.length > 0 || engineersLoading) return;
    setEngineersLoading(true);
    setAssignError(undefined);
    void client.engineers().then(
      (next) => {
        setEngineers(next);
        if (next.length === 1) setAssigneeId(next[0]?.id ?? '');
        setEngineersLoading(false);
      },
      (next: unknown) => {
        setAssignError(next);
        setEngineersLoading(false);
      },
    );
  };

  const runAssign = async () => {
    if (!ticket || !assigneeId || assignBusy) return;
    setAssignBusy(true);
    setAssignError(undefined);
    try {
      const updated = await client.assign(ticket.id, assigneeId);
      setStoredTicket(updated);
      setAssignOpen(false);
      setAssigneeId('');
      toaster.show({
        type: 'success',
        title: t('tickets.actionDone.assign'),
      });
    } catch (next) {
      setAssignError(next);
    } finally {
      setAssignBusy(false);
    }
  };

  const runTransition = async () => {
    if (!ticket || !transition) return;
    setTransitionBusy(true);
    setTransitionError(undefined);
    try {
      const updated =
        transition === 'resolve'
          ? await client.resolve(ticket.id)
          : transition === 'reopen'
            ? await client.reopen(ticket.id)
            : await client.close(ticket.id);
      setStoredTicket(updated);
      setTransition(undefined);
      toaster.show({
        type: 'success',
        title: t(`tickets.actionDone.${transition}`),
      });
    } catch (next) {
      setTransitionError(next);
    } finally {
      setTransitionBusy(false);
    }
  };

  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [commentFile, setCommentFile] = useState<File>();
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<unknown>();

  const addComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ticket || !body.trim() || commentBusy) return;
    setCommentBusy(true);
    setCommentError(undefined);
    try {
      const comment = await client.addComment(ticket.id, body.trim(), internal);
      if (commentFile) {
        try {
          await client.upload(ticket.id, commentFile, comment.id);
        } catch (next) {
          setCommentError(next);
        }
      }
      setBody('');
      setInternal(false);
      setCommentFile(undefined);
      load();
      toaster.show({ type: 'success', title: t('tickets.commentAdded') });
    } catch (next) {
      setCommentError(next);
    } finally {
      setCommentBusy(false);
    }
  };

  const [uploadBusy, setUploadBusy] = useState(false);
  const uploadStandalone = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !ticket) return;
    setUploadBusy(true);
    try {
      await client.upload(ticket.id, file);
      load();
      toaster.show({ type: 'success', title: t('tickets.attachmentAdded') });
    } catch (next) {
      toaster.show({
        type: 'error',
        title:
          next instanceof ApiClientError && next.status === 403
            ? t('tickets.denied')
            : t('tickets.uploadFailed'),
      });
    } finally {
      setUploadBusy(false);
    }
  };

  if (loading && !ticket) {
    return (
      <RouteChildPage>
        <PageContainer className='mx-auto max-w-6xl'>
          <BackButton />
          <Skeleton className='h-10 w-2/3' />
          <Skeleton className='h-40 w-full' />
          <Skeleton className='h-40 w-full' />
        </PageContainer>
      </RouteChildPage>
    );
  }

  if (!ticket) {
    return (
      <RouteChildPage>
        <PageContainer className='mx-auto max-w-6xl'>
          <BackButton />
          <Alert variant='destructive'>
            <AlertDescription>
              {t(
                error instanceof ApiClientError && error.status === 403
                  ? 'tickets.denied'
                  : 'tickets.notFound',
              )}
            </AlertDescription>
          </Alert>
          <Button variant='outline' onClick={load}>
            {t('tickets.retry')}
          </Button>
        </PageContainer>
      </RouteChildPage>
    );
  }

  const descriptionAttachments = ticket.attachments.filter(
    (attachment) => !attachment.commentId,
  );

  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-6xl'>
        <BackButton />
        <PageHeader
          title={ticket.title}
          description={
            <span className='flex flex-wrap items-center gap-2'>
              <span className='font-mono text-xs'>{ticket.ticketNo}</span>
              <span aria-hidden>·</span>
              <span>
                {t('tickets.openedBy', {
                  name: ticket.requester?.name ?? t('tickets.unknownRequester'),
                  date: formatDate(ticket.createdAt),
                })}
              </span>
            </span>
          }
          actions={
            <div className='flex flex-wrap items-center gap-2'>
              <TicketStatusBadge status={ticket.status} />
              <TicketPriorityBadge priority={ticket.priority} />
              <TicketOverdueBadge overdue={ticket.overdue} />
              {ticket.viewer.canAssign &&
              ['open', 'in_progress'].includes(ticket.status) ? (
                <Button size='sm' onClick={openAssign}>
                  <UserCheckIcon />
                  {t(
                    ticket.assignee
                      ? 'tickets.actions.reassign'
                      : 'tickets.actions.assign',
                  )}
                </Button>
              ) : null}
              {ticket.viewer.canResolve && ticket.status === 'in_progress' ? (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => setTransition('resolve')}
                >
                  <CircleCheckBigIcon />
                  {t('tickets.actions.resolve')}
                </Button>
              ) : null}
              {ticket.viewer.canClose && ticket.status === 'resolved' ? (
                <Button size='sm' onClick={() => setTransition('close')}>
                  <CheckCircle2Icon />
                  {t('tickets.actions.close')}
                </Button>
              ) : null}
              {ticket.viewer.canReopen &&
              ['resolved', 'closed'].includes(ticket.status) ? (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => setTransition('reopen')}
                >
                  <RotateCcwIcon />
                  {t('tickets.actions.reopen')}
                </Button>
              ) : null}
            </div>
          }
        />

        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{t('tickets.loadFailed')}</AlertDescription>
          </Alert>
        ) : null}

        <div className='grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]'>
          <div className='flex flex-col gap-6'>
            <Card>
              <CardHeader>
                <CardTitle>{t('tickets.descriptionLabel')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className='whitespace-pre-wrap text-sm leading-7'>
                  {ticket.description}
                </p>
              </CardContent>
            </Card>

            <section
              className='flex flex-col gap-3'
              aria-labelledby='ticket-activity'
            >
              <h2
                id='ticket-activity'
                className='flex items-center gap-2 text-base font-medium'
              >
                <MessageSquareIcon
                  className='size-4 text-muted-foreground'
                  aria-hidden
                />
                {t('tickets.activity')}
                <span className='text-sm font-normal text-muted-foreground'>
                  {ticket.comments.length}
                </span>
              </h2>
              {ticket.comments.length === 0 ? (
                <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                  {t('tickets.noComments')}
                </p>
              ) : (
                <div className='flex flex-col gap-3'>
                  {ticket.comments.map((comment) => (
                    <CommentItem key={comment.id} comment={comment} />
                  ))}
                </div>
              )}

              {canComment ? (
                <form
                  className='flex flex-col gap-3 rounded-lg border bg-card p-4'
                  onSubmit={(event) => void addComment(event)}
                >
                  <Label htmlFor='ticket-comment'>
                    {t('tickets.addComment')}
                  </Label>
                  <Textarea
                    id='ticket-comment'
                    rows={4}
                    maxLength={10000}
                    placeholder={t('tickets.commentPlaceholder')}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                  />
                  <div className='flex flex-wrap items-center gap-4'>
                    {ticket.viewer.canCommentInternal ? (
                      <label className='flex items-center gap-2 text-sm'>
                        <Checkbox
                          checked={internal}
                          onCheckedChange={(value) =>
                            setInternal(Boolean(value))
                          }
                        />
                        {t('tickets.internalNote')}
                      </label>
                    ) : null}
                    {canAttach ? (
                      <label className='flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground'>
                        <PaperclipIcon className='size-4' aria-hidden />
                        {commentFile
                          ? commentFile.name
                          : t('tickets.attachFile')}
                        <input
                          type='file'
                          className='sr-only'
                          onChange={(event) => {
                            setCommentFile(event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                  {commentError ? (
                    <Alert variant='destructive'>
                      <AlertDescription>
                        {t('tickets.commentFailed')}
                        {commentFile
                          ? ` ${t('tickets.commentAttachmentFailed')}`
                          : ''}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <div className='flex justify-end'>
                    <Button
                      type='submit'
                      disabled={commentBusy || !body.trim()}
                    >
                      <SendIcon />
                      {t(commentBusy ? 'tickets.sending' : 'tickets.send')}
                    </Button>
                  </div>
                </form>
              ) : null}
            </section>
          </div>

          <aside className='flex flex-col gap-4'>
            <Card>
              <CardHeader>
                <CardTitle>{t('tickets.details')}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm'>
                  <dt className='text-muted-foreground'>
                    {t('tickets.fields.category')}
                  </dt>
                  <dd>{t(`tickets.category.${ticket.category}`)}</dd>
                  <dt className='text-muted-foreground'>
                    {t('tickets.columns.requester')}
                  </dt>
                  <dd>
                    {ticket.requester?.name ?? t('tickets.unknownRequester')}
                  </dd>
                  <dt className='text-muted-foreground'>
                    {t('tickets.columns.assignee')}
                  </dt>
                  <dd>{ticket.assignee?.name ?? t('tickets.unassigned')}</dd>
                  <dt className='text-muted-foreground'>
                    {t('tickets.updated')}
                  </dt>
                  <dd>{formatDate(ticket.updatedAt)}</dd>
                  {['open', 'in_progress'].includes(ticket.status) ? (
                    <>
                      <dt className='text-muted-foreground'>
                        {t('tickets.slaDeadline')}
                      </dt>
                      <dd
                        className={
                          ticket.overdue ? 'font-medium text-warning' : ''
                        }
                      >
                        {formatDate(ticket.slaDeadline)}
                      </dd>
                    </>
                  ) : null}
                  {ticket.resolvedAt ? (
                    <>
                      <dt className='text-muted-foreground'>
                        {t('tickets.resolved')}
                      </dt>
                      <dd>{formatDate(ticket.resolvedAt)}</dd>
                    </>
                  ) : null}
                  {ticket.closedAt ? (
                    <>
                      <dt className='text-muted-foreground'>
                        {t('tickets.closed')}
                      </dt>
                      <dd>{formatDate(ticket.closedAt)}</dd>
                    </>
                  ) : null}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('tickets.attachments')}</CardTitle>
              </CardHeader>
              <CardContent className='flex flex-col gap-3'>
                {descriptionAttachments.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('tickets.noAttachments')}
                  </p>
                ) : (
                  descriptionAttachments.map((attachment) => (
                    <AttachmentCard
                      key={attachment.id}
                      attachment={attachment}
                    />
                  ))
                )}
                {canAttach ? (
                  <label
                    className={buttonVariants({
                      variant: 'outline',
                      className: uploadBusy
                        ? 'pointer-events-none opacity-50'
                        : 'cursor-pointer',
                    })}
                  >
                    <PaperclipIcon />
                    {t(
                      uploadBusy
                        ? 'tickets.uploading'
                        : 'tickets.addAttachment',
                    )}
                    <input
                      type='file'
                      className='sr-only'
                      disabled={uploadBusy}
                      onChange={(event) => void uploadStandalone(event)}
                    />
                  </label>
                ) : null}
              </CardContent>
            </Card>
          </aside>
        </div>

        <AlertDialog
          open={assignOpen}
          onOpenChange={(open) => {
            if (!open && !assignBusy) {
              setAssignOpen(false);
              setAssignError(undefined);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('tickets.assign.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('tickets.assign.description', { title: ticket.title })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className='flex flex-col gap-2'>
              <Label>{t('tickets.columns.assignee')}</Label>
              <Select
                items={engineers.map((engineer) => ({
                  value: engineer.id,
                  label: engineer.name || engineer.email,
                }))}
                value={assigneeId}
                onValueChange={(value) => setAssigneeId(String(value))}
                disabled={engineersLoading || assignBusy}
              >
                <SelectTrigger aria-label={t('tickets.columns.assignee')}>
                  <SelectValue
                    placeholder={t(
                      engineersLoading
                        ? 'tickets.assign.loading'
                        : 'tickets.assign.placeholder',
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {engineers.map((engineer) => (
                    <SelectItem key={engineer.id} value={engineer.id}>
                      {engineer.name || engineer.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!engineersLoading && engineers.length === 0 && !assignError ? (
                <p className='text-sm text-muted-foreground'>
                  {t('tickets.assign.noEngineers')}
                </p>
              ) : null}
            </div>
            {assignError ? (
              <Alert variant='destructive'>
                <AlertDescription>
                  {t('tickets.assign.failed')}
                </AlertDescription>
              </Alert>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={assignBusy}>
                {t('tickets.cancel')}
              </AlertDialogCancel>
              <Button
                disabled={assignBusy || !assigneeId}
                onClick={() => void runAssign()}
              >
                <UserCheckIcon className='size-4' />
                {t(assignBusy ? 'tickets.working' : 'tickets.actions.assign')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={Boolean(transition)}
          onOpenChange={(open) => {
            if (!open && !transitionBusy) {
              setTransition(undefined);
              setTransitionError(undefined);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t(`tickets.confirm.${transition ?? 'resolve'}.title`)}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t(`tickets.confirm.${transition ?? 'resolve'}.description`, {
                  title: ticket.title,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {transitionError ? (
              <Alert variant='destructive'>
                <AlertDescription>
                  {transitionError instanceof ApiClientError &&
                  transitionError.status === 409
                    ? t('tickets.transitionConflict')
                    : t('tickets.actionFailed')}
                </AlertDescription>
              </Alert>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={transitionBusy}>
                {t('tickets.cancel')}
              </AlertDialogCancel>
              <Button
                disabled={transitionBusy}
                onClick={() => void runTransition()}
              >
                {transition === 'reopen' ? (
                  <RotateCcwIcon className='size-4' />
                ) : transition === 'resolve' ? (
                  <CircleCheckBigIcon className='size-4' />
                ) : (
                  <CheckCircle2Icon className='size-4' />
                )}
                {t(
                  transitionBusy
                    ? 'tickets.working'
                    : `tickets.actions.${transition ?? 'resolve'}`,
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </RouteChildPage>
  );
}
