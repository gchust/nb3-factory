import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { CheckCircle2Icon, RotateCcwIcon, UserPlusIcon } from 'lucide-react';
import { type FormEvent, type ReactElement, useState } from 'react';
import { useParams } from 'react-router';

import { RouteDrawer } from '#components/route-drawer';
import {
  TicketOverdueBadge,
  TicketStatusBadge,
  TicketUrgencyBadge,
} from '#components/itsm/status-badge';
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
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { Textarea } from '#components/ui/textarea';
import { useRouteOverlay } from '#components/use-route-overlay';
import { useToaster } from '@nocobase/app-client';
import {
  ticketScreenshotUrl,
  useEngineers,
  useItsmRole,
  useTicketActions,
  useTicketDetail,
  type Ticket,
  type TicketDetail,
  type TicketLog,
} from '#hooks/itsm';

/** One ticket, its process log, and the commands the caller may run on it. */
export default function TicketDetailRoute(): ReactElement {
  const { t } = useTranslation();
  const { ticketId = '' } = useParams();
  const detail = useTicketDetail(ticketId);
  return (
    <RouteDrawer
      title={detail.data?.title ?? t('tickets.detail.title')}
      description={t('tickets.detail.description')}
      footer={<DetailFooter />}
    >
      {detail.isError ? (
        <p className='text-sm text-destructive'>
          {t('tickets.detail.error.description')}
        </p>
      ) : detail.data ? (
        <TicketDetailBody ticket={detail.data} />
      ) : (
        <div className='space-y-3' aria-busy='true'>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-24 w-full' />
          <Skeleton className='h-24 w-full' />
        </div>
      )}
    </RouteDrawer>
  );
}

function DetailFooter(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button type='button' variant='outline' onClick={() => void close()}>
      {t('actions.close')}
    </Button>
  );
}

function TicketDetailBody({
  ticket,
}: {
  readonly ticket: TicketDetail;
}): ReactElement {
  const { t } = useTranslation();
  const role = useItsmRole();
  const { session } = useAuthentication();
  const selfId = session?.user?.id;
  const isRequester = ticket.requesterId === selfId;
  const isAssignee = ticket.assigneeId === selfId;
  const isDesk = role === 'service-desk';

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center gap-2'>
        <TicketStatusBadge status={ticket.status} />
        <TicketUrgencyBadge urgency={ticket.urgency} />
        {ticket.overdue ? <TicketOverdueBadge /> : null}
      </div>

      <TicketFacts ticket={ticket} />

      <Separator />

      <section className='space-y-2'>
        <h3 className='text-sm font-medium'>
          {t('tickets.detail.fields.description')}
        </h3>
        <p className='text-sm whitespace-pre-line text-muted-foreground'>
          {ticket.description}
        </p>
      </section>

      {ticket.resolution ? (
        <section className='space-y-2'>
          <h3 className='text-sm font-medium'>
            {t('tickets.detail.fields.resolution')}
          </h3>
          <p className='text-sm whitespace-pre-line text-muted-foreground'>
            {ticket.resolution}
          </p>
        </section>
      ) : null}

      {ticket.screenshots.length > 0 ? (
        <section className='space-y-2'>
          <h3 className='text-sm font-medium'>
            {t('tickets.detail.fields.screenshots')}
          </h3>
          <div className='flex flex-wrap gap-3'>
            {ticket.screenshots.map((screenshot) => (
              <ScreenshotThumb
                key={screenshot.id}
                url={ticketScreenshotUrl(screenshot)}
                filename={screenshot.filename}
                isImage={screenshot.mimeType.startsWith('image/')}
              />
            ))}
          </div>
        </section>
      ) : null}

      <Separator />

      <TicketActions
        ticket={ticket}
        selfId={selfId}
        isRequester={isRequester}
        isAssignee={isAssignee}
        isDesk={isDesk}
      />

      <Separator />

      <TicketLogs logs={ticket.logs} />
    </div>
  );
}

