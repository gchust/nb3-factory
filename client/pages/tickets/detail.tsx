import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { Alert, AlertDescription } from '#components/ui/alert';
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
import { Field, FieldDescription, FieldLabel } from '#components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Separator } from '#components/ui/separator';
import { Textarea } from '#components/ui/textarea';
import {
  clientFileRepositoryManagerToken,
  FilePreviewField,
  type FileRecord,
} from '#extensions/nocobase-file-component-ui';
import { useApiClient, useService, useToaster } from '@nocobase/app-client';

import { useTranslation } from '@nocobase/i18n/client';
import { CheckCircle2Icon, ClockIcon, MessageSquareIcon } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import {
  TICKET_STATUSES,
  errorMessage,
  useTicketRequest,
  type AvailableTransition,
  type DataBody,
  type PageBody,
  type TicketAssignee,
  type TicketComment,
  type TicketDetail,
  type TicketStatus,
  type TicketTransition,
} from './api.js';
import {
  TicketError,
  TicketLoading,
  TicketMeta,
  TicketStatusBadge,
  TicketUrgencyBadge,
} from './shared.js';
import { useTicketLabels } from './hooks.js';

/** The transitions that ask the person for something before they can be fired. */
function inputFor(
  transition: TicketTransition,
): 'assignee' | 'resolution' | 'reason' | undefined {
  switch (transition) {
    case 'assign':
    case 'reassign':
      return 'assignee';
    case 'resolve':
      return 'resolution';
    case 'returnForRework':
    case 'reopen':
      return 'reason';
    default:
      return undefined;
  }
}

/**
 * One ticket, from its report to its confirmation.
 *
 * Everything the page offers comes from the lifecycle's own answer: `available` names the transitions this caller may
 * fire and the blockers that keep the others unavailable, so a button the server would refuse is never drawn as if it
 * would work. Firing one and adding a comment both reload the ticket, because a transition rewrites the state, the
 * history and the discussion together.
 */
export default function TicketDetailPage(): ReactElement {
  const { ticketId = '' } = useParams();
  const request = useTicketRequest<DataBody<TicketDetail>>(
    `tickets/${encodeURIComponent(ticketId)}`,
  );
  const detail = request.data?.data;

  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-4xl'>
        <BackButton />
        {request.error ? (
          <TicketError error={request.error} retry={request.reload} />
        ) : !detail ? (
          <TicketLoading />
        ) : (
          <TicketBody detail={detail} reload={request.reload} />
        )}
      </PageContainer>
    </RouteChildPage>
  );
}

function TicketBody({
  detail,
  reload,
}: {
  readonly detail: TicketDetail;
  readonly reload: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const { ticket } = detail;
  const allowed = detail.available.filter((item) => item.allowed);
  const blocked = detail.available.filter((item) => !item.allowed);

  return (
    <>
      <PageHeader
        title={ticket.title}
        description={
          <span className='flex flex-wrap items-center gap-2'>
            <TicketStatusBadge status={ticket.status} />
            <TicketUrgencyBadge urgency={ticket.urgency} />
            <span className='text-xs text-muted-foreground'>
              #{ticket.id.slice(0, 8)}
            </span>
          </span>
        }
      />
      <StatusSteps status={ticket.status} />
      <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]'>
        <div className='flex flex-col gap-4'>
          <Card>
            <CardHeader>
              <CardTitle>{t('tickets.detail.request')}</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              <p className='text-sm whitespace-pre-wrap text-muted-foreground'>
                {ticket.description || t('tickets.detail.noDescription')}
              </p>
              <Separator />
              <div className='grid grid-cols-2 gap-4 sm:grid-cols-3'>
                <TicketMeta label={t('tickets.reporter')}>
                  {ticket.reporterName}
                </TicketMeta>
                <TicketMeta label={t('tickets.assignee')}>
                  {ticket.assigneeName ?? t('tickets.unassigned')}
                </TicketMeta>
                <TicketMeta label={t('tickets.categoryLabel')}>
                  {labels.category(ticket.category)}
                </TicketMeta>
                <TicketMeta label={t('tickets.createdAt')}>
                  {labels.date(ticket.createdAt)}
                </TicketMeta>
                <TicketMeta label={t('tickets.statusChangedAt')}>
                  {labels.date(ticket.statusChangedAt)}
                </TicketMeta>
                <TicketMeta label={t('tickets.detail.reopenCount')}>
                  {ticket.reopenCount}
                </TicketMeta>
                {ticket.resolvedAt ? (
                  <TicketMeta label={t('tickets.resolvedAt')}>
                    {labels.date(ticket.resolvedAt)}
                  </TicketMeta>
                ) : null}
                {ticket.closedAt ? (
                  <TicketMeta label={t('tickets.closedAt')}>
                    {labels.date(ticket.closedAt)}
                  </TicketMeta>
                ) : null}
              </div>
              {ticket.resolution ? (
                <>
                  <Separator />
                  <TicketMeta label={t('tickets.detail.resolution')}>
                    <span className='whitespace-pre-wrap'>
                      {ticket.resolution}
                    </span>
                  </TicketMeta>
                </>
              ) : null}
              {ticket.attachmentId ? (
                <>
                  <Separator />
                  <TicketMeta label={t('tickets.detail.screenshot')}>
                    <AttachmentPreview fileId={ticket.attachmentId} />
                  </TicketMeta>
                </>
              ) : null}
            </CardContent>
          </Card>
          <Discussion detail={detail} reload={reload} />
          <HistoryTimeline detail={detail} />
        </div>
        <TicketActions
          ticketId={ticket.id}
          version={detail.version}
          allowed={allowed}
          blocked={blocked}
          reload={reload}
        />
      </div>
    </>
  );
}

