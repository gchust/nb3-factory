import { useToaster } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CircleCheckIcon,
  CircleDotIcon,
  FileTextIcon,
  PlayIcon,
  SendIcon,
  Share2Icon,
  Undo2Icon,
  UserCheckIcon,
  XCircleIcon,
} from 'lucide-react';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

import {
  AcceptanceBadge,
  ConfidentialBadge,
  TicketPriorityBadge,
  TicketStatusBadge,
} from '../components/service-badges.js';
import { AttachmentPanel } from '../components/attachment-panel.js';
import { loadAssistantDraft } from '../assistant-storage.js';
import {
  DateTimeText,
  LoadError,
  SectionTitle,
  TableSkeleton,
} from '../components/service-states.js';
import { errorMessage, isConflict } from '../service-api.js';
import {
  useAsync,
  useServiceApi,
  useServicePermission,
} from '../service-hooks.js';
import {
  ACTION_FROM_STATUS,
  type ServiceTicket,
  type ServiceTicketEvent,
  type TicketAction,
} from '../types.js';
import type { TicketsOutletContext } from './context.js';

const TRANSITION_LABEL_KEY: Record<TicketAction, string> = {
  accept: 'service.ticketAction.accept',
  process: 'service.ticketAction.process',
  submit: 'service.ticketAction.submit',
  return: 'service.ticketAction.return',
  close: 'service.ticketAction.close',
};

const TRANSITION_ICON: Record<TicketAction, ReactElement> = {
  accept: <UserCheckIcon />,
  process: <PlayIcon />,
  submit: <SendIcon />,
  return: <Undo2Icon />,
  close: <CircleCheckIcon />,
};

/** The ticket drawer: facts, attachments, transitions, sharing and the ledger. */
export default function TicketDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { ticketId } = useParams<{ ticketId: string }>();
  return (
    <RouteDrawer
      title={t('service.ticketDetail.title')}
      description={t('service.ticketDetail.description')}
      className='sm:max-w-3xl'
    >
      <TicketDetailBody ticketId={Number(ticketId)} />
    </RouteDrawer>
  );
}

