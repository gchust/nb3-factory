/**
 * IT tickets — submit, process, complete.
 *
 * Employees submit a ticket and then only ever see their own; handlers see the
 * whole queue and move a ticket from pending to in progress and on to
 * completed with a resolution note. The server decides which of the two the
 * signed-in user is and scopes the rows it returns, so this page renders the
 * process actions only when `canProcess` comes back true.
 *
 * Skeleton: `PageHeader` (with the new-ticket action) → status `Tabs` with
 * counts → `DataTable` → `Sheet` detail → `Dialog` for create and complete →
 * `Toaster`.
 */
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
} from 'lucide-react';
import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Toaster, toast } from '@/components/ui/toast';

import {
  completeTicket,
  createTicket,
  fetchTickets,
  startTicket,
} from './it-tickets-api.js';
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  type Ticket,
  type TicketCategory,
  type TicketStatus,
} from './types.js';

type StatusTab = 'all' | TicketStatus;

const STATUS_BADGE: Record<
  TicketStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  'in-progress': 'secondary',
  completed: 'default',
};

function StatusBadge({ status }: { status: TicketStatus }): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_BADGE[status]}>
      {t(`itTickets.status.${status}`)}
    </Badge>
  );
}

function CategoryBadge({
  category,
}: {
  category: TicketCategory;
}): ReactElement {
  const { t } = useTranslation();
  return <Badge variant='ghost'>{t(`itTickets.category.${category}`)}</Badge>;
}

const EMPTY_DRAFT = {
  title: '',
  category: 'computer' as TicketCategory,
  description: '',
};