/** The five states, in order, so a reader can see where the ticket stands and what comes next. */
function StatusSteps({
  status,
}: {
  readonly status: TicketStatus;
}): ReactElement {
  const { t } = useTranslation();
  const current = TICKET_STATUSES.indexOf(status);
  return (
    <ol className='flex flex-wrap items-center gap-2'>
      {TICKET_STATUSES.map((step, index) => (
        <li key={step} className='flex items-center gap-2'>
          <span
            className={
              index <= current
                ? 'flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary'
                : 'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground'
            }
          >
            {index < current ? (
              <CheckCircle2Icon className='size-3.5' aria-hidden />
            ) : (
              <ClockIcon className='size-3.5' aria-hidden />
            )}
            {t(`tickets.status.${step}`, { defaultValue: step })}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The screenshot the ticket names.
 *
 * The file is read through the `ticketAttachments` repository, which is scoped to the tickets this caller may see, so
 * the bytes are only ever handed to someone the ticket itself is visible to.
 */
function AttachmentPreview({
  fileId,
}: {
  readonly fileId: string;
}): ReactElement {
  const { t } = useTranslation();
  const files = useService(clientFileRepositoryManagerToken);
  const repository = files.repository('ticketAttachments');
  const [record, setRecord] = useState<FileRecord>();

  useEffect(() => {
    let active = true;
    void repository.findOne({ filter: { id: fileId } }).then(
      (next) => {
        if (active) setRecord(next);
      },
      () => {
        if (active) setRecord(undefined);
      },
    );
    return () => {
      active = false;
    };
  }, [repository, fileId]);

  if (!record) {
    return <span className='text-sm text-muted-foreground'>…</span>;
  }
  return (
    <FilePreviewField
      files={[record]}
      showFilenames
      labels={{ preview: t('tickets.detail.preview') }}
    />
  );
}

/**
 * The transitions this caller may fire.
 *
 * A transition that needs an input opens a small form for it; one that does not is fired directly. The transitions
 * this caller may not fire are still listed, with the lifecycle's own reason, because "you cannot do this" is more
 * useful than a button that silently disappears.
 */
function TicketActions({
  ticketId,
  version,
  allowed,
  blocked,
  reload,
}: {
  readonly ticketId: string;
  readonly version: number | null;
  readonly allowed: readonly AvailableTransition[];
  readonly blocked: readonly AvailableTransition[];
  readonly reload: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const [open, setOpen] = useState<TicketTransition>();

  return (
    <aside className='flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start'>
      <Card>
        <CardHeader>
          <CardTitle>{t('tickets.detail.actions')}</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-2'>
          {allowed.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('tickets.detail.noActions')}
            </p>
          ) : (
            allowed.map((item) => (
              <Button
                key={item.name}
                className='w-full justify-start'
                variant={item.name === 'confirm' ? 'default' : 'outline'}
                onClick={() => setOpen(item.name)}
              >
                {labels.transition(item.name)}
              </Button>
            ))
          )}
          {blocked.length > 0 && (
            <>
              <Separator />
              <ul className='flex flex-col gap-2'>
                {blocked.map((item) => (
                  <li key={item.name} className='text-xs'>
                    <span className='font-medium text-muted-foreground'>
                      {labels.transition(item.name)}
                    </span>
                    <span className='block text-muted-foreground'>
                      {item.blockers
                        .map((blocker) => blocker.message)
                        .join('; ') || t('tickets.detail.blocked')}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
      {open ? (
        <TransitionDialog
          ticketId={ticketId}
          version={version}
          transition={open}
          onClose={() => setOpen(undefined)}
          onDone={() => {
            setOpen(undefined);
            reload();
          }}
        />
      ) : null}
    </aside>
  );
}

function TransitionDialog({
  ticketId,
  version,
  transition,
  onClose,
  onDone,
}: {
  readonly ticketId: string;
  readonly version: number | null;
  readonly transition: TicketTransition;
  readonly onClose: () => void;
  readonly onDone: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const api = useApiClient();
  const toaster = useToaster();
  const needs = inputFor(transition);
  const [assigneeId, setAssigneeId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  // One id per opening: a double click or a retry after a lost response fires the transition once.
  const [requestId] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`,
  );

  const engineers = useTicketRequest<PageBody<TicketAssignee>>(
    'tickets/assignableUsers',
    undefined,
    needs === 'assignee',
  );
  const options = engineers.data?.data ?? [];

  const ready =
    needs === 'assignee'
      ? Boolean(assigneeId)
      : needs
        ? Boolean(text.trim())
        : true;

  const fire = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await api.request({
        path: `tickets/${encodeURIComponent(ticketId)}/transitions/${transition}`,
        method: 'POST',
        json: {
          ...(needs === 'assignee'
            ? {
                assigneeId,
                assigneeName:
                  options.find((option) => option.id === assigneeId)?.name ??
                  assigneeId,
              }
            : {}),
          ...(needs === 'resolution' ? { resolution: text.trim() } : {}),
          ...(needs === 'reason' ? { reason: text.trim() } : {}),
          ...(version !== null ? { version } : {}),
          requestId,
        },
      });
      toaster.show({
        type: 'success',
        title: t('tickets.detail.transitionDone', {
          name: labels.transition(transition),
        }),
      });
      onDone();
    } catch (next) {
      setError(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.transition(transition)}</DialogTitle>
          <DialogDescription>
            {t(`tickets.detail.transitionHint.${transition}`, {
              defaultValue: t('tickets.detail.transitionHint.default'),
            })}
          </DialogDescription>
        </DialogHeader>
        {needs === 'assignee' ? (
          <Field>
            <FieldLabel>{t('tickets.assignee')}</FieldLabel>
            <Select
              items={options.map((option) => ({
                value: option.id,
                label: option.name,
              }))}
              value={assigneeId}
              onValueChange={(value) => setAssigneeId(String(value))}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder={t('tickets.detail.chooseEngineer')} />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {options.length === 0 && !engineers.loading ? (
              <FieldDescription>
                {t('tickets.detail.noEngineers')}
              </FieldDescription>
            ) : null}
          </Field>
        ) : null}
        {needs === 'resolution' ? (
          <Field>
            <FieldLabel>{t('tickets.detail.resolution')}</FieldLabel>
            <Textarea
              rows={4}
              value={text}
              placeholder={t('tickets.detail.resolutionPlaceholder')}
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
        ) : null}
        {needs === 'reason' ? (
          <Field>
            <FieldLabel>{t('tickets.detail.reason')}</FieldLabel>
            <Textarea
              rows={4}
              value={text}
              placeholder={t('tickets.detail.reasonPlaceholder')}
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
        ) : null}
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {errorMessage(error) ?? t('tickets.error.failed')}
            </AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button variant='outline' disabled={busy} onClick={onClose}>
            {t('tickets.form.cancel')}
          </Button>
          <Button disabled={busy || !ready} onClick={() => void fire()}>
            {busy
              ? t('tickets.form.submitting')
              : t('tickets.detail.confirmAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The ticket's discussion: the comments people wrote, and a box to add one. */
function Discussion({
  detail,
  reload,
}: {
  readonly detail: TicketDetail;
  readonly reload: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const api = useApiClient();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const submit = async (): Promise<void> => {
    if (!body.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.request({
        path: `tickets/${encodeURIComponent(detail.ticket.id)}/comments`,
        method: 'POST',
        json: { body: body.trim() },
      });
      setBody('');
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
          <MessageSquareIcon
            className='size-4 text-muted-foreground'
            aria-hidden
          />
          {t('tickets.detail.discussion')}
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {detail.comments.length ? (
          <ul className='flex flex-col gap-3'>
            {detail.comments.map((comment) => (
              <CommentRow key={comment.id} comment={comment} />
            ))}
          </ul>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('tickets.detail.noComments')}
          </p>
        )}
        <Separator />
        <Field>
          <FieldLabel htmlFor='ticket-comment'>
            {t('tickets.detail.addComment')}
          </FieldLabel>
          <Textarea
            id='ticket-comment'
            rows={3}
            value={body}
            placeholder={t('tickets.detail.commentPlaceholder')}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {errorMessage(error) ?? t('tickets.error.failed')}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className='flex justify-end'>
          <Button disabled={busy || !body.trim()} onClick={() => void submit()}>
            {busy ? t('tickets.form.submitting') : t('tickets.detail.post')}
          </Button>
        </div>
        <p className='text-xs text-muted-foreground'>
          {t('tickets.detail.lastChange', {
            at: labels.date(detail.ticket.updatedAt),
          })}
        </p>
      </CardContent>
    </Card>
  );
}

function CommentRow({
  comment,
}: {
  readonly comment: TicketComment;
}): ReactElement {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  return (
    <li className='flex flex-col gap-1 rounded-lg border bg-muted/20 p-3'>
      <span className='flex items-center gap-2 text-xs text-muted-foreground'>
        <span className='font-medium text-foreground'>
          {comment.authorName}
        </span>
        <span>{labels.date(comment.createdAt)}</span>
        {comment.kind !== 'comment' ? (
          <span className='rounded-full bg-muted px-2 py-0.5'>
            {t(`tickets.commentKind.${comment.kind}`, {
              defaultValue: comment.kind,
            })}
          </span>
        ) : null}
      </span>
      <span className='text-sm whitespace-pre-wrap'>{comment.body}</span>
    </li>
  );
}

/** What the lifecycle recorded: every transition, and whether the notice it queued was delivered. */
function HistoryTimeline({
  detail,
}: {
  readonly detail: TicketDetail;
}): ReactElement {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const entries = useMemo(
    () => [...detail.history.transitions].sort((a, b) => a.version - b.version),
    [detail.history.transitions],
  );
  const effectsByTransition = useMemo(() => {
    const map = new Map<
      string,
      TicketDetail['history']['effectRuns'][number][]
    >();
    for (const run of detail.history.effectRuns) {
      const list = map.get(run.transitionId) ?? [];
      list.push(run);
      map.set(run.transitionId, list);
    }
    return map;
  }, [detail.history.effectRuns]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tickets.detail.history')}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length ? (
          <ol className='flex flex-col gap-3'>
            {entries.map((entry) => (
              <li
                key={entry.id}
                className='flex flex-col gap-1 border-l-2 pl-3'
              >
                <span className='text-sm'>
                  <span className='font-medium'>
                    {labels.transition(entry.transition)}
                  </span>{' '}
                  <span className='text-muted-foreground'>
                    {entry.from
                      ? `${labels.status(entry.from)} → ${labels.status(entry.to)}`
                      : labels.status(entry.to)}
                  </span>
                </span>
                <span className='text-xs text-muted-foreground'>
                  {labels.date(entry.at)}
                </span>
                {(effectsByTransition.get(entry.id) ?? []).map((run) => (
                  <span key={run.id} className='text-xs text-muted-foreground'>
                    {t('tickets.detail.effect', {
                      name: run.effect,
                      status: t(`tickets.effectStatus.${run.status}`, {
                        defaultValue: run.status,
                      }),
                    })}
                    {run.error ? ` — ${run.error}` : ''}
                  </span>
                ))}
              </li>
            ))}
          </ol>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('tickets.detail.noHistory')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
