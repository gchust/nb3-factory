import {
  appApiClientToken,
  type AppClient,
  useService,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  PencilIcon,
  RotateCcwIcon,
  Undo2Icon,
  XCircleIcon,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import {
  TicketCategoryBadge,
  TicketPriorityBadge,
  TicketStatusBadge,
} from '../components/ticket-badges';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Textarea,
} from '../components/ui';
import {
  describeRequestError,
  getTicket,
  listStaff,
  STATUS_TRANSITIONS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  updateTicket,
  type AssigneeCandidate,
  type ItTicketView,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '../lib/it-service-desk-api.js';

/** Human-facing label key per status transition, mirroring the server lifecycle. */
const TRANSITION_LABEL_KEYS: Record<string, string> = {
  'pending:inProgress': 'itServiceDesk.detail.actions.start',
  'pending:closed': 'itServiceDesk.detail.actions.close',
  'inProgress:resolved': 'itServiceDesk.detail.actions.markResolved',
  'inProgress:pending': 'itServiceDesk.detail.actions.backToPending',
  'resolved:closed': 'itServiceDesk.detail.actions.close',
  'resolved:inProgress': 'itServiceDesk.detail.actions.reopen',
  'closed:pending': 'itServiceDesk.detail.actions.reopen',
};

const TRANSITION_ICONS: Record<string, ReactElement> = {
  'pending:inProgress': <PlayIcon />,
  'pending:closed': <XCircleIcon />,
  'inProgress:resolved': <CheckCircle2Icon />,
  'inProgress:pending': <Undo2Icon />,
  'resolved:closed': <XCircleIcon />,
  'resolved:inProgress': <RotateCcwIcon />,
  'closed:pending': <RotateCcwIcon />,
};

export default function ItServiceDeskDetailPage(): ReactElement {
  const { t } = useTranslation();
  const appClient = useService(appApiClientToken);
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const ticketId = Number(params.id);

  const [ticket, setTicket] = useState<ItTicketView>();
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [editOpen, setEditOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [staff, setStaff] = useState<AssigneeCandidate[]>([]);
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string>();

  // value -> label map so <SelectValue> renders the staff member's name
  // instead of the raw id (base-ui only resolves labels from this prop).
  const assigneeItems = useMemo(
    () => Object.fromEntries(staff.map((member) => [member.id, member.name])),
    [staff],
  );

  const invalidId = !Number.isSafeInteger(ticketId) || ticketId < 1;
  // Derived: the first request has neither a ticket nor an error yet, so the
  // initial render shows the spinner. Later reloads keep the current ticket
  // visible while the request is in flight. State is only ever written from
  // async callbacks, never from the effect body itself.
  const loading = ticket === undefined && error === undefined;

  useEffect(() => {
    if (invalidId) {
      return;
    }
    let active = true;
    void getTicket(appClient, ticketId)
      .then((next) => {
        if (active) {
          setTicket(next);
          setMissing(false);
          setError(undefined);
          // Keep the assign control in sync with the loaded ticket (including
          // after a reload triggered by a successful assign or status change).
          setAssigneeId(next.assigneeId ?? '');
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          if (
            requestError instanceof Error &&
            'status' in requestError &&
            (requestError as { status: number }).status === 404
          ) {
            setMissing(true);
          } else {
            setError(
              describeRequestError(requestError) ??
                t('itServiceDesk.detail.loadError', {
                  defaultValue: 'Unable to load the ticket.',
                }),
            );
          }
        }
      });
    return () => {
      active = false;
    };
  }, [appClient, ticketId, reloadToken, t, invalidId]);

  useEffect(() => {
    let active = true;
    void listStaff(appClient)
      .then((next) => {
        if (active) {
          setStaff(next);
        }
      })
      .catch(() => {
        if (active) {
          setStaff([]);
        }
      });
    return () => {
      active = false;
    };
  }, [appClient]);

  async function changeStatus(next: TicketStatus) {
    setActionError(undefined);
    try {
      await updateTicket(appClient, ticketId, { status: next });
      setReloadToken((value) => value + 1);
    } catch (requestError: unknown) {
      setActionError(
        describeRequestError(requestError) ??
          t('itServiceDesk.detail.actionFailed', {
            defaultValue: 'The update failed.',
          }),
      );
    }
  }

  async function assignTicket() {
    setAssignError(undefined);
    setAssigning(true);
    try {
      await updateTicket(appClient, ticketId, {
        assigneeId: assigneeId === '' ? null : assigneeId,
      });
      setReloadToken((value) => value + 1);
    } catch (requestError: unknown) {
      setAssignError(
        describeRequestError(requestError) ??
          t('itServiceDesk.detail.actionFailed', {
            defaultValue: 'The update failed.',
          }),
      );
    } finally {
      setAssigning(false);
    }
  }

  if (invalidId || missing) {
    return (
      <section className='mx-auto w-full max-w-5xl px-6 py-16'>
        <p className='text-sm text-muted-foreground'>
          {t('itServiceDesk.detail.notFound', {
            defaultValue: 'Ticket not found.',
          })}
        </p>
        <Button
          variant='outline'
          className='mt-4'
          onClick={() => void navigate('/it-service-desk')}
        >
          <ArrowLeftIcon />
          {t('itServiceDesk.detail.back')}
        </Button>
      </section>
    );
  }

  if (loading) {
    return (
      <section className='mx-auto flex w-full max-w-5xl justify-center px-6 py-16'>
        <Spinner className='size-6' />
      </section>
    );
  }

  if (!ticket) {
    return (
      <section className='mx-auto w-full max-w-5xl px-6 py-16'>
        <div className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>
          {error ??
            t('itServiceDesk.loadError', {
              defaultValue: 'Unable to load tickets.',
            })}
        </div>
      </section>
    );
  }

  const transitions = STATUS_TRANSITIONS[ticket.status];

  return (
    <section className='mx-auto w-full max-w-5xl px-6 py-8'>
      <Link
        to='/it-service-desk'
        className='mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground'
      >
        <ArrowLeftIcon className='size-4' />
        {t('itServiceDesk.detail.back')}
      </Link>

      <div className='grid gap-4 lg:grid-cols-[1fr_280px]'>
        <div className='space-y-4'>
          <div className='rounded-xl border border-border bg-card p-5'>
            <div className='mb-2 flex flex-wrap items-center gap-2'>
              <span className='font-mono text-xs text-muted-foreground'>
                #{ticket.id}
              </span>
              <TicketCategoryBadge category={ticket.category} />
              <TicketPriorityBadge priority={ticket.priority} />
              <TicketStatusBadge status={ticket.status} />
            </div>
            <h2 className='text-xl font-semibold tracking-tight'>
              {ticket.title}
            </h2>
            <p className='mt-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90'>
              {ticket.description}
            </p>
          </div>

          <div className='rounded-xl border border-border bg-card p-5'>
            <h3 className='mb-2 text-sm font-medium'>
              {t('itServiceDesk.detail.resolution')}
            </h3>
            {ticket.resolution ? (
              <p className='text-sm leading-relaxed whitespace-pre-wrap text-foreground/90'>
                {ticket.resolution}
              </p>
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('itServiceDesk.detail.noResolution')}
              </p>
            )}
          </div>
        </div>

        <aside className='space-y-4'>
          <div className='rounded-xl border border-border bg-card p-5'>
            <h3 className='mb-3 text-sm font-medium'>
              {t('itServiceDesk.detail.actionsTitle')}
            </h3>
            <div className='flex flex-col gap-2'>
              {transitions.map((next) => {
                const key = `${ticket.status}:${next}`;
                return (
                  <Button
                    key={key}
                    variant='outline'
                    className='justify-start'
                    onClick={() => void changeStatus(next)}
                  >
                    {TRANSITION_ICONS[key]}
                    {t(TRANSITION_LABEL_KEYS[key])}
                  </Button>
                );
              })}
            </div>
            {actionError ? (
              <p className='mt-3 text-sm text-destructive'>{actionError}</p>
            ) : null}
          </div>

          <div className='rounded-xl border border-border bg-card p-5'>
            <dl className='space-y-3 text-sm'>
              <Field
                label={t('itServiceDesk.detail.requester')}
                value={ticket.requesterName}
              />
              <Field
                label={t('itServiceDesk.detail.assignee')}
                value={
                  ticket.assigneeName ?? t('itServiceDesk.detail.unassigned')
                }
              />
              <Field
                label={t('itServiceDesk.detail.created')}
                value={formatDate(ticket.createdAt)}
              />
              <Field
                label={t('itServiceDesk.detail.updated')}
                value={formatDate(ticket.updatedAt)}
              />
            </dl>
            <div className='mt-4 border-t pt-4'>
              <Label htmlFor='it-ticket-assignee'>
                {t('itServiceDesk.detail.assignTo')}
              </Label>
              <div className='mt-1.5 flex gap-2'>
                <Select
                  value={assigneeId}
                  onValueChange={(value) => setAssigneeId(value ?? '')}
                  items={assigneeItems}
                >
                  <SelectTrigger id='it-ticket-assignee' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=''>
                      {t('itServiceDesk.form.unassignedOption')}
                    </SelectItem>
                    {staff.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => void assignTicket()}
                  disabled={assigning}
                >
                  {assigning ? <Spinner /> : null}
                  {t('itServiceDesk.detail.assign')}
                </Button>
              </div>
              {assignError ? (
                <p className='mt-2 text-sm text-destructive'>{assignError}</p>
              ) : null}
            </div>
            <Button className='mt-4 w-full' onClick={() => setEditOpen(true)}>
              <PencilIcon />
              {t('itServiceDesk.detail.edit')}
            </Button>
          </div>
        </aside>
      </div>

      <EditTicketDialog
        appClient={appClient}
        ticket={ticket}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => setReloadToken((value) => value + 1)}
      />
    </section>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className='flex items-baseline justify-between gap-3'>
      <dt className='shrink-0 text-muted-foreground'>{label}</dt>
      <dd className='text-right font-medium break-words'>{value}</dd>
    </div>
  );
}

