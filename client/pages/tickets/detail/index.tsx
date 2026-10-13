import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { MoreHorizontalIcon, PaperclipIcon } from 'lucide-react';
import {
  useCallback,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { BackButton } from '#components/back-button';
import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RequestFailed } from '#components/request-failed';
import { RouteChildPage } from '#components/route-child-page';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Separator } from '#components/ui/separator';
import { Spinner } from '#components/ui/spinner';
import { Textarea } from '#components/ui/textarea';
import { useDateTime } from '#hooks/use-date-time';
import {
  addNote,
  useServiceDeskMe,
  useTicket,
  useTicketNotes,
  type TicketNote,
  type TicketTransition,
  type TicketView,
} from '#hooks/service-desk';
import { useTransitionText } from '#hooks/use-transition-text';

import { TicketAttachments } from '../attachments.js';
import { useApiErrorMessage } from '#hooks/api-error-message';
import { DetailField, TicketStateBadge, UrgencyBadge } from '../shared.js';
import {
  DirectTransitionButton,
  type TicketTransitionName,
} from '../transitions.js';
import {
  TRANSITION_ORDER,
  type TicketDetailOutletContext,
  type TicketReloadOutletContext,
} from '../types.js';

/** The transitions that ask for input, declared as their own child routes under the record. */
const DIALOG_TRANSITIONS = new Set<TicketTransitionName>([
  'assign',
  'reassign',
  'resolve',
  'return',
  'cancel',
]);

/**
 * One ticket, on its own page over the list.
 *
 * The server decides what the caller may see and which transitions they may fire: an invisible ticket answers `404`,
 * and the actions come from the lifecycle's own `available` list, so a role change is reflected without a change
 * here. Transitions that need input open a dialog declared under this route; the rest fire directly.
 */
export default function TicketDetailPage(): ReactElement {
  const { ticketId } = useParams();
  const id = Number(ticketId);
  if (!Number.isInteger(id) || id <= 0) {
    return <TicketMissing />;
  }
  // Keyed by id so every piece of state — the note being typed, the loaded batch — belongs to one ticket.
  return <TicketDetail key={id} ticketId={id} />;
}

function TicketMissing(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        <PageHeader title={t('serviceDesk.detail.notFound')} />
      </PageContainer>
    </RouteChildPage>
  );
}

