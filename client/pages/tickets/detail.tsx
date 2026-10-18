import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CheckCircle2Icon,
  MessageSquareIcon,
  RotateCcwIcon,
  SendIcon,
  ShieldAlertIcon,
  UserCheckIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { useParams } from 'react-router';

import { Loading } from '#components/loading';
import { RouteDrawer } from '#components/route-drawer';
import { useRouteOverlay } from '#components/use-route-overlay';
import { Button } from '#components/ui/button';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Separator } from '#components/ui/separator';
import { Spinner } from '#components/ui/spinner';
import { Textarea } from '#components/ui/textarea';

import { AttachmentList } from './attachments.js';
import type {
  Assignee,
  ServiceDeskAction,
  ServiceDeskTicket,
  TicketActivity,
} from './types.js';
import { formatDate, requestErrorMessage } from './ticket-format.js';
import { OverdueBadge, PriorityBadge, TicketStatusBadge } from './ticket-ui.js';

export default function TicketDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const params = useParams<{ ticketId: string }>();
  const ticketId = Number(params.ticketId);
  const invalid = !Number.isInteger(ticketId) || ticketId <= 0;
  const [state, setState] = useState<{
    readonly key: number;
    readonly ticket?: ServiceDeskTicket;
    readonly denied?: boolean;
    readonly error?: string;
  }>();
  const [busy, setBusy] = useState<ServiceDeskAction>();

  useEffect(() => {
    if (invalid) return;
    const controller = new AbortController();
    api
      .request<{ data: ServiceDeskTicket }>({
        path: `service-desk/tickets/${ticketId}`,
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!controller.signal.aborted)
          setState({ key: ticketId, ticket: data });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiClientError && cause.status === 403) {
          setState({ key: ticketId, denied: true });
          return;
        }
        setState({
          key: ticketId,
          error: requestErrorMessage(cause, t),
        });
      });
    return () => controller.abort();
  }, [api, invalid, t, ticketId]);

  const current = state?.key === ticketId ? state : undefined;
  const ticket = current?.ticket;
  const loading = !invalid && !current;
  const denied = current?.denied;
  const error = invalid
    ? t('serviceDesk.errors.notFound', {
        defaultValue: 'This item no longer exists.',
      })
    : current?.error;

  const runAction = async (
    action: ServiceDeskAction,
    path: string,
    json?: Record<string, unknown>,
  ): Promise<boolean> => {
    setBusy(action);
    try {
      const { data } = await api.request<{ data: ServiceDeskTicket }>({
        path,
        method: 'POST',
        ...(json ? { json } : {}),
      });
      setState({ key: ticketId, ticket: data });
      void toaster.show({
        type: 'success',
        title: t(`serviceDesk.actionSuccess.${action}`),
      });
      return true;
    } catch (cause) {
      void toaster.show({
        type: 'error',
        title: requestErrorMessage(cause, t),
      });
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const title = ticket
    ? t('serviceDesk.ticket.drawerTitle', {
        id: ticket.id,
        title: ticket.title,
        defaultValue: '#{{id}} · {{title}}',
      })
    : t('serviceDesk.ticket.loading', { defaultValue: 'Ticket' });

  return (
    <RouteDrawer
      title={title}
      description={
        ticket
          ? t('serviceDesk.ticket.requesterDescription', {
              name:
                ticket.requesterName ??
                t('serviceDesk.ticket.unknownUser', {
                  defaultValue: 'Unknown user',
                }),
              defaultValue: 'Requested by {{name}}',
            })
          : undefined
      }
      footer={<CloseFooter />}
    >
      {loading ? (
        <Loading className='py-16' />
      ) : denied ? (
        <div className='flex flex-col items-center gap-3 py-12 text-center'>
          <ShieldAlertIcon className='size-8 text-muted-foreground' />
          <p className='font-heading text-base font-medium'>
            {t('serviceDesk.ticket.deniedTitle', {
              defaultValue: 'Ticket not available',
            })}
          </p>
          <p className='max-w-sm text-sm text-muted-foreground'>
            {t('serviceDesk.ticket.deniedDescription', {
              defaultValue: 'You do not have permission to view this ticket.',
            })}
          </p>
        </div>
      ) : error ? (
        <p
          role='alert'
          className='rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive'
        >
          {error}
        </p>
      ) : ticket ? (
        <div className='flex flex-col gap-6'>
          <div className='flex flex-wrap items-center gap-2'>
            <TicketStatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            {ticket.overdue ? <OverdueBadge /> : null}
          </div>

          <dl className='grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2'>
            <Meta
              label={t('serviceDesk.ticket.requester', {
                defaultValue: 'Requester',
              })}
            >
              {ticket.requesterName ??
                t('serviceDesk.ticket.unknownUser', {
                  defaultValue: 'Unknown user',
                })}
            </Meta>
            <Meta
              label={t('serviceDesk.ticket.assignee', {
                defaultValue: 'Assignee',
              })}
            >
              {ticket.assigneeName ??
                t('serviceDesk.ticket.unassigned', {
                  defaultValue: 'Unassigned',
                })}
            </Meta>
            <Meta
              label={t('serviceDesk.ticket.created', {
                defaultValue: 'Created',
              })}
            >
              {formatDate(ticket.createdAt)}
            </Meta>
            <Meta
              label={t('serviceDesk.ticket.dueAt', { defaultValue: 'SLA due' })}
            >
              {formatDate(ticket.slaDueAt)}
            </Meta>
            {ticket.resolvedAt ? (
              <Meta
                label={t('serviceDesk.ticket.resolved', {
                  defaultValue: 'Resolved',
                })}
              >
                {formatDate(ticket.resolvedAt)}
              </Meta>
            ) : null}
          </dl>

          <Separator />

          <section className='flex flex-col gap-2'>
            <h3 className='font-heading text-sm font-medium'>
              {t('serviceDesk.ticket.description', {
                defaultValue: 'Description',
              })}
            </h3>
            <p className='text-sm leading-6 whitespace-pre-wrap text-muted-foreground'>
              {ticket.description}
            </p>
          </section>

          {ticket.resolution ? (
            <section className='flex flex-col gap-2 rounded-lg border border-(--status-success)/20 bg-(--status-success-background) p-3'>
              <h3 className='flex items-center gap-2 font-heading text-sm font-medium text-(--status-success)'>
                <CheckCircle2Icon className='size-4' />
                {t('serviceDesk.ticket.resolution', {
                  defaultValue: 'Resolution',
                })}
              </h3>
              <p className='text-sm leading-6 whitespace-pre-wrap text-muted-foreground'>
                {ticket.resolution}
              </p>
            </section>
          ) : null}

          <section className='flex flex-col gap-3'>
            <h3 className='font-heading text-sm font-medium'>
              {t('serviceDesk.ticket.attachments', {
                defaultValue: 'Attachments',
              })}
            </h3>
            <AttachmentList
              ticketId={ticket.id}
              attachments={ticket.attachments}
            />
          </section>

          <Separator />

          <section className='flex flex-col gap-3'>
            <h3 className='flex items-center gap-2 font-heading text-sm font-medium'>
              <MessageSquareIcon className='size-4 text-muted-foreground' />
              {t('serviceDesk.ticket.activity', { defaultValue: 'Activity' })}
            </h3>
            <ActivityList activities={ticket.activities} />
          </section>

          <Separator />

          <section className='flex flex-col gap-4'>
            <h3 className='font-heading text-sm font-medium'>
              {t('serviceDesk.ticket.actions', { defaultValue: 'Actions' })}
            </h3>
            <TicketActions
              ticket={ticket}
              busy={busy}
              onAssign={(assigneeId) =>
                runAction(
                  'assign',
                  `service-desk/tickets/${ticket.id}/assign`,
                  { assigneeId },
                )
              }
              onComment={(body) =>
                runAction(
                  'comment',
                  `service-desk/tickets/${ticket.id}/comments`,
                  { body },
                )
              }
              onResolve={(resolution) =>
                runAction(
                  'resolve',
                  `service-desk/tickets/${ticket.id}/resolve`,
                  { resolution },
                )
              }
              onConfirm={() =>
                runAction(
                  'confirm',
                  `service-desk/tickets/${ticket.id}/confirm`,
                )
              }
              onReopen={(reason) =>
                runAction(
                  'reopen',
                  `service-desk/tickets/${ticket.id}/reopen`,
                  { reason },
                )
              }
            />
          </section>
        </div>
      ) : null}
    </RouteDrawer>
  );
}

function CloseFooter(): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button variant='outline' disabled={isClosing} onClick={() => void close()}>
      {t('serviceDesk.actions.close', { defaultValue: 'Close' })}
    </Button>
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
    <div className='flex flex-col gap-0.5'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ActivityList({
  activities,
}: {
  readonly activities: readonly TicketActivity[];
}): ReactElement {
  const { t } = useTranslation();
  if (activities.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('serviceDesk.ticket.noActivity', {
          defaultValue: 'No activity yet.',
        })}
      </p>
    );
  }
  return (
    <ol className='flex flex-col gap-3'>
      {activities.map((activity) => (
        <li
          key={activity.id}
          className='flex flex-col gap-1 rounded-lg border border-border bg-muted/20 p-3'
        >
          <div className='flex flex-wrap items-baseline justify-between gap-2'>
            <span className='text-sm font-medium'>
              {activity.authorName ??
                t('serviceDesk.ticket.unknownUser', {
                  defaultValue: 'Unknown user',
                })}
              <span className='ml-2 text-xs font-normal text-muted-foreground'>
                {t(`serviceDesk.activity.${activity.kind}`)}
              </span>
            </span>
            <time className='text-xs text-muted-foreground'>
              {formatDate(activity.createdAt)}
            </time>
          </div>
          {activity.body ? (
            <p className='text-sm leading-6 whitespace-pre-wrap text-muted-foreground'>
              {activity.body}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function TicketActions({
  ticket,
  busy,
  onAssign,
  onComment,
  onResolve,
  onConfirm,
  onReopen,
}: {
  readonly ticket: ServiceDeskTicket;
  readonly busy?: ServiceDeskAction;
  readonly onAssign: (assigneeId: string) => Promise<boolean>;
  readonly onComment: (body: string) => Promise<boolean>;
  readonly onResolve: (resolution: string) => Promise<boolean>;
  readonly onConfirm: () => Promise<boolean>;
  readonly onReopen: (reason: string) => Promise<boolean>;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [assignees, setAssignees] = useState<readonly Assignee[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [comment, setComment] = useState('');
  const [resolution, setResolution] = useState('');
  const [reason, setReason] = useState('');
  const [assigneeError, setAssigneeError] = useState<string>();
  const canAssign = ticket.availableActions.includes('assign');

  useEffect(() => {
    if (!canAssign) return;
    const controller = new AbortController();
    api
      .request<{ data: readonly Assignee[] }>({
        path: 'service-desk/assignees',
        signal: controller.signal,
      })
      .then(({ data }) => {
        setAssignees(data);
        setAssigneeId((current) => current || data[0]?.id || '');
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setAssigneeError(requestErrorMessage(cause, t));
      });
    return () => controller.abort();
  }, [api, canAssign, t]);

  if (ticket.availableActions.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('serviceDesk.ticket.noActions', {
          defaultValue: 'No actions are available for this ticket.',
        })}
      </p>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      {canAssign ? (
        <form
          className='flex flex-col gap-2 rounded-lg border border-border p-3'
          onSubmit={(event) => {
            event.preventDefault();
            if (!assigneeId) return;
            void onAssign(assigneeId);
          }}
        >
          <Label htmlFor='service-desk-assignee'>
            <UserCheckIcon className='size-3.5 text-muted-foreground' />
            {t('serviceDesk.ticket.assignTo', {
              defaultValue: 'Assign to an engineer',
            })}
          </Label>
          <Select
            items={assignees.map((assignee) => ({
              value: assignee.id,
              label: assignee.name,
            }))}
            value={assigneeId}
            onValueChange={(next: string | null) => {
              if (next) setAssigneeId(next);
            }}
          >
            <SelectTrigger id='service-desk-assignee' className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {assignees.map((assignee) => (
                <SelectItem key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {assigneeError ? (
            <p className='text-xs text-destructive'>{assigneeError}</p>
          ) : null}
          <Button
            type='submit'
            size='sm'
            className='w-fit'
            disabled={!assigneeId || busy !== undefined}
          >
            {busy === 'assign' ? <Spinner data-icon='inline-start' /> : null}
            {t('serviceDesk.actions.assign', { defaultValue: 'Assign' })}
          </Button>
        </form>
      ) : null}

      {ticket.availableActions.includes('resolve') ? (
        <form
          className='flex flex-col gap-2 rounded-lg border border-border p-3'
          onSubmit={(event) => {
            event.preventDefault();
            const value = resolution.trim();
            if (!value) return;
            void onResolve(value).then((ok) => {
              if (ok) setResolution('');
            });
          }}
        >
          <Label htmlFor='service-desk-resolution'>
            <CheckCircle2Icon className='size-3.5 text-muted-foreground' />
            {t('serviceDesk.ticket.resolveLabel', {
              defaultValue: 'Resolution note',
            })}
          </Label>
          <Textarea
            id='service-desk-resolution'
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
            required
            rows={3}
            placeholder={t('serviceDesk.ticket.resolvePlaceholder', {
              defaultValue: 'Explain what fixed the issue.',
            })}
          />
          <Button
            type='submit'
            size='sm'
            className='w-fit'
            disabled={!resolution.trim() || busy !== undefined}
          >
            {busy === 'resolve' ? <Spinner data-icon='inline-start' /> : null}
            {t('serviceDesk.actions.resolve', {
              defaultValue: 'Resolve ticket',
            })}
          </Button>
        </form>
      ) : null}

      {ticket.availableActions.includes('confirm') ? (
        <div className='flex flex-col gap-2 rounded-lg border border-(--status-success)/20 bg-(--status-success-background) p-3'>
          <p className='text-sm'>
            {t('serviceDesk.ticket.confirmHint', {
              defaultValue:
                'If the resolution works for you, confirm it to close the ticket.',
            })}
          </p>
          <Button
            size='sm'
            className='w-fit'
            disabled={busy !== undefined}
            onClick={() => void onConfirm()}
          >
            {busy === 'confirm' ? <Spinner data-icon='inline-start' /> : null}
            <CheckCircle2Icon data-icon='inline-start' />
            {t('serviceDesk.actions.confirm', {
              defaultValue: 'Confirm resolution',
            })}
          </Button>
        </div>
      ) : null}

      {ticket.availableActions.includes('reopen') ? (
        <form
          className='flex flex-col gap-2 rounded-lg border border-border p-3'
          onSubmit={(event) => {
            event.preventDefault();
            const value = reason.trim();
            if (!value) return;
            void onReopen(value).then((ok) => {
              if (ok) setReason('');
            });
          }}
        >
          <Label htmlFor='service-desk-reopen'>
            <RotateCcwIcon className='size-3.5 text-muted-foreground' />
            {t('serviceDesk.ticket.reopenLabel', {
              defaultValue: 'Reopen with a reason',
            })}
          </Label>
          <Textarea
            id='service-desk-reopen'
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            rows={3}
            placeholder={t('serviceDesk.ticket.reopenPlaceholder', {
              defaultValue: 'What still needs attention?',
            })}
          />
          <Button
            type='submit'
            variant='outline'
            size='sm'
            className='w-fit'
            disabled={!reason.trim() || busy !== undefined}
          >
            {busy === 'reopen' ? <Spinner data-icon='inline-start' /> : null}
            {t('serviceDesk.actions.reopen', {
              defaultValue: 'Reopen ticket',
            })}
          </Button>
        </form>
      ) : null}

      {ticket.availableActions.includes('comment') ? (
        <form
          className='flex flex-col gap-2 rounded-lg border border-border p-3'
          onSubmit={(event) => {
            event.preventDefault();
            const value = comment.trim();
            if (!value) return;
            void onComment(value).then((ok) => {
              if (ok) setComment('');
            });
          }}
        >
          <Label htmlFor='service-desk-comment'>
            <MessageSquareIcon className='size-3.5 text-muted-foreground' />
            {t('serviceDesk.ticket.addComment', {
              defaultValue: 'Add a comment or update',
            })}
          </Label>
          <Textarea
            id='service-desk-comment'
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            required
            rows={3}
            placeholder={t('serviceDesk.ticket.commentPlaceholder', {
              defaultValue: 'Share progress or ask for details.',
            })}
          />
          <Button
            type='submit'
            size='sm'
            className='w-fit'
            disabled={!comment.trim() || busy !== undefined}
          >
            {busy === 'comment' ? <Spinner data-icon='inline-start' /> : null}
            <SendIcon data-icon='inline-start' />
            {t('serviceDesk.actions.comment', {
              defaultValue: 'Post comment',
            })}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