function EditTicketDialog({
  appClient,
  ticket,
  open,
  onOpenChange,
  onSaved,
}: {
  appClient: AppClient;
  ticket: ItTicketView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): ReactElement {
  // The form is only mounted while the dialog is open, so its state is
  // initialized from the current ticket on every open. No effect is needed to
  // keep the fields in sync with a changing ticket.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <EditTicketForm
          appClient={appClient}
          ticket={ticket}
          onCancel={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

function EditTicketForm({
  appClient,
  ticket,
  onCancel,
  onSaved,
}: {
  appClient: AppClient;
  ticket: ItTicketView;
  onCancel: () => void;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description);
  const [category, setCategory] = useState<TicketCategory>(ticket.category);
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
  const [assigneeId, setAssigneeId] = useState<string>(ticket.assigneeId ?? '');
  const [resolution, setResolution] = useState(ticket.resolution ?? '');
  const [staff, setStaff] = useState<AssigneeCandidate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();

  // value -> label map so <SelectValue> renders the staff member's name
  // instead of the raw id (base-ui only resolves labels from this prop).
  const assigneeItems = useMemo(
    () => Object.fromEntries(staff.map((member) => [member.id, member.name])),
    [staff],
  );

  useEffect(() => {
    let active = true;
    void listStaff(appClient)
      .then((next) => {
        if (active) {
          setStaff(next);
        }
      })
      .catch(() => {
        if (active) {
          setStaff([]);
        }
      });
    return () => {
      active = false;
    };
  }, [appClient]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (title.trim() === '' || description.trim() === '') {
      setFormError(
        t('itServiceDesk.form.errors.required', {
          defaultValue: 'Please fill in the required fields.',
        }),
      );
      return;
    }
    setSubmitting(true);
    setFormError(undefined);
    try {
      await updateTicket(appClient, ticket.id, {
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        assigneeId: assigneeId === '' ? null : assigneeId,
        resolution: resolution.trim() === '' ? null : resolution.trim(),
      });
      onCancel();
      onSaved();
    } catch (requestError: unknown) {
      setFormError(
        describeRequestError(requestError) ??
          t('itServiceDesk.form.errors.failed', {
            defaultValue: 'The request failed.',
          }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <DialogHeader>
          <DialogTitle>
            {t('itServiceDesk.form.editTitle', { id: ticket.id })}
          </DialogTitle>
          <DialogDescription>
            {t('itServiceDesk.form.editDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 py-2'>
          <div className='grid gap-1.5'>
            <Label htmlFor='it-ticket-edit-title'>
              {t('itServiceDesk.form.titleLabel')}
            </Label>
            <Input
              id='it-ticket-edit-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='it-ticket-edit-description'>
              {t('itServiceDesk.form.descriptionLabel')}
            </Label>
            <Textarea
              id='it-ticket-edit-description'
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              required
            />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='grid gap-1.5'>
              <Label>{t('itServiceDesk.form.categoryLabel')}</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value ?? 'hardware')}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`itServiceDesk.categories.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-1.5'>
              <Label>{t('itServiceDesk.form.priorityLabel')}</Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value ?? 'normal')}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`itServiceDesk.priorities.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className='grid gap-1.5'>
            <Label>{t('itServiceDesk.form.assigneeLabel')}</Label>
            <Select
              value={assigneeId}
              onValueChange={(value) => setAssigneeId(value ?? '')}
              items={assigneeItems}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=''>
                  {t('itServiceDesk.form.unassignedOption')}
                </SelectItem>
                {(staff ?? []).map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='it-ticket-edit-resolution'>
              {t('itServiceDesk.form.resolutionLabel')}
            </Label>
            <Textarea
              id='it-ticket-edit-resolution'
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              placeholder={t('itServiceDesk.form.resolutionPlaceholder')}
              rows={3}
            />
          </div>
          {formError ? (
            <p className='text-sm text-destructive'>{formError}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={submitting}
            onClick={onCancel}
          >
            {t('actions.cancel')}
          </Button>
          <Button type='submit' disabled={submitting}>
            {submitting ? <Spinner /> : null}
            {t('itServiceDesk.form.update')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function PlayIcon(): ReactElement {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      className='size-4'
      aria-hidden='true'
    >
      <polygon points='6 3 20 12 6 21 6 3' />
    </svg>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