function TicketDetail({
  ticketId,
}: {
  readonly ticketId: number;
}): ReactElement {
  const { t } = useTranslation();
  const listContext = useOutletContext<TicketReloadOutletContext>();
  const ticket = useTicket(ticketId);
  const notes = useTicketNotes(ticketId);
  const me = useServiceDeskMe();
  const ticketReload = ticket.reload;
  const notesReload = notes.reload;
  const listReload = listContext.reload;

  // A transition changes the record, its history and the list behind this page, so one reload covers all three.
  const reload = useCallback(() => {
    ticketReload();
    notesReload();
    listReload();
  }, [ticketReload, notesReload, listReload]);

  const version = ticket.data?.version ?? null;
  const outletContext: TicketDetailOutletContext = useMemo(
    () => ({ ticketId, version, reload }),
    [ticketId, version, reload],
  );

  const view = ticket.data;
  if (ticket.error && !view) {
    const notFound =
      ticket.error instanceof ApiClientError && ticket.error.status === 404;
    return (
      <RouteChildPage>
        <PageContainer>
          <BackButton />
          <RequestFailed
            error={ticket.error}
            title={t('serviceDesk.error.title')}
            description={
              notFound
                ? t('serviceDesk.detail.notFound')
                : t('serviceDesk.error.requestFailed')
            }
            onRetry={notFound ? undefined : ticket.reload}
          />
        </PageContainer>
      </RouteChildPage>
    );
  }
  if (!view) {
    return (
      <RouteChildPage>
        <PageContainer>
          <Loading />
        </PageContainer>
      </RouteChildPage>
    );
  }

  const { record } = view;
  // The service desk and the assigned engineer leave handling notes; everyone else leaves comments. The server
  // applies the same rule, so this only decides how the box is labelled.
  const isWorker =
    (me.data?.helpdesk ?? false) ||
    ((me.data?.engineer ?? false) && me.data?.userId === record.assigneeId);

  return (
    <>
      <RouteChildPage>
        <PageContainer>
          <BackButton />
          <PageHeader
            title={record.title}
            description={<TicketSubtitle view={view} />}
            actions={
              <TicketActions view={view} ticketId={ticketId} onDone={reload} />
            }
          />

          <div className='grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
            <div className='flex flex-col gap-6'>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('serviceDesk.detail.descriptionTitle')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className='text-sm leading-6 whitespace-pre-wrap'>
                    {record.description}
                  </p>
                </CardContent>
              </Card>

              {record.solution ? (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t('serviceDesk.detail.solutionTitle')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className='text-sm leading-6 whitespace-pre-wrap'>
                      {record.solution}
                    </p>
                  </CardContent>
                </Card>
              ) : null}

              {record.returnReason ? (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t('serviceDesk.detail.returnReasonTitle')}
                    </CardTitle>
                    <CardDescription>
                      {t('serviceDesk.detail.returnReasonDescription')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className='text-sm leading-6 whitespace-pre-wrap'>
                      {record.returnReason}
                    </p>
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <PaperclipIcon className='size-4 text-muted-foreground' />
                    {t('serviceDesk.detail.attachmentsTitle')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {record.attachmentIds && record.attachmentIds.length > 0 ? (
                    <TicketAttachments ids={record.attachmentIds} />
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      {t('serviceDesk.detail.noAttachments')}
                    </p>
                  )}
                </CardContent>
              </Card>

              <NotesCard
                ticketId={ticketId}
                notes={notes.data}
                loading={notes.isLoading && notes.data === undefined}
                error={notes.error}
                isWorker={isWorker}
                onRetry={notes.reload}
                onAdded={notes.reload}
              />
            </div>

            <div className='flex flex-col gap-6'>
              <Card>
                <CardHeader>
                  <CardTitle>{t('serviceDesk.detail.summaryTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className='grid gap-4'>
                    <DetailField label={t('serviceDesk.detail.state')}>
                      <span className='flex flex-wrap items-center gap-2'>
                        <TicketStateBadge state={record.status} />
                        {view.overdue ? (
                          <span className='text-xs text-muted-foreground'>
                            {t('serviceDesk.tickets.overdue')}
                          </span>
                        ) : null}
                      </span>
                    </DetailField>
                    <DetailField label={t('serviceDesk.detail.urgency')}>
                      <UrgencyBadge urgency={record.urgency} />
                    </DetailField>
                    <DetailField label={t('serviceDesk.detail.requester')}>
                      {view.requester?.name ?? record.requesterId}
                    </DetailField>
                    <DetailField label={t('serviceDesk.detail.assignee')}>
                      {view.assignee?.name ??
                        t('serviceDesk.detail.unassigned')}
                    </DetailField>
                    <DetailField label={t('serviceDesk.detail.category')}>
                      {record.category ?? t('serviceDesk.detail.notProvided')}
                    </DetailField>
                    <DetailField label={t('serviceDesk.detail.location')}>
                      {record.location ?? t('serviceDesk.detail.notProvided')}
                    </DetailField>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('serviceDesk.detail.historyTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <History transitions={view.history.transitions} />
                </CardContent>
              </Card>
            </div>
          </div>
        </PageContainer>
      </RouteChildPage>
      {/* Beside the layer, not inside it: the dialogs this page opens cover the content area as it does. */}
      <Outlet context={outletContext} />
    </>
  );
}

function TicketSubtitle({ view }: { readonly view: TicketView }): ReactElement {
  const { t } = useTranslation();
  const format = useDateTime();
  const { record } = view;
  return (
    <>
      {t('serviceDesk.detail.number', { id: record.id })}
      {' · '}
      {t('serviceDesk.detail.raisedBy', {
        name: view.requester?.name ?? record.requesterId,
      })}
      {' · '}
      {format(record.createdAt)}
    </>
  );
}

/** The page's actions, driven by what the lifecycle says this caller may fire now. */
function TicketActions({
  view,
  ticketId,
  onDone,
}: {
  readonly view: TicketView;
  readonly ticketId: number;
  readonly onDone: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const text = useTransitionText();
  const location = useLocation();

  const allowed = new Set(
    view.available.filter((item) => item.allowed).map((item) => item.name),
  );
  const ordered = TRANSITION_ORDER.filter((name) => allowed.has(name));
  const mayCancel = allowed.has('cancel');
  const [primary, ...secondary] = ordered;
  // Nothing left to do from this state; the page says so rather than showing an empty action area.
  if (!primary && !mayCancel) return null;

  const action = (
    name: string,
    variant: 'default' | 'outline',
  ): ReactElement => {
    if (DIALOG_TRANSITIONS.has(name as TicketTransitionName)) {
      return (
        <Button
          key={name}
          variant={variant}
          nativeButton={false}
          render={<Link to={{ pathname: name, search: location.search }} />}
        >
          {text(name).label}
        </Button>
      );
    }
    return (
      <DirectTransitionButton
        key={name}
        transition={name}
        variant={variant}
        ticketId={ticketId}
        version={view.version}
        onDone={onDone}
      />
    );
  };

  return (
    <>
      {secondary.map((name) => action(name, 'outline'))}
      {/* One primary action only (guideline L2). */}
      {primary ? action(primary, 'default') : null}
      {/* The exit that abandons the ticket sits behind the overflow menu rather than beside the work. */}
      {mayCancel ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label={t('serviceDesk.detail.moreActions')}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem
              variant='destructive'
              render={
                <Link to={{ pathname: 'cancel', search: location.search }} />
              }
            >
              {text('cancel').label}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}

/** The ticket's handling notes and comments, with a box to add one. */
function NotesCard({
  ticketId,
  notes,
  loading,
  error,
  isWorker,
  onRetry,
  onAdded,
}: {
  readonly ticketId: number;
  readonly notes: readonly TicketNote[] | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly isWorker: boolean;
  readonly onRetry: () => void;
  readonly onAdded: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const format = useDateTime();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('serviceDesk.detail.notesTitle')}</CardTitle>
        <CardDescription>
          {t('serviceDesk.detail.notesDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <NoteComposer
          ticketId={ticketId}
          isWorker={isWorker}
          onAdded={onAdded}
        />
        {error && !notes ? (
          <RequestFailed
            error={error}
            title={t('serviceDesk.detail.notesFailed')}
            description={t('serviceDesk.error.requestFailed')}
            onRetry={onRetry}
          />
        ) : loading ? (
          <Spinner className='text-muted-foreground' />
        ) : notes && notes.length > 0 ? (
          <ul className='flex flex-col gap-4'>
            {notes.map((note) => (
              <li key={note.id} className='flex flex-col gap-1'>
                <span className='flex flex-wrap items-baseline gap-2 text-sm'>
                  <span className='font-medium'>{note.authorName}</span>
                  <span className='text-xs text-muted-foreground'>
                    {format(note.createdAt)}
                  </span>
                  {note.kind === 'handling' ? (
                    <span className='text-xs text-muted-foreground'>
                      {t('serviceDesk.detail.handlingNote')}
                    </span>
                  ) : null}
                </span>
                <p className='text-sm leading-6 whitespace-pre-wrap'>
                  {note.content}
                </p>
                <Separator className='mt-2' />
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('serviceDesk.detail.noNotes')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The box a note is typed into. A note is a separate write from a transition, so it is submitted on its own and the
 * list below it reloads; the text is cleared only once the server has it.
 */
function NoteComposer({
  ticketId,
  isWorker,
  onAdded,
}: {
  readonly ticketId: number;
  readonly isWorker: boolean;
  readonly onAdded: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const describeError = useApiErrorMessage();
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = content.trim() !== '' && !submitting;

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await addNote(api, ticketId, {
        content: content.trim(),
        kind: isWorker ? 'handling' : 'comment',
      });
    } catch (error) {
      toaster.show({ type: 'error', title: describeError(error) });
      return;
    } finally {
      setSubmitting(false);
    }
    setContent('');
    onAdded();
  }

  return (
    <form
      className='flex flex-col gap-2'
      onSubmit={(event) => void submit(event)}
    >
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={3}
        aria-label={t('serviceDesk.detail.notePlaceholder')}
        placeholder={t('serviceDesk.detail.notePlaceholder')}
      />
      <div className='flex justify-end'>
        <Button type='submit' variant='outline' disabled={!canSubmit}>
          {submitting ? <Spinner data-icon='inline-start' /> : null}
          {t('serviceDesk.detail.addNote')}
        </Button>
      </div>
    </form>
  );
}

/** The lifecycle's transition log, newest first. */
function History({
  transitions,
}: {
  readonly transitions: readonly TicketTransition[];
}): ReactElement {
  const { t } = useTranslation();
  const text = useTransitionText();
  const format = useDateTime();
  if (transitions.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('serviceDesk.detail.noHistory')}
      </p>
    );
  }
  const ordered = [...transitions].sort(
    (left, right) => right.version - left.version,
  );
  return (
    <ol className='flex flex-col gap-3'>
      {ordered.map((entry) => (
        <li
          key={`${entry.version}-${entry.transition}`}
          className='flex flex-col gap-0.5'
        >
          <span className='text-sm font-medium'>
            {entry.from
              ? text(entry.transition).label
              : t('serviceDesk.detail.created')}
          </span>
          <span className='text-xs text-muted-foreground'>
            {entry.from
              ? `${t(`serviceDesk.state.${entry.from}`)} → ${t(`serviceDesk.state.${entry.to}`)} · `
              : `${t(`serviceDesk.state.${entry.to}`)} · `}
            {format(entry.at)}
          </span>
        </li>
      ))}
    </ol>
  );
}