export default function ItTicketsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const [reloadCount, setReloadCount] = useState(0);
  const [state, setState] = useState<{
    key: number;
    tickets?: Ticket[];
    canProcess?: boolean;
    error?: unknown;
  }>({ key: -1 });

  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [detailId, setDetailId] = useState<number | null>(null);

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [titleError, setTitleError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [completing, setCompleting] = useState<Ticket | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(false);

  const [busyStart, setBusyStart] = useState<number | null>(null);

  const loading = state.key !== reloadCount;
  const tickets = useMemo(() => state.tickets ?? [], [state.tickets]);
  const canProcess = state.canProcess ?? false;

  useEffect(() => {
    const controller = new AbortController();
    fetchTickets(api, { signal: controller.signal })
      .then((response) =>
        setState({
          key: reloadCount,
          tickets: response.data,
          canProcess: response.meta.canProcess,
        }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ key: reloadCount, error });
      });
    return () => controller.abort();
  }, [api, reloadCount]);

  const refresh = useCallback((): void => {
    setReloadCount((count) => count + 1);
  }, []);

  const describeError = useCallback(
    (error: unknown): string => {
      if (error instanceof ApiClientError) {
        if (error.status === 401) return t('itTickets.errors.unauthorized');
        if (error.status === 403) return t('itTickets.errors.forbidden');
        if (error.status === 404) return t('itTickets.errors.notFound');
        if (error.status === 409) return t('itTickets.errors.invalidState');
        if (error.status === 400) return t('itTickets.errors.invalidInput');
      }
      return t('itTickets.errors.generic');
    },
    [t],
  );

  const counts = useMemo(() => {
    const result: Record<StatusTab, number> = {
      all: tickets.length,
      pending: 0,
      'in-progress': 0,
      completed: 0,
    };
    for (const ticket of tickets) {
      result[ticket.status] += 1;
    }
    return result;
  }, [tickets]);

  const filtered = useMemo(
    () =>
      statusTab === 'all'
        ? tickets
        : tickets.filter((ticket) => ticket.status === statusTab),
    [statusTab, tickets],
  );

  const detail =
    detailId === null
      ? null
      : (tickets.find((ticket) => ticket.id === detailId) ?? null);

  const handleStart = useCallback(
    async (ticket: Ticket): Promise<void> => {
      setBusyStart(ticket.id);
      try {
        await startTicket(api, ticket.id);
        toast.add({
          type: 'success',
          title: t('itTickets.toasts.startedTitle'),
          description: t('itTickets.toasts.startedDescription', {
            title: ticket.title,
          }),
        });
        refresh();
      } catch (error) {
        toast.add({
          type: 'error',
          title: t('itTickets.toasts.errorTitle'),
          description: describeError(error),
        });
      } finally {
        setBusyStart(null);
      }
    },
    [api, describeError, refresh, t],
  );

  const openComplete = useCallback((ticket: Ticket): void => {
    setCompleting(ticket);
    setNote('');
    setNoteError(false);
  }, []);

  const submitComplete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (completing === null) return;
    const resolutionNote = note.trim();
    if (resolutionNote.length === 0) {
      setNoteError(true);
      return;
    }
    setSaving(true);
    try {
      await completeTicket(api, completing.id, resolutionNote);
      toast.add({
        type: 'success',
        title: t('itTickets.toasts.completedTitle'),
        description: t('itTickets.toasts.completedDescription', {
          title: completing.title,
        }),
      });
      setCompleting(null);
      refresh();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('itTickets.toasts.errorTitle'),
        description: describeError(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (title.length === 0) {
      setTitleError(true);
      return;
    }
    setSaving(true);
    try {
      await createTicket(api, {
        title,
        category: draft.category,
        description: draft.description.trim() || undefined,
      });
      toast.add({ type: 'success', title: t('itTickets.toasts.createdTitle') });
      setCreating(false);
      setDraft(EMPTY_DRAFT);
      setStatusTab('all');
      refresh();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('itTickets.toasts.errorTitle'),
        description: describeError(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<Ticket>[]>(() => {
    const canAct = (ticket: Ticket): boolean =>
      canProcess && ticket.status !== 'completed';

    return [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itTickets.columns.title')}
          />
        ),
        cell: ({ row }) => (
          <div className='max-w-md space-y-0.5'>
            <div className='font-medium'>{row.original.title}</div>
            {row.original.description ? (
              <div className='truncate text-xs text-muted-foreground'>
                {row.original.description}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'category',
        header: t('itTickets.columns.category'),
        cell: ({ row }) => <CategoryBadge category={row.original.category} />,
      },
      {
        accessorKey: 'submitterName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itTickets.columns.submitter')}
          />
        ),
        cell: ({ row }) => row.original.submitterName ?? '—',
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itTickets.columns.status')}
          />
        ),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'handlerName',
        header: t('itTickets.columns.handler'),
        cell: ({ row }) =>
          row.original.handlerName ?? (
            <span className='text-muted-foreground'>
              {t('itTickets.unassigned')}
            </span>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itTickets.columns.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap tabular-nums'>
            {format(new Date(row.original.createdAt), 'PP')}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => (
          <div className='text-right'>{t('itTickets.columns.actions')}</div>
        ),
        cell: ({ row }) => {
          const ticket = row.original;
          return (
            <div className='flex justify-end gap-2'>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => setDetailId(ticket.id)}
              >
                {t('itTickets.actions.view')}
              </Button>
              {canAct(ticket) ? (
                ticket.status === 'pending' ? (
                  <Button
                    size='sm'
                    disabled={busyStart === ticket.id}
                    onClick={() => void handleStart(ticket)}
                  >
                    {busyStart === ticket.id ? <Spinner /> : <PlayIcon />}
                    {t('itTickets.actions.start')}
                  </Button>
                ) : (
                  <Button size='sm' onClick={() => openComplete(ticket)}>
                    <CheckCircle2Icon />
                    {t('itTickets.actions.complete')}
                  </Button>
                )
              ) : null}
            </div>
          );
        },
      },
    ];
  }, [busyStart, canProcess, handleStart, openComplete, t]);

  return (
    <PageContainer>
      <PageHeader
        title={t('itTickets.title')}
        description={t('itTickets.description')}
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon />
            {t('itTickets.actions.new')}
          </Button>
        }
      />

      {state.error && !loading ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertTitle>{t('itTickets.loadError.title')}</AlertTitle>
          <AlertDescription>
            {describeError(state.error)}
            <Button
              variant='outline'
              size='sm'
              className='ml-3'
              onClick={refresh}
            >
              <RefreshCwIcon />
              {t('itTickets.actions.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        value={statusTab}
        onValueChange={(value) => setStatusTab(value as StatusTab)}
      >
        <TabsList variant='line'>
          {(['all', ...TICKET_STATUSES] as const).map((status) => (
            <TabsTrigger key={status} value={status}>
              {status === 'all'
                ? t('itTickets.tabs.all')
                : t(`itTickets.status.${status}`)}
              <Badge variant='secondary' className='tabular-nums'>
                {counts[status]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        data={filtered}
        emptyMessage={
          statusTab === 'all'
            ? t('itTickets.empty')
            : t('itTickets.emptyFiltered')
        }
        toolbar={(table) => (
          <>
            <div className='relative'>
              <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={
                  (table.getColumn('title')?.getFilterValue() as
                    string | undefined) ?? ''
                }
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  table.getColumn('title')?.setFilterValue(event.target.value)
                }
                placeholder={t('itTickets.searchPlaceholder')}
                className='max-w-xs pl-8'
                aria-label={t('itTickets.searchPlaceholder')}
              />
            </div>
            <DataTableViewOptions
              table={table}
              getColumnLabel={(column) => t(`itTickets.columns.${column.id}`)}
            />
          </>
        )}
      />

      <Sheet
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <SheetContent className='sm:max-w-lg'>
          {detail ? (
            <>
              <SheetHeader>
                <SheetTitle>{detail.title}</SheetTitle>
                <SheetDescription>
                  {t('itTickets.detail.reference', { id: detail.id })} ·{' '}
                  {format(new Date(detail.createdAt), 'PPp')}
                </SheetDescription>
              </SheetHeader>
              <div className='flex flex-1 flex-col gap-5 overflow-y-auto px-4'>
                <div className='flex items-center gap-2'>
                  <StatusBadge status={detail.status} />
                  <CategoryBadge category={detail.category} />
                </div>
                <div className='space-y-1'>
                  <div className='text-sm font-medium'>
                    {t('itTickets.detail.descriptionLabel')}
                  </div>
                  <p className='text-sm whitespace-pre-wrap text-muted-foreground'>
                    {detail.description ?? t('itTickets.detail.noDescription')}
                  </p>
                </div>
                <Separator />
                <div className='space-y-1'>
                  <div className='text-sm font-medium'>
                    {t('itTickets.detail.resolution')}
                  </div>
                  <p className='text-sm whitespace-pre-wrap text-muted-foreground'>
                    {detail.resolutionNote ??
                      t('itTickets.detail.noResolution')}
                  </p>
                </div>
                <Separator />
                <dl className='grid grid-cols-2 gap-x-4 gap-y-3 text-sm'>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('itTickets.detail.submittedBy')}
                    </dt>
                    <dd>{detail.submitterName ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('itTickets.detail.handler')}
                    </dt>
                    <dd>{detail.handlerName ?? t('itTickets.unassigned')}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('itTickets.detail.updatedAt')}
                    </dt>
                    <dd>{format(new Date(detail.updatedAt), 'PPp')}</dd>
                  </div>
                </dl>
              </div>
              {canProcess && detail.status !== 'completed' ? (
                <SheetFooter className='flex-row justify-end gap-2 border-t px-4 pt-4'>
                  {detail.status === 'pending' ? (
                    <Button
                      disabled={busyStart === detail.id}
                      onClick={() => void handleStart(detail)}
                    >
                      <PlayIcon />
                      {t('itTickets.actions.start')}
                    </Button>
                  ) : null}
                  <Button onClick={() => openComplete(detail)}>
                    <CheckCircle2Icon />
                    {t('itTickets.actions.complete')}
                  </Button>
                </SheetFooter>
              ) : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='sm:max-w-md'>
          <form
            onSubmit={(event) => {
              void submitCreate(event);
            }}
            noValidate
          >
            <DialogHeader>
              <DialogTitle>{t('itTickets.create.title')}</DialogTitle>
              <DialogDescription>
                {t('itTickets.create.description')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field data-invalid={titleError}>
                <FieldLabel htmlFor='it-ticket-title'>
                  {t('itTickets.create.titleLabel')}
                </FieldLabel>
                <Input
                  id='it-ticket-title'
                  value={draft.title}
                  aria-invalid={titleError}
                  placeholder={t('itTickets.create.titlePlaceholder')}
                  onChange={(event) => {
                    setTitleError(false);
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }));
                  }}
                />
                {titleError ? (
                  <FieldError>{t('itTickets.create.titleRequired')}</FieldError>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor='it-ticket-category'>
                  {t('itTickets.create.categoryLabel')}
                </FieldLabel>
                <Select
                  value={draft.category}
                  onValueChange={(value: unknown) => {
                    if (typeof value !== 'string') return;
                    setDraft((current) => ({
                      ...current,
                      category: value as TicketCategory,
                    }));
                  }}
                >
                  <SelectTrigger id='it-ticket-category' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {t(`itTickets.category.${category}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor='it-ticket-description'>
                  {t('itTickets.create.descriptionLabel')}
                </FieldLabel>
                <Textarea
                  id='it-ticket-description'
                  value={draft.description}
                  placeholder={t('itTickets.create.descriptionPlaceholder')}
                  rows={4}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setCreating(false)}
              >
                {t('itTickets.cancel')}
              </Button>
              <Button type='submit' disabled={saving}>
                {saving ? <Spinner /> : null}
                {t('itTickets.create.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={completing !== null}
        onOpenChange={(open) => {
          if (!open) setCompleting(null);
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <form
            onSubmit={(event) => {
              void submitComplete(event);
            }}
            noValidate
          >
            <DialogHeader>
              <DialogTitle>{t('itTickets.complete.title')}</DialogTitle>
              <DialogDescription>
                {completing
                  ? t('itTickets.complete.description', {
                      title: completing.title,
                    })
                  : ''}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field data-invalid={noteError}>
                <FieldLabel htmlFor='it-ticket-resolution'>
                  {t('itTickets.complete.noteLabel')}
                </FieldLabel>
                <Textarea
                  id='it-ticket-resolution'
                  value={note}
                  rows={4}
                  aria-invalid={noteError}
                  placeholder={t('itTickets.complete.notePlaceholder')}
                  onChange={(event) => {
                    setNoteError(false);
                    setNote(event.target.value);
                  }}
                />
                {noteError ? (
                  <FieldError>
                    {t('itTickets.complete.noteRequired')}
                  </FieldError>
                ) : null}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setCompleting(null)}
              >
                {t('itTickets.cancel')}
              </Button>
              <Button type='submit' disabled={saving}>
                {saving ? <Spinner /> : null}
                {t('itTickets.complete.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Toaster />
    </PageContainer>
  );
}
