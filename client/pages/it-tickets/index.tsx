/**
 * IT repair requests — the employee's queue and the handler's worklist in one
 * screen.
 *
 * Everyone who may open the page sees the requests their permission reaches:
 * an employee sees only the ones they filed, an IT handler sees the whole
 * queue. The two are the same list filtered by the server, so the page never
 * decides who may see what — it shows what the server returned and offers the
 * actions the server marked as available on each row.
 *
 * Skeleton: `PageHeader` with a refresh and, for someone who may file,
 * `PageContainer` → status `Tabs` with counts → `DataTable` → `Sheet` detail →
 * `Dialog` create → `Dialog` complete.
 */
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  CheckCircle2Icon,
  EyeIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

import {
  IT_TICKET_CATEGORIES,
  IT_TICKET_STATUSES,
  ItTicketsClient,
  type ItTicket,
  type ItTicketCategory,
  type ItTicketStatus,
  type ItTicketsListResult,
} from './api.js';

type StatusTab = 'all' | ItTicketStatus;

const STATUS_BADGE: Record<
  ItTicketStatus,
  'default' | 'secondary' | 'outline'
> = {
  pending: 'outline',
  processing: 'secondary',
  completed: 'default',
};

const EMPTY_COUNTS: Record<ItTicketStatus, number> = {
  pending: 0,
  processing: 0,
  completed: 0,
};

/**
 * The wording for each error the endpoints return. A code the client does not
 * know is reported with the generic message rather than a raw code.
 */
const ERROR_KEYS: Readonly<Record<string, string>> = {
  FORBIDDEN: 'itTickets.errors.forbidden',
  TICKET_NOT_FOUND: 'itTickets.errors.notFound',
  INVALID_INPUT: 'itTickets.errors.invalidInput',
  INVALID_STATE: 'itTickets.errors.invalidState',
};

function errorKey(reason: unknown): string {
  const code = reason instanceof ApiClientError ? reason.code : undefined;
  return (code && ERROR_KEYS[code]) || 'itTickets.errors.generic';
}