function TicketFacts({ ticket }: { readonly ticket: Ticket }): ReactElement {
  const { t } = useTranslation();
  const facts: ReadonlyArray<readonly [string, string]> = [
    [
      t('tickets.columns.requester'),
      ticket.requesterName ?? ticket.requesterId,
    ],
    [
      t('tickets.columns.assignee'),
      ticket.assigneeName ?? t('tickets.unassigned'),
    ],
    [t('tickets.detail.fields.submitted'), formatDate(ticket.submittedAt)],
    [t('tickets.detail.fields.updated'), formatDate(ticket.updatedAt)],
    ...(ticket.returnCount > 0
      ? ([
          [t('tickets.detail.fields.returnCount'), String(ticket.returnCount)],
        ] as const)
      : []),
  ];
  return (
    <dl className='grid grid-cols-2 gap-x-4 gap-y-3 text-sm'>
      {facts.map(([label, value]) => (
        <div key={label} className='space-y-0.5'>
          <dt className='text-muted-foreground'>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ScreenshotThumb({
  url,
  filename,
  isImage,
}: {
  readonly url: string;
  readonly filename: string;
  readonly isImage: boolean;
}): ReactElement {
  return (
    <a
      href={url}
      target='_blank'
      rel='noreferrer'
      className='block w-32 overflow-hidden rounded-lg border text-xs hover:ring-2 hover:ring-ring/40'
    >
      {isImage ? (
        <img src={url} alt={filename} className='h-24 w-full object-cover' />
      ) : null}
      <span className='block truncate px-2 py-1 text-muted-foreground'>
        {filename}
      </span>
    </a>
  );
}

function TicketActions({
  ticket,
  selfId,
  isRequester,
  isAssignee,
  isDesk,
}: {
  readonly ticket: TicketDetail;
  readonly selfId: string | undefined;
  readonly isRequester: boolean;
  readonly isAssignee: boolean;
  readonly isDesk: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const { run } = useTicketActions(String(ticket.id));

  const canAssign = isDesk && ticket.status !== 'closed';
  const canWork = (isDesk || isAssignee) && ticket.status === 'processing';
  const canDecide = isRequester && ticket.status === 'resolved';

  async function invoke(
    action: Parameters<typeof run>[0],
    json?: unknown,
    successKey?: string,
  ): Promise<void> {
    await run(action, json);
    if (successKey) {
      toaster.show({ type: 'success', title: t(successKey) });
    }
  }

  return (
    <div className='space-y-5'>
      {canAssign ? (
        <AssignControl
          onAssign={(assigneeId) =>
            invoke('assign', { assigneeId }, 'tickets.detail.assign.success')
          }
        />
      ) : null}

      {canWork ? (
        <>
          <Composer
            id='ticket-process'
            label={t('tickets.detail.process.label')}
            placeholder={t('tickets.detail.process.placeholder')}
            submitLabel={t('tickets.detail.process.submit')}
            onSubmit={(content) =>
              invoke('process', { content }, 'tickets.detail.process.success')
            }
          />
          <Composer
            id='ticket-resolve'
            label={t('tickets.detail.resolve.label')}
            placeholder={t('tickets.detail.resolve.placeholder')}
            submitLabel={t('tickets.detail.resolve.submit')}
            onSubmit={(resolution) =>
              invoke(
                'resolve',
                { resolution },
                'tickets.detail.resolve.success',
              )
            }
          />
        </>
      ) : null}

      {canDecide ? (
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            onClick={() =>
              void invoke(
                'confirm',
                undefined,
                'tickets.detail.confirm.success',
              )
            }
          >
            <CheckCircle2Icon data-icon='inline-start' />
            {t('tickets.detail.confirm.action')}
          </Button>
        </div>
      ) : null}

      {canDecide ? (
        <Composer
          id='ticket-return'
          label={t('tickets.detail.return.label')}
          placeholder={t('tickets.detail.return.placeholder')}
          submitLabel={t('tickets.detail.return.submit')}
          icon={<RotateCcwIcon data-icon='inline-start' />}
          onSubmit={(reason) =>
            invoke('return', { reason }, 'tickets.detail.return.success')
          }
        />
      ) : null}

      {selfId ? (
        <Composer
          id='ticket-comment'
          label={t('tickets.detail.comment.label')}
          placeholder={t('tickets.detail.comment.placeholder')}
          submitLabel={t('tickets.detail.comment.submit')}
          onSubmit={(content) =>
            invoke('comment', { content }, 'tickets.detail.comment.success')
          }
        />
      ) : null}
    </div>
  );
}

function AssignControl({
  onAssign,
}: {
  readonly onAssign: (assigneeId: string) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const engineers = useEngineers();
  const [assigneeId, setAssigneeId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function assign(): Promise<void> {
    if (!assigneeId) return;
    setBusy(true);
    setError(undefined);
    try {
      await onAssign(assigneeId);
      setAssigneeId(undefined);
    } catch {
      setError(t('tickets.detail.assign.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='space-y-2'>
      <Label htmlFor='ticket-assignee'>
        {t('tickets.detail.assign.label')}
      </Label>
      <div className='flex items-center gap-2'>
        <Select
          items={(engineers.data ?? []).map((engineer) => ({
            value: engineer.id,
            label: engineer.name,
          }))}
          value={assigneeId}
          onValueChange={(value: string | null) =>
            setAssigneeId(value ?? undefined)
          }
        >
          <SelectTrigger id='ticket-assignee' className='flex-1'>
            <SelectValue placeholder={t('tickets.detail.assign.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {(engineers.data ?? []).map((engineer) => (
              <SelectItem key={engineer.id} value={engineer.id}>
                {engineer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type='button'
          disabled={!assigneeId || busy}
          onClick={() => void assign()}
        >
          {busy ? (
            <Spinner data-icon='inline-start' />
          ) : (
            <UserPlusIcon data-icon='inline-start' />
          )}
          {t('tickets.detail.assign.submit')}
        </Button>
      </div>
      {engineers.data && engineers.data.length === 0 ? (
        <p className='text-xs text-muted-foreground'>
          {t('tickets.detail.assign.noEngineers')}
        </p>
      ) : null}
      {error ? <p className='text-sm text-destructive'>{error}</p> : null}
    </div>
  );
}

function Composer({
  id,
  label,
  placeholder,
  submitLabel,
  onSubmit,
  icon,
}: {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly submitLabel: string;
  readonly onSubmit: (value: string) => Promise<void>;
  readonly icon?: ReactElement;
}): ReactElement {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await onSubmit(value.trim());
      setValue('');
    } catch {
      setError(t('tickets.detail.errors.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        rows={3}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className='flex justify-end'>
        <Button type='submit' size='sm' disabled={busy || value.trim() === ''}>
          {busy ? <Spinner data-icon='inline-start' /> : icon}
          {submitLabel}
        </Button>
      </div>
      {error ? <p className='text-sm text-destructive'>{error}</p> : null}
    </form>
  );
}

function TicketLogs({
  logs,
}: {
  readonly logs: readonly TicketLog[];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <section className='space-y-3'>
      <h3 className='text-sm font-medium'>{t('tickets.detail.logs.title')}</h3>
      {logs.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('tickets.detail.logs.empty')}
        </p>
      ) : (
        <ol className='space-y-3'>
          {logs.map((log) => (
            <li key={log.id} className='border-l-2 border-border pl-3'>
              <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                <span className='font-medium text-foreground'>
                  {log.authorName ?? t('tickets.detail.logs.system')}
                </span>
                <span>
                  {t(`tickets.detail.logs.kinds.${log.kind}`, {
                    defaultValue: log.kind,
                  })}
                </span>
                <time dateTime={log.createdAt}>
                  {formatDate(log.createdAt)}
                </time>
              </div>
              <p className='mt-1 text-sm whitespace-pre-line'>{log.content}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** A short, locale-aware timestamp; the ticket is operational, not archival. */
function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}
