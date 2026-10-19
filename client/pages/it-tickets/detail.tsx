import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightIcon,
  CircleCheckIcon,
  CircleDotIcon,
  FileTextIcon,
  MessageSquareIcon,
  RotateCcwIcon,
  UserPlusIcon,
  XCircleIcon,
} from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { Loading } from '#components/loading';
import { RouteDrawer } from '#components/route-drawer';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Spinner } from '#components/ui/spinner';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
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
  getEngineers,
  getTicket,
  runTicketAction,
  shouldRetryRequest,
  type TicketAction,
} from './api.js';
import { formatBytes, formatDate, statusLabel } from './labels.js';
import { StatusPill, UrgencyPill } from './pills.js';
import type {
  TicketActivity,
  TicketAttachment,
  TicketDetail,
} from './types.js';

type ActionKind = TicketAction['kind'];

export default function TicketDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const params = useParams();
  const ticketId = Number(params.ticketId);
  const validId = Number.isInteger(ticketId) && ticketId > 0;
  const [action, setAction] = useState<ActionKind>();
  const queryClient = useQueryClient();
  const toaster = useToaster();

  const ticket = useQuery({
    queryKey: ['it-tickets', 'detail', ticketId],
    queryFn: ({ signal }) => getTicket(api, ticketId, signal),
    enabled: validId,
    retry: shouldRetryRequest,
  });

  const data = ticket.data?.data;
  const errorStatus =
    ticket.error instanceof ApiClientError ? ticket.error.status : undefined;

  async function applyUpdate(updated: TicketDetail): Promise<void> {
    queryClient.setQueryData(['it-tickets', 'detail', ticketId], {
      data: updated,
    });
    await queryClient.invalidateQueries({ queryKey: ['it-tickets'] });
  }

  return (
    <RouteDrawer
      title={
        data ? `${data.number} · ${data.title}` : t('itTickets.detail.title')
      }
      description={
        data ? (
          <span className='flex flex-wrap items-center gap-2'>
            <StatusPill status={data.status} t={t} />
            <UrgencyPill urgency={data.urgency} t={t} />
          </span>
        ) : (
          t('itTickets.detail.description')
        )
      }
      footer={
        data ? (
          <>
            {data.permissions.canComment ? (
              <Button variant='outline' onClick={() => setAction('comment')}>
                <MessageSquareIcon data-icon='inline-start' />
                {t('itTickets.actions.comment')}
              </Button>
            ) : null}
            {data.permissions.canProgress ? (
              <Button variant='outline' onClick={() => setAction('progress')}>
                {t('itTickets.actions.progress')}
              </Button>
            ) : null}
            {data.permissions.canReturn ? (
              <Button variant='outline' onClick={() => setAction('return')}>
                <RotateCcwIcon data-icon='inline-start' />
                {t('itTickets.actions.return')}
              </Button>
            ) : null}
            {data.permissions.canAssign ? (
              <Button
                variant={data.assigneeId ? 'outline' : 'default'}
                onClick={() => setAction('assign')}
              >
                <UserPlusIcon data-icon='inline-start' />
                {data.assigneeId
                  ? t('itTickets.actions.reassign')
                  : t('itTickets.actions.assign')}
              </Button>
            ) : null}
            {data.permissions.canResolve ? (
              <Button onClick={() => setAction('resolve')}>
                <CircleCheckIcon data-icon='inline-start' />
                {t('itTickets.actions.resolve')}
              </Button>
            ) : null}
            {data.permissions.canClose ? (
              <Button onClick={() => setAction('close')}>
                <XCircleIcon data-icon='inline-start' />
                {t('itTickets.actions.close')}
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {!validId ? (
        <NotFound />
      ) : ticket.isPending ? (
        <Loading className='min-h-72' />
      ) : ticket.error ? (
        errorStatus === 401 ? (
          <SessionExpiredAlert />
        ) : (
          <Alert variant='destructive'>
            <AlertTitle>
              {errorStatus === 404 || errorStatus === 403
                ? t('itTickets.detail.notFoundTitle')
                : t('itTickets.detail.loadFailed')}
            </AlertTitle>
            <AlertDescription className='flex flex-wrap items-center justify-between gap-3'>
              <span>
                {errorStatus === 404 || errorStatus === 403
                  ? t('itTickets.detail.notFoundDescription')
                  : t('itTickets.errors.requestFailed')}
              </span>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void ticket.refetch()}
              >
                {t('itTickets.actions.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        )
      ) : data ? (
        <TicketDetailBody ticket={data} />
      ) : (
        <NotFound />
      )}

      {data && action ? (
        <TicketActionDialog
          kind={action}
          ticket={data}
          onOpenChange={(open) => {
            if (!open) setAction(undefined);
          }}
          onSaved={async (updated) => {
            await applyUpdate(updated);
            setAction(undefined);
            void toaster.show({
              type: 'success',
              title: t('itTickets.actions.updated'),
            });
          }}
        />
      ) : null}
    </RouteDrawer>
  );
}

function TicketDetailBody({
  ticket,
}: {
  readonly ticket: TicketDetail;
}): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <div className='space-y-7'>
      <section aria-labelledby='it-ticket-description-heading'>
        <h2 id='it-ticket-description-heading' className='sr-only'>
          {t('itTickets.fields.description')}
        </h2>
        <p className='rounded-lg border bg-muted/20 p-4 text-sm leading-6 whitespace-pre-wrap'>
          {ticket.description}
        </p>
      </section>

      <section aria-labelledby='it-ticket-details-heading'>
        <h2 id='it-ticket-details-heading' className='mb-3 text-sm font-medium'>
          {t('itTickets.detail.summary')}
        </h2>
        <dl className='grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2'>
          <Detail
            label={t('itTickets.columns.requester')}
            value={ticket.requesterName}
          />
          <Detail
            label={t('itTickets.columns.assignee')}
            value={ticket.assigneeName ?? t('itTickets.unassigned')}
          />
          <Detail
            label={t('itTickets.detail.opened')}
            value={formatDate(ticket.createdAt, i18n.language)}
          />
          <Detail
            label={t('itTickets.detail.lastUpdated')}
            value={formatDate(ticket.updatedAt, i18n.language)}
          />
          {ticket.resolvedAt ? (
            <Detail
              label={t('itTickets.detail.resolved')}
              value={formatDate(ticket.resolvedAt, i18n.language)}
            />
          ) : null}
          {ticket.closedAt ? (
            <Detail
              label={t('itTickets.detail.closed')}
              value={formatDate(ticket.closedAt, i18n.language)}
            />
          ) : null}
        </dl>
      </section>

      {ticket.resolution ? (
        <section aria-labelledby='it-ticket-resolution-heading'>
          <h2
            id='it-ticket-resolution-heading'
            className='mb-3 text-sm font-medium'
          >
            {t('itTickets.detail.resolution')}
          </h2>
          <p className='rounded-lg border border-(--status-success)/20 bg-(--status-success-background) p-4 text-sm leading-6 whitespace-pre-wrap'>
            {ticket.resolution}
          </p>
        </section>
      ) : null}

      <section aria-labelledby='it-ticket-attachments-heading'>
        <h2
          id='it-ticket-attachments-heading'
          className='mb-3 text-sm font-medium'
        >
          {t('itTickets.detail.attachments')}
        </h2>
        {ticket.attachments.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('itTickets.detail.noAttachments')}
          </p>
        ) : (
          <ul className='grid gap-3 sm:grid-cols-2'>
            {ticket.attachments.map((attachment) => (
              <AttachmentItem
                key={attachment.id}
                attachment={attachment}
                language={i18n.language}
              />
            ))}
          </ul>
        )}
      </section>

      <Separator />

      <section aria-labelledby='it-ticket-timeline-heading'>
        <h2
          id='it-ticket-timeline-heading'
          className='mb-3 text-sm font-medium'
        >
          {t('itTickets.detail.timeline')}
        </h2>
        {ticket.activities.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('itTickets.detail.noActivity')}
          </p>
        ) : (
          <ol className='space-y-0'>
            {ticket.activities.map((activity, index) => (
              <TimelineItem
                key={activity.id}
                activity={activity}
                last={index === ticket.activities.length - 1}
                language={i18n.language}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
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
    <div className='flex flex-col gap-0.5'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='font-medium'>{value}</dd>
    </div>
  );
}

function AttachmentItem({
  attachment,
  language,
}: {
  readonly attachment: TicketAttachment;
  readonly language: string | undefined;
}): ReactElement {
  const { t } = useTranslation();
  // The file repository returns contentUrl already prefixed with the runtime
  // mount path; resolving it again would double that prefix.
  const href = attachment.contentUrl;
  const image = attachment.mimeType.startsWith('image/');
  return (
    <li>
      <a
        href={href}
        target='_blank'
        rel='noreferrer'
        className='group flex gap-3 rounded-xl border bg-card p-2 transition-colors hover:bg-muted/40'
      >
        {image ? (
          <img
            src={href}
            alt={attachment.filename}
            loading='lazy'
            className='size-16 shrink-0 rounded-lg border bg-muted object-cover'
          />
        ) : (
          <span className='flex size-16 shrink-0 items-center justify-center rounded-lg border bg-muted'>
            <FileTextIcon
              className='size-6 text-muted-foreground'
              aria-hidden
            />
          </span>
        )}
        <span className='min-w-0 py-1'>
          <span className='block truncate text-sm font-medium group-hover:underline'>
            {attachment.filename}
          </span>
          <span className='mt-0.5 block text-xs text-muted-foreground'>
            {formatBytes(attachment.size)} ·{' '}
            {formatDate(attachment.createdAt, language)}
          </span>
          <span className='sr-only'>
            {t('itTickets.detail.openAttachment')}
          </span>
        </span>
      </a>
    </li>
  );
}

const ACTIVITY_ICONS = {
  created: CircleDotIcon,
  assigned: UserPlusIcon,
  progress: CircleDotIcon,
  comment: MessageSquareIcon,
  resolved: CircleCheckIcon,
  returned: RotateCcwIcon,
  closed: XCircleIcon,
} as const;

function TimelineItem({
  activity,
  last,
  language,
}: {
  readonly activity: TicketActivity;
  readonly last: boolean;
  readonly language: string | undefined;
}): ReactElement {
  const { t } = useTranslation();
  const Icon =
    ACTIVITY_ICONS[activity.type as keyof typeof ACTIVITY_ICONS] ??
    CircleDotIcon;
  return (
    <li className='flex gap-3'>
      <div className='flex flex-col items-center'>
        <span className='flex size-7 shrink-0 items-center justify-center rounded-full border bg-card'>
          <Icon className='size-3.5 text-muted-foreground' aria-hidden />
        </span>
        {!last ? <span className='w-px flex-1 bg-border' aria-hidden /> : null}
      </div>
      <div className='min-w-0 flex-1 pb-5'>
        <div className='flex flex-wrap items-baseline gap-x-2 gap-y-0.5'>
          <span className='text-sm font-medium'>
            {t(`itTickets.activity.${activity.type}`, {
              defaultValue: activity.type,
            })}
          </span>
          <span className='text-xs text-muted-foreground'>
            {activity.authorName} · {formatDate(activity.createdAt, language)}
          </span>
        </div>
        {activity.fromStatus && activity.toStatus ? (
          <p className='mt-1 flex items-center gap-1 text-xs text-muted-foreground'>
            {statusLabel(t, activity.fromStatus)}
            <ArrowRightIcon className='size-3' aria-hidden />
            {statusLabel(t, activity.toStatus)}
          </p>
        ) : null}
        {activity.content ? (
          <p className='mt-1.5 text-sm leading-6 whitespace-pre-wrap'>
            {activity.content}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function NotFound(): ReactElement {
  const { t } = useTranslation();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <FileTextIcon />
        </EmptyMedia>
        <EmptyTitle>{t('itTickets.detail.notFoundTitle')}</EmptyTitle>
        <EmptyDescription>
          {t('itTickets.detail.notFoundDescription')}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

const ACTION_COPY = {
  assign: {
    title: 'itTickets.actionDialog.assignTitle',
    description: 'itTickets.actionDialog.assignDescription',
    submit: 'itTickets.actions.assign',
    field: 'itTickets.fields.assignee',
    placeholder: '',
  },
  progress: {
    title: 'itTickets.actionDialog.progressTitle',
    description: 'itTickets.actionDialog.progressDescription',
    submit: 'itTickets.actions.progress',
    field: 'itTickets.fields.note',
    placeholder: 'itTickets.actionDialog.progressPlaceholder',
  },
  resolve: {
    title: 'itTickets.actionDialog.resolveTitle',
    description: 'itTickets.actionDialog.resolveDescription',
    submit: 'itTickets.actions.resolve',
    field: 'itTickets.fields.resolution',
    placeholder: 'itTickets.actionDialog.resolvePlaceholder',
  },
  return: {
    title: 'itTickets.actionDialog.returnTitle',
    description: 'itTickets.actionDialog.returnDescription',
    submit: 'itTickets.actions.return',
    field: 'itTickets.fields.reason',
    placeholder: 'itTickets.actionDialog.returnPlaceholder',
  },
  comment: {
    title: 'itTickets.actionDialog.commentTitle',
    description: 'itTickets.actionDialog.commentDescription',
    submit: 'itTickets.actions.comment',
    field: 'itTickets.fields.comment',
    placeholder: 'itTickets.actionDialog.commentPlaceholder',
  },
  close: {
    title: 'itTickets.actionDialog.closeTitle',
    description: 'itTickets.actionDialog.closeDescription',
    submit: 'itTickets.actions.close',
    field: '',
    placeholder: '',
  },
} as const;

function TicketActionDialog({
  kind,
  ticket,
  onOpenChange,
  onSaved,
}: {
  readonly kind: ActionKind;
  readonly ticket: TicketDetail;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: (ticket: TicketDetail) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [content, setContent] = useState('');
  const [assigneeId, setAssigneeId] = useState(ticket.assigneeId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [fieldError, setFieldError] = useState<string>();
  const copy = ACTION_COPY[kind];
  const needsText = kind !== 'assign' && kind !== 'close';

  const engineers = useQuery({
    queryKey: ['it-tickets', 'engineers'],
    queryFn: ({ signal }) => getEngineers(api, signal),
    enabled: kind === 'assign',
    retry: shouldRetryRequest,
  });
  const selectedEngineer = engineers.data?.data.find(
    (engineer) => engineer.id === assigneeId,
  );
  const selectedEngineerLabel = selectedEngineer
    ? `${selectedEngineer.name} · ${selectedEngineer.email}`
    : assigneeId
      ? (ticket.assigneeName ?? t('itTickets.actionDialog.loadingEngineers'))
      : undefined;

  async function perform(action: TicketAction): Promise<void> {
    setError(undefined);
    setBusy(true);
    try {
      const result = await runTicketAction(api, ticket.id, action);
      await onSaved(result.data);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    setFieldError(undefined);
    if (kind === 'assign' && !assigneeId) {
      setFieldError(t('itTickets.actionDialog.assigneeRequired'));
      return;
    }
    if (needsText && !content.trim()) {
      setFieldError(t('itTickets.actionDialog.contentRequired'));
      return;
    }
    const action: TicketAction =
      kind === 'assign'
        ? { kind, assigneeId }
        : kind === 'resolve'
          ? { kind, resolution: content.trim() }
          : kind === 'return'
            ? { kind, reason: content.trim() }
            : kind === 'close'
              ? { kind }
              : { kind, content: content.trim() };
    await perform(action);
  }

  const errorStatus =
    error instanceof ApiClientError ? error.status : undefined;

  if (kind === 'close') {
    return (
      <AlertDialog open onOpenChange={(open) => !busy && onOpenChange(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(copy.title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(copy.description)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {errorStatus === 401 ? (
            <SessionExpiredAlert />
          ) : error ? (
            <p role='alert' className='text-sm text-destructive'>
              {errorStatus === 409
                ? t('itTickets.errors.invalidState')
                : errorStatus === 403
                  ? t('itTickets.errors.forbidden')
                  : t('itTickets.errors.requestFailed')}
            </p>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('itTickets.actionDialog.closeHint')}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void perform({ kind: 'close' });
              }}
            >
              {busy ? <Spinner data-icon='inline-start' /> : null}
              {t(copy.submit)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !busy && onOpenChange(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(copy.title)}</DialogTitle>
          <DialogDescription>{t(copy.description)}</DialogDescription>
        </DialogHeader>
        <form
          id='it-ticket-action-form'
          onSubmit={(event) => void submit(event)}
        >
          <FieldGroup>
            {errorStatus === 401 ? (
              <SessionExpiredAlert />
            ) : error ? (
              <p role='alert' className='text-sm text-destructive'>
                {errorStatus === 409
                  ? t('itTickets.errors.invalidState')
                  : errorStatus === 403
                    ? t('itTickets.errors.forbidden')
                    : t('itTickets.errors.requestFailed')}
              </p>
            ) : null}
            {kind === 'assign' ? (
              <Field data-invalid={Boolean(fieldError)}>
                <FieldLabel>{t(copy.field)}</FieldLabel>
                {engineers.isPending ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('itTickets.actionDialog.loadingEngineers')}
                  </p>
                ) : engineers.error ? (
                  <p className='text-sm text-destructive'>
                    {t('itTickets.actionDialog.engineersFailed')}
                  </p>
                ) : (
                  <Select
                    value={assigneeId || null}
                    onValueChange={(next: string | null) => {
                      if (next) setAssigneeId(next);
                    }}
                  >
                    <SelectTrigger
                      className='w-full'
                      aria-label={t(copy.field)}
                    >
                      <SelectValue
                        placeholder={t('itTickets.actionDialog.chooseEngineer')}
                      >
                        {selectedEngineerLabel}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(engineers.data?.data ?? []).map((engineer) => (
                        <SelectItem key={engineer.id} value={engineer.id}>
                          {engineer.name} · {engineer.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {fieldError ? <FieldError>{fieldError}</FieldError> : null}
                <FieldDescription>
                  {t('itTickets.actionDialog.assignHint')}
                </FieldDescription>
              </Field>
            ) : needsText ? (
              <Field data-invalid={Boolean(fieldError)}>
                <FieldLabel htmlFor='it-ticket-action-content'>
                  {t(copy.field)}
                </FieldLabel>
                <Textarea
                  id='it-ticket-action-content'
                  value={content}
                  rows={kind === 'comment' || kind === 'resolve' ? 6 : 4}
                  maxLength={4000}
                  placeholder={t(copy.placeholder)}
                  aria-invalid={Boolean(fieldError)}
                  onChange={(event) => setContent(event.target.value)}
                  autoFocus
                />
                {fieldError ? <FieldError>{fieldError}</FieldError> : null}
                <FieldDescription>
                  {t('itTickets.actionDialog.contentHint')}
                </FieldDescription>
              </Field>
            ) : null}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button type='submit' form='it-ticket-action-form' disabled={busy}>
            {busy ? <Spinner data-icon='inline-start' /> : null}
            {t(copy.submit)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