function formValue(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function asCategory(value: string): ItTicketCategory {
  return (IT_TICKET_CATEGORIES as readonly string[]).includes(value)
    ? (value as ItTicketCategory)
    : 'other';
}

function formatMoment(value: string | null): string {
  return value ? format(new Date(value), 'PPp') : '—';
}

export default function ItTicketsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const client = useMemo(() => new ItTicketsClient(api), [api]);

  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [result, setResult] = useState<ItTicketsListResult | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState<ItTicket | null>(null);
  const [detail, setDetail] = useState<ItTicket | null>(null);

  // Only the newest request may write state: a slow earlier load must not
  // overwrite a newer one.
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (status: StatusTab) => {
      const current = ++requestIdRef.current;
      setLoading(true);
      setFailed(undefined);
      try {
        const next = await client.list(status === 'all' ? undefined : status);
        if (current !== requestIdRef.current) return;
        setResult(next);
      } catch (reason) {
        if (current !== requestIdRef.current) return;
        setFailed(errorKey(reason));
      } finally {
        if (current === requestIdRef.current) setLoading(false);
      }
    },
    [client],
  );

  // Deferred out of the commit so a fast tab switch cancels the request it
  // replaces rather than racing it.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(statusTab), 0);
    return () => window.clearTimeout(timer);
  }, [load, statusTab]);

  const report = useCallback(
    (reason: unknown) => {
      toaster.show({ type: 'error', title: t(errorKey(reason)) });
    },
    [toaster, t],
  );

  /** Runs a mutation, refreshes the visible list, and reports the outcome. */
  const perform = useCallback(
    async (
      work: () => Promise<ItTicket>,
      successKey: string,
    ): Promise<ItTicket | undefined> => {
      setBusy(true);
      try {
        const ticket = await work();
        setDetail((current) =>
          current && current.id === ticket.id ? ticket : current,
        );
        toaster.show({ type: 'success', title: t(successKey) });
        await load(statusTab);
        return ticket;
      } catch (reason) {
        report(reason);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [load, report, statusTab, t, toaster],
  );

  const counts = result?.counts ?? EMPTY_COUNTS;

  const columns = useMemo<ColumnDef<ItTicket, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itTickets.columns.title')}
          />
        ),
        cell: ({ row }) => (
          <div className='min-w-0'>
            <div className='truncate font-medium'>{row.original.title}</div>
            <div className='font-mono text-xs text-muted-foreground'>
              {t('itTickets.reference', { id: row.original.id })}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'category',
        header: t('itTickets.columns.category'),
        cell: ({ row }) => t(`itTickets.category.${row.original.category}`),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itTickets.columns.status')}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={STATUS_BADGE[row.original.status]}>
            {t(`itTickets.status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        accessorKey: 'requesterName',
        header: t('itTickets.columns.submitter'),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {row.original.requesterName ?? row.original.requesterId}
          </span>
        ),
      },
      {
        id: 'handler',
        accessorFn: (ticket) => ticket.handlerName ?? '',
        header: t('itTickets.columns.assignee'),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {row.original.handlerName ?? t('itTickets.unassigned')}
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
          <span className='text-muted-foreground'>
            {formatMoment(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('itTickets.columns.actions')}</span>
        ),
        cell: ({ row }) => {
          const ticket = row.original;
          return (
            <div
              className='flex justify-end gap-1'
              // Row-level actions also open the detail sheet via the row's
              // onClick. Stop the bubble so an action button opens only its own
              // dialog/sheet and the two overlays never stack.
              onClick={(event) => event.stopPropagation()}
            >
              {ticket.canStart ? (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      () => client.start(ticket.id).then((r) => r.data),
                      t('itTickets.messages.started'),
                    )
                  }
                >
                  <PlayIcon data-icon='inline-start' />
                  {t('itTickets.actions.start')}
                </Button>
              ) : null}
              {ticket.canComplete ? (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={busy}
                  onClick={() => setCompleting(ticket)}
                >
                  <CheckCircle2Icon data-icon='inline-start' />
                  {t('itTickets.actions.complete')}
                </Button>
              ) : null}
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t('itTickets.actions.view')}
                onClick={() => setDetail(ticket)}
              >
                <EyeIcon />
              </Button>
            </div>
          );
        },
      },
    ],
    [busy, client, perform, t],
  );

  const submitNewRequest = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = formValue(data, 'title');
    if (!title) return;
    void perform(
      () =>
        client
          .create({
            title,
            category: asCategory(formValue(data, 'category')),
            description: formValue(data, 'description'),
          })
          .then((r) => r.data),
      t('itTickets.messages.created'),
    ).then((ticket) => {
      if (ticket) {
        setCreating(false);
        form.reset();
        // A new request is always pending, so make sure it is on screen.
        setStatusTab('pending');
      }
    });
  };

  const submitResolution = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!completing) return;
    const form = event.currentTarget;
    const resolution = formValue(new FormData(form), 'resolution');
    if (!resolution) return;
    const ticket = completing;
    void perform(
      () => client.complete(ticket.id, resolution).then((r) => r.data),
      t('itTickets.messages.completed'),
    ).then((updated) => {
      if (updated) {
        setCompleting(null);
        form.reset();
      }
    });
  };

  const startVisible = (ticket: ItTicket): void => {
    void perform(
      () => client.start(ticket.id).then((r) => r.data),
      t('itTickets.messages.started'),
    );
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('itTickets.title')}
        description={t('itTickets.description')}
        actions={
          <>
            <Button
              variant='outline'
              disabled={loading}
              onClick={() => void load(statusTab)}
            >
              <RefreshCwIcon data-icon='inline-start' />
              {t('itTickets.actions.refresh')}
            </Button>
            {result?.canCreate ? (
              <Button onClick={() => setCreating(true)}>
                <PlusIcon data-icon='inline-start' />
                {t('itTickets.actions.create')}
              </Button>
            ) : null}
          </>
        }
      />

      {failed ? (
        <Alert variant='destructive'>
          <TriangleAlertIcon />
          <AlertTitle>{t('itTickets.errors.title')}</AlertTitle>
          <AlertDescription className='flex items-center gap-3'>
            {t(failed)}
            <Button
              variant='outline'
              size='sm'
              onClick={() => void load(statusTab)}
            >
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
          {(['all', ...IT_TICKET_STATUSES] as const).map((status) => (
            <TabsTrigger key={status} value={status}>
              {status === 'all'
                ? t('itTickets.status.all')
                : t(`itTickets.status.${status}`)}
              <Badge variant='secondary' className='tabular-nums'>
                {status === 'all'
                  ? counts.pending + counts.processing + counts.completed
                  : counts[status]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading && !result ? (
        <div className='flex h-40 items-center justify-center text-muted-foreground'>
          <Spinner />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={result?.data ?? []}
          pageSize={10}
          getRowId={(ticket) => String(ticket.id)}
          emptyMessage={t('itTickets.empty')}
          onRowClick={(row) => setDetail(row.original)}
          toolbar={() => (
            <p className='text-sm text-muted-foreground'>
              {t('itTickets.total', {
                count:
                  statusTab === 'all'
                    ? counts.pending + counts.processing + counts.completed
                    : counts[statusTab],
              })}
            </p>
          )}
        />
      )}

      <Sheet
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <SheetContent className='sm:max-w-lg'>
          {detail ? (
            <>
              <SheetHeader>
                <SheetTitle>{detail.title}</SheetTitle>
                <SheetDescription>
                  {t('itTickets.reference', { id: detail.id })} ·{' '}
                  {t(`itTickets.category.${detail.category}`)}
                </SheetDescription>
              </SheetHeader>
              <div className='flex flex-1 flex-col gap-6 overflow-y-auto px-4'>
                <div className='flex items-center gap-3'>
                  <Badge variant={STATUS_BADGE[detail.status]}>
                    {t(`itTickets.status.${detail.status}`)}
                  </Badge>
                  <span className='text-sm text-muted-foreground'>
                    {formatMoment(detail.createdAt)}
                  </span>
                </div>

                <dl className='grid gap-3 text-sm sm:grid-cols-2'>
                  <MetaItem
                    label={t('itTickets.fields.submitter')}
                    value={detail.requesterName ?? detail.requesterId}
                  />
                  <MetaItem
                    label={t('itTickets.fields.assignee')}
                    value={detail.handlerName ?? t('itTickets.unassigned')}
                  />
                  <MetaItem
                    label={t('itTickets.fields.startedAt')}
                    value={formatMoment(detail.startedAt)}
                  />
                  <MetaItem
                    label={t('itTickets.fields.completedAt')}
                    value={formatMoment(detail.completedAt)}
                  />
                </dl>

                <section className='space-y-2'>
                  <h3 className='text-sm font-medium'>
                    {t('itTickets.fields.description')}
                  </h3>
                  <p className='text-sm whitespace-pre-wrap text-muted-foreground'>
                    {detail.description || t('itTickets.noDescription')}
                  </p>
                </section>

                {detail.status === 'completed' ? (
                  <section className='space-y-2'>
                    <h3 className='text-sm font-medium'>
                      {t('itTickets.fields.resolution')}
                    </h3>
                    <p className='text-sm whitespace-pre-wrap text-muted-foreground'>
                      {detail.resolution ?? '—'}
                    </p>
                  </section>
                ) : null}
              </div>
              {detail.canStart || detail.canComplete ? (
                <SheetFooter>
                  {detail.canStart ? (
                    <Button
                      variant='outline'
                      disabled={busy}
                      onClick={() => startVisible(detail)}
                    >
                      <PlayIcon data-icon='inline-start' />
                      {t('itTickets.actions.start')}
                    </Button>
                  ) : null}
                  {detail.canComplete ? (
                    <Button
                      disabled={busy}
                      onClick={() => setCompleting(detail)}
                    >
                      <CheckCircle2Icon data-icon='inline-start' />
                      {t('itTickets.actions.complete')}
                    </Button>
                  ) : null}
                </SheetFooter>
              ) : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='sm:max-w-md'>
          <form onSubmit={submitNewRequest}>
            <DialogHeader>
              <DialogTitle>{t('itTickets.create.title')}</DialogTitle>
              <DialogDescription>
                {t('itTickets.create.description')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel htmlFor='it-ticket-title'>
                  {t('itTickets.fields.title')}
                </FieldLabel>
                <Input id='it-ticket-title' name='title' required />
              </Field>
              <Field>
                <FieldLabel htmlFor='it-ticket-category'>
                  {t('itTickets.fields.category')}
                </FieldLabel>
                <Select name='category' defaultValue='computer'>
                  <SelectTrigger id='it-ticket-category' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IT_TICKET_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {t(`itTickets.category.${category}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor='it-ticket-description'>
                  {t('itTickets.fields.description')}
                </FieldLabel>
                <Textarea
                  id='it-ticket-description'
                  name='description'
                  rows={4}
                />
                <FieldDescription>
                  {t('itTickets.create.descriptionHint')}
                </FieldDescription>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                {t('itTickets.actions.cancel')}
              </Button>
              <Button type='submit' disabled={busy}>
                {busy ? <Spinner /> : null}
                {t('itTickets.actions.submit')}
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
          <form onSubmit={submitResolution}>
            <DialogHeader>
              <DialogTitle>{t('itTickets.complete.title')}</DialogTitle>
              <DialogDescription>
                {t('itTickets.complete.description', {
                  title: completing?.title ?? '',
                })}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel htmlFor='it-ticket-resolution'>
                  {t('itTickets.fields.resolution')}
                </FieldLabel>
                <Textarea
                  id='it-ticket-resolution'
                  name='resolution'
                  rows={5}
                  required
                />
                <FieldDescription>
                  {t('itTickets.complete.descriptionHint')}
                </FieldDescription>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                disabled={busy}
                onClick={() => setCompleting(null)}
              >
                {t('itTickets.actions.cancel')}
              </Button>
              <Button type='submit' disabled={busy}>
                {busy ? <Spinner /> : null}
                {t('itTickets.actions.markCompleted')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function MetaItem({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='space-y-1'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='font-medium'>{value}</dd>
    </div>
  );
}