function TicketDetailBody({
  ticketId,
}: {
  readonly ticketId: number;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const { reload } = useOutletContext<TicketsOutletContext>();

  const ticket = useAsync(() => api.getTicket(ticketId), `ticket:${ticketId}`);

  const refresh = useCallback(() => {
    ticket.reload();
    reload();
  }, [reload, ticket]);

  if (ticket.error) {
    return <LoadError error={ticket.error} onRetry={ticket.reload} />;
  }
  if (ticket.loading || !ticket.data) {
    return <TableSkeleton rows={6} columns={2} />;
  }

  const detail = ticket.data;

  return (
    <div className='flex flex-col gap-6'>
      <header className='flex flex-col gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='font-mono text-sm text-muted-foreground'>
            {detail.code}
          </span>
          <TicketStatusBadge value={detail.status} />
          <TicketPriorityBadge value={detail.priority} />
          {detail.confidential ? <ConfidentialBadge /> : null}
          <AcceptanceBadge
            status={detail.acceptanceStatus ?? null}
            error={detail.acceptanceError ?? null}
          />
        </div>
        <h2 className='font-heading text-lg font-medium'>{detail.title}</h2>
        {detail.description ? (
          <p className='text-sm whitespace-pre-wrap text-muted-foreground'>
            {detail.description}
          </p>
        ) : null}
      </header>

      <dl className='grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2'>
        <Field
          label={t('service.ticket.customer')}
          value={detail.customerName}
        />
        <Field label={t('service.ticket.device')} value={detail.deviceName} />
        <Field
          label={t('service.ticket.assignee')}
          value={detail.assigneeName ?? t('service.ticket.unassigned')}
        />
        <Field
          label={t('service.ticket.reporter')}
          value={detail.reporterName ?? '—'}
        />
        <Field
          label={t('service.ticket.dueAt')}
          value={<DateTimeText value={detail.dueAt} />}
        />
        <Field
          label={t('service.ticket.createdAt')}
          value={<DateTimeText value={detail.createdAt} />}
        />
        <Field
          label={t('service.ticket.acceptedAt')}
          value={<DateTimeText value={detail.acceptedAt} />}
        />
        <Field
          label={t('service.ticket.closedAt')}
          value={<DateTimeText value={detail.closedAt} />}
        />
        {detail.externalEventId ? (
          <Field
            label={t('service.ticket.externalEvent')}
            value={
              <span className='font-mono text-xs'>
                {detail.externalPlatform ?? 'external'} /{' '}
                {detail.externalEventId}
              </span>
            }
          />
        ) : null}
      </dl>

      {detail.resolution ? (
        <section className='flex flex-col gap-2'>
          <SectionTitle>{t('service.ticket.resolution')}</SectionTitle>
          <p className='rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap'>
            {detail.resolution}
          </p>
        </section>
      ) : null}

      <TransitionBar ticket={detail} onDone={refresh} />

      <Separator />

      <AttachmentPanel
        owner={{ kind: 'ticket', id: ticketId }}
        resourceId='service.tickets'
        action='process'
        title={t('service.ticketDetail.attachments')}
        emptyText={t('service.ticketDetail.noAttachments')}
        attachments={detail.attachments ?? []}
        onChanged={refresh}
      />

      <Separator />

      <SharePanel ticket={detail} />

      <Separator />

      <section className='flex flex-col gap-3'>
        <SectionTitle>{t('service.ticketDetail.timeline')}</SectionTitle>
        <EventTimeline events={detail.events ?? []} />
      </section>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col gap-0.5'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='text-sm'>
        {value ?? <span className='text-muted-foreground'>—</span>}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------- transitions */

function TransitionBar({
  ticket,
  onDone,
}: {
  readonly ticket: ServiceTicket;
  readonly onDone: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const { session } = useAuthentication();
  const toaster = useToaster();
  const [pending, setPending] = useState<TicketAction | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const assistantDraft = loadAssistantDraft(session?.user?.id);

  const capabilities = ticket.capabilities;
  const canAccept = useServicePermission('service.tickets', 'accept');
  const canProcess = useServicePermission('service.tickets', 'process');
  const canSubmit = useServicePermission('service.tickets', 'submit');
  const canReturn = useServicePermission('service.tickets', 'return');
  const canClose = useServicePermission('service.tickets', 'close');

  const allowed = useMemo(() => {
    const granted: Record<TicketAction, boolean> = capabilities ?? {
      accept: canAccept,
      process: canProcess,
      submit: canSubmit,
      return: canReturn,
      close: canClose,
    };
    return (
      ['accept', 'process', 'submit', 'return', 'close'] as TicketAction[]
    ).filter(
      (action) =>
        granted[action] && ACTION_FROM_STATUS[action] === ticket.status,
    );
  }, [
    canAccept,
    canClose,
    canProcess,
    canReturn,
    canSubmit,
    capabilities,
    ticket.status,
  ]);

  const needsNote = pending === 'submit' || pending === 'return';
  const noteMissing = needsNote && note.trim().length === 0;

  const run = useCallback(async () => {
    if (!pending) return;
    if ((pending === 'submit' || pending === 'return') && !note.trim()) {
      toaster.show({
        type: 'error',
        title:
          pending === 'submit'
            ? t('service.ticketDetail.noteRequiredSubmit')
            : t('service.ticketDetail.noteRequiredReturn'),
      });
      return;
    }
    setBusy(true);
    try {
      await api.transitionTicket(ticket.id, pending, {
        ...(note.trim()
          ? { resolution: note.trim(), message: note.trim() }
          : {}),
      });
      toaster.show({
        type: 'success',
        title: t('service.ticketDetail.transitionDone'),
      });
      setPending(null);
      setNote('');
      onDone();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: isConflict(error)
          ? t('service.ticketDetail.transitionConflict')
          : t('service.ticketDetail.transitionFailed'),
        description: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }, [api, note, onDone, pending, t, ticket.id, toaster]);

  if (allowed.length === 0) return <></>;

  return (
    <section className='flex flex-col gap-3'>
      <SectionTitle>{t('service.ticketDetail.transitions')}</SectionTitle>
      <div className='flex flex-wrap gap-2'>
        {allowed.map((action) => (
          <Button
            key={action}
            variant={action === 'close' ? 'default' : 'outline'}
            disabled={busy}
            onClick={() => {
              setPending(action);
              setNote('');
            }}
          >
            {TRANSITION_ICON[action]}
            {t(TRANSITION_LABEL_KEY[action])}
          </Button>
        ))}
      </div>

      {pending ? (
        <div className='flex flex-col gap-2 rounded-lg border p-3'>
          <p className='text-sm'>
            {t('service.ticketDetail.confirmAction', {
              action: t(TRANSITION_LABEL_KEY[pending]),
            })}
          </p>
          {needsNote ? (
            <div className='flex flex-col gap-1'>
              <label className='text-xs text-muted-foreground'>
                {pending === 'submit'
                  ? t('service.ticketDetail.noteRequiredSubmit')
                  : t('service.ticketDetail.noteRequiredReturn')}
              </label>
              {needsNote && assistantDraft?.text.trim() ? (
                <Button
                  variant='link'
                  size='sm'
                  type='button'
                  className='h-auto self-start px-0 text-xs'
                  onClick={() => setNote(assistantDraft.text)}
                >
                  <FileTextIcon />
                  {t('service.ticketDetail.insertAssistantDraft')}
                </Button>
              ) : null}
              <Textarea
                rows={3}
                value={note}
                aria-invalid={noteMissing}
                placeholder={t('service.ticketDetail.notePlaceholder')}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          ) : null}
          <div className='flex flex-wrap justify-end gap-2'>
            <Button
              variant='ghost'
              disabled={busy}
              onClick={() => setPending(null)}
            >
              {t('service.action.cancel')}
            </Button>
            <Button disabled={busy || noteMissing} onClick={() => void run()}>
              {t('service.action.confirm')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------- attachments */

/* ------------------------------------------------------------------ sharing */

function SharePanel({
  ticket,
}: {
  readonly ticket: ServiceTicket;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const canShare = useServicePermission('service.tickets', 'share');

  const directory = useAsync(async () => {
    const [users, teams] = await Promise.all([
      api.listUsers(),
      api.listTeams(),
    ]);
    return { users, teams };
  }, `share-directory:${ticket.id}`);

  const [subjectType, setSubjectType] = useState('user');
  const [subjectId, setSubjectId] = useState('');
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => {
    if (!directory.data) return [];
    return subjectType === 'service.team'
      ? directory.data.teams.map((team) => ({
          id: String(team.id),
          label: team.name,
        }))
      : directory.data.users.map((user) => ({ id: user.id, label: user.name }));
  }, [directory.data, subjectType]);

  const share = useCallback(
    async (remove: boolean) => {
      if (!subjectId) return;
      setBusy(true);
      try {
        if (remove) {
          await api.unshareTicket(ticket.id, subjectType, subjectId);
        } else {
          await api.shareTicket(ticket.id, subjectType, subjectId);
        }
        toaster.show({
          type: 'success',
          title: remove
            ? t('service.share.removed')
            : t('service.share.created'),
        });
        setSubjectId('');
      } catch (error) {
        toaster.show({
          type: 'error',
          title: t('service.share.failed'),
          description: errorMessage(error),
        });
      } finally {
        setBusy(false);
      }
    },
    [api, subjectId, subjectType, t, ticket.id, toaster],
  );

  if (!canShare) return <></>;

  return (
    <section className='flex flex-col gap-3'>
      <SectionTitle>{t('service.share.title')}</SectionTitle>
      {ticket.confidential ? (
        <p className='text-sm text-destructive'>
          {t('service.share.confidential')}
        </p>
      ) : (
        <>
          <p className='text-sm text-muted-foreground'>
            {t('service.share.description')}
          </p>
          <div className='flex flex-wrap items-center gap-2'>
            <NativeSelect
              value={subjectType}
              className='w-40'
              onChange={(event) => {
                setSubjectType(event.target.value);
                setSubjectId('');
              }}
            >
              <option value='user'>{t('service.share.user')}</option>
              <option value='service.team'>{t('service.share.team')}</option>
            </NativeSelect>
            <NativeSelect
              value={subjectId}
              className='w-56'
              disabled={directory.loading}
              onChange={(event) => setSubjectId(event.target.value)}
            >
              <option value=''>{t('service.share.choose')}</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <Button
              disabled={busy || !subjectId}
              onClick={() => void share(false)}
            >
              <Share2Icon />
              {t('service.share.grant')}
            </Button>
            <Button
              variant='outline'
              disabled={busy || !subjectId}
              onClick={() => void share(true)}
            >
              <XCircleIcon />
              {t('service.share.revoke')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ ledger */

function EventTimeline({
  events,
}: {
  readonly events: readonly ServiceTicketEvent[];
}): ReactElement {
  const { t } = useTranslation();
  if (events.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('service.ticketDetail.noEvents')}
      </p>
    );
  }
  return (
    <ol className='flex flex-col gap-3'>
      {events.map((event) => (
        <li key={event.id} className='flex gap-3'>
          <span className='mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'>
            <CircleDotIcon className='size-3' />
          </span>
          <div className='flex min-w-0 flex-col'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline'>
                {t(`service.eventType.${event.type}`, {
                  defaultValue: event.type,
                })}
              </Badge>
              {event.fromStatus && event.toStatus ? (
                <span className='text-xs text-muted-foreground'>
                  {t(`service.ticketStatus.${event.fromStatus}`, {
                    defaultValue: event.fromStatus,
                  })}
                  {' → '}
                  {t(`service.ticketStatus.${event.toStatus}`, {
                    defaultValue: event.toStatus,
                  })}
                </span>
              ) : null}
              <span className='text-xs text-muted-foreground'>
                <DateTimeText value={event.createdAt} />
              </span>
            </div>
            {event.message ? (
              <p className='text-sm whitespace-pre-wrap'>{event.message}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
