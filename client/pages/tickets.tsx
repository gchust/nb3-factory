/**
 * Support tickets — one screen that behaves differently for the two jobs.
 *
 * An employee sees the tickets they submitted and can raise a new one. A
 * handler sees every ticket and moves the ones waiting through
 * "start handling" and "complete". The server decides which of those is true,
 * and reports it as `meta.canCreate` / `meta.canProcess`; this page only shows
 * the actions the next request would be allowed to perform.
 *
 * The open ticket lives in the URL (`?ticket=<id>`) so a refresh reopens the
 * same detail, and the detail itself is re-read from the server rather than
 * kept only in memory.
 */
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { EyeIcon, PlusIcon } from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Toaster, toast } from '@/components/ui/toast';

type TicketStatus = 'pending' | 'processing' | 'completed';
type TicketCategory = 'computer' | 'account' | 'other';
type StatusTab = 'all' | TicketStatus;
type ActionMode = 'start' | 'complete';

interface Ticket {
  readonly id: number;
  readonly title: string;
  readonly category: TicketCategory;
  readonly description: string | null;
  readonly submitterId: string;
  readonly submitterName: string | null;
  readonly handlerId: string | null;
  readonly handlerName: string | null;
  readonly status: TicketStatus;
  readonly handlingNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface TicketMeta {
  readonly canCreate: boolean;
  readonly canProcess: boolean;
}

interface TicketListResponse {
  readonly data: Ticket[];
  readonly meta: TicketMeta;
}

interface TicketResponse {
  readonly data: Ticket;
}

const CATEGORIES: readonly TicketCategory[] = ['computer', 'account', 'other'];
const STATUSES: readonly TicketStatus[] = [
  'pending',
  'processing',
  'completed',
];

const STATUS_BADGE: Record<TicketStatus, 'default' | 'secondary' | 'outline'> =
  {
    pending: 'outline',
    processing: 'secondary',
    completed: 'default',
  };

const EMPTY_META: TicketMeta = { canCreate: false, canProcess: false };

export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const detailId = searchParams.get('ticket');

  const [tickets, setTickets] = useState<readonly Ticket[]>([]);
  const [meta, setMeta] = useState<TicketMeta>(EMPTY_META);
  const [detail, setDetail] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<{
    readonly mode: ActionMode;
    readonly ticket: Ticket;
  } | null>(null);

  const loadTickets = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await api.request<TicketListResponse>({
        path: 'tickets',
      });
      setTickets(response.data);
      setMeta(response.meta);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadDetail = useCallback(
    async (id: string): Promise<void> => {
      try {
        const response = await api.request<TicketResponse>({
          path: `tickets/${encodeURIComponent(id)}`,
        });
        setDetail(response.data);
      } catch {
        setDetail(null);
      }
    },
    [api],
  );

  useEffect(() => {
    // The load starts in a timeout so no state is set synchronously while the
    // effect body runs, matching the pattern the users plugin uses.
    const timer = window.setTimeout(() => void loadTickets(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTickets]);

  useEffect(() => {
    if (!detailId) return undefined;
    const timer = window.setTimeout(() => void loadDetail(detailId), 0);
    return () => window.clearTimeout(timer);
  }, [detailId, loadDetail]);

  const counts = useMemo(() => {
    const result: Record<StatusTab, number> = {
      all: tickets.length,
      pending: 0,
      processing: 0,
      completed: 0,
    };
    for (const ticket of tickets) {
      result[ticket.status] += 1;
    }
    return result;
  }, [tickets]);

  const visible = useMemo(
    () =>
      statusTab === 'all'
        ? tickets
        : tickets.filter((ticket) => ticket.status === statusTab),
    [statusTab, tickets],
  );

  const statusLabel = useCallback(
    (status: TicketStatus): string => t(`tickets.status.${status}`),
    [t],
  );

  const categoryLabel = useCallback(
    (category: TicketCategory): string => t(`tickets.category.${category}`),
    [t],
  );

  const openDetail = useCallback(
    (ticket: Ticket): void => {
      setDetail(ticket);
      setSearchParams({ ticket: String(ticket.id) });
    },
    [setSearchParams],
  );

  const closeDetail = useCallback((): void => {
    setDetail(null);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.column.title')}
          />
        ),
        cell: ({ row }) => (
          <div className='min-w-0'>
            <div className='font-medium'>{row.original.title}</div>
            {row.original.description ? (
              <div className='max-w-md truncate text-xs text-muted-foreground'>
                {row.original.description}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'category',
        header: t('tickets.column.category'),
        cell: ({ row }) => (
          <Badge variant='outline'>
            {categoryLabel(row.original.category)}
          </Badge>
        ),
      },
      {
        accessorKey: 'status',
        header: t('tickets.column.status'),
        cell: ({ row }) => (
          <Badge variant={STATUS_BADGE[row.original.status]}>
            {statusLabel(row.original.status)}
          </Badge>
        ),
      },
      {
        accessorKey: 'submitterName',
        header: t('tickets.column.submitter'),
        cell: ({ row }) => row.original.submitterName ?? '—',
      },
      {
        accessorKey: 'handlerName',
        header: t('tickets.column.handler'),
        cell: ({ row }) => row.original.handlerName ?? t('tickets.unassigned'),
      },
      {
        accessorKey: 'createdAt',
        header: t('tickets.column.createdAt'),
        cell: ({ row }) => format(new Date(row.original.createdAt), 'PPp'),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className='text-right'>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => openDetail(row.original)}
            >
              <EyeIcon data-icon='inline-start' />
              {t('tickets.view')}
            </Button>
          </div>
        ),
      },
    ],
    [categoryLabel, openDetail, statusLabel, t],
  );

  const submitTicket = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api.request<TicketResponse>({
        path: 'tickets',
        method: 'POST',
        json: {
          title: formValue(data, 'title'),
          category: formValue(data, 'category'),
          description: formValue(data, 'description'),
        },
      });
      setCreating(false);
      toast.add({
        type: 'success',
        title: t('tickets.create.success'),
        description: t('tickets.create.successDescription'),
      });
      await loadTickets();
    } catch {
      toast.add({
        type: 'error',
        title: t('tickets.create.failed'),
        description: t('tickets.common.retryHint'),
      });
    }
  };

  const submitAction = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!action) return;
    const data = new FormData(event.currentTarget);
    const handlingNote = formValue(data, 'handlingNote');
    const target = action.ticket;
    try {
      await api.request<TicketResponse>({
        path: `tickets/${target.id}/${action.mode}`,
        method: 'POST',
        json: { handlingNote },
      });
      setAction(null);
      toast.add({
        type: 'success',
        title:
          action.mode === 'start'
            ? t('tickets.action.started')
            : t('tickets.action.completed'),
        description: target.title,
      });
      await loadTickets();
      if (detailId === String(target.id)) {
        await loadDetail(detailId);
      }
    } catch {
      toast.add({
        type: 'error',
        title: t('tickets.action.failed'),
        description: t('tickets.common.retryHint'),
      });
    }
  };

  return (
    <PageContainer>
      <Toaster />
      <PageHeader
        title={t('tickets.title')}
        description={t('tickets.description')}
        actions={
          meta.canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon data-icon='inline-start' />
              {t('tickets.newTicket')}
            </Button>
          ) : null
        }
      />

      {failed ? (
        <div className='flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm'>
          <span>{t('tickets.loadFailed')}</span>
          <Button
            variant='outline'
            size='sm'
            onClick={() => void loadTickets()}
          >
            {t('status.retry')}
          </Button>
        </div>
      ) : null}

      <div className='space-y-4'>
        <Tabs
          value={statusTab}
          onValueChange={(value) => setStatusTab(value as StatusTab)}
        >
          <TabsList variant='line'>
            {(['all', ...STATUSES] as const).map((status) => (
              <TabsTrigger key={status} value={status}>
                {status === 'all'
                  ? t('tickets.status.all')
                  : statusLabel(status)}
                <Badge variant='secondary' className='tabular-nums'>
                  {counts[status]}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <Loading className='py-16' />
        ) : (
          <DataTable
            columns={columns}
            data={[...visible]}
            pageSize={10}
            getRowId={(ticket) => String(ticket.id)}
            emptyMessage={t('tickets.empty')}
            toolbar={(table) => (
              <Input
                className='max-w-sm'
                placeholder={t('tickets.searchPlaceholder')}
                value={
                  (table.getColumn('title')?.getFilterValue() as
                    string | undefined) ?? ''
                }
                onChange={(event) =>
                  table.getColumn('title')?.setFilterValue(event.target.value)
                }
              />
            )}
          />
        )}
      </div>

      <Sheet
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <SheetContent className='sm:max-w-lg'>
          {detail ? (
            <>
              <SheetHeader>
                <SheetTitle>{detail.title}</SheetTitle>
                <SheetDescription>
                  {t('tickets.detail.ticketNumber', { id: detail.id })}
                </SheetDescription>
              </SheetHeader>
              <div className='flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant={STATUS_BADGE[detail.status]}>
                    {statusLabel(detail.status)}
                  </Badge>
                  <Badge variant='outline'>
                    {categoryLabel(detail.category)}
                  </Badge>
                </div>

                <dl className='grid gap-3 text-sm sm:grid-cols-2'>
                  <DetailField
                    label={t('tickets.detail.submittedBy')}
                    value={detail.submitterName ?? detail.submitterId}
                  />
                  <DetailField
                    label={t('tickets.detail.handledBy')}
                    value={detail.handlerName ?? t('tickets.unassigned')}
                  />
                  <DetailField
                    label={t('tickets.detail.createdAt')}
                    value={format(new Date(detail.createdAt), 'PPp')}
                  />
                  <DetailField
                    label={t('tickets.detail.updatedAt')}
                    value={format(new Date(detail.updatedAt), 'PPp')}
                  />
                </dl>

                {detail.description ? (
                  <div>
                    <div className='text-xs font-medium text-muted-foreground'>
                      {t('tickets.detail.description')}
                    </div>
                    <p className='mt-1 text-sm whitespace-pre-wrap'>
                      {detail.description}
                    </p>
                  </div>
                ) : null}

                <Separator />

                <div>
                  <div className='text-xs font-medium text-muted-foreground'>
                    {t('tickets.detail.handlingNote')}
                  </div>
                  <p className='mt-1 text-sm whitespace-pre-wrap'>
                    {detail.handlingNote ?? t('tickets.detail.noNote')}
                  </p>
                </div>

                {meta.canProcess &&
                (detail.status === 'pending' ||
                  detail.status === 'processing') ? (
                  <div className='flex flex-col gap-2'>
                    <Button
                      onClick={() =>
                        setAction({
                          mode:
                            detail.status === 'pending' ? 'start' : 'complete',
                          ticket: detail,
                        })
                      }
                    >
                      {detail.status === 'pending'
                        ? t('tickets.action.start')
                        : t('tickets.action.complete')}
                    </Button>
                    <p className='text-xs text-muted-foreground'>
                      {t('tickets.detail.handlerHint')}
                    </p>
                  </div>
                ) : detail.status === 'completed' ? (
                  <p className='text-xs text-muted-foreground'>
                    {t('tickets.detail.readOnly')}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='sm:max-w-md'>
          <form onSubmit={(event) => void submitTicket(event)}>
            <DialogHeader>
              <DialogTitle>{t('tickets.create.title')}</DialogTitle>
              <DialogDescription>
                {t('tickets.create.description')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel htmlFor='ticket-title'>
                  {t('tickets.field.title')}
                </FieldLabel>
                <Input
                  id='ticket-title'
                  name='title'
                  maxLength={255}
                  placeholder={t('tickets.field.titlePlaceholder')}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='ticket-category'>
                  {t('tickets.field.category')}
                </FieldLabel>
                <Select name='category' defaultValue='computer'>
                  <SelectTrigger id='ticket-category' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {categoryLabel(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor='ticket-description'>
                  {t('tickets.field.description')}
                </FieldLabel>
                <Textarea
                  id='ticket-description'
                  name='description'
                  rows={4}
                  maxLength={2000}
                  placeholder={t('tickets.field.descriptionPlaceholder')}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setCreating(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit'>{t('tickets.create.submit')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <form onSubmit={(event) => void submitAction(event)}>
            <DialogHeader>
              <DialogTitle>
                {action?.mode === 'complete'
                  ? t('tickets.action.completeTitle')
                  : t('tickets.action.startTitle')}
              </DialogTitle>
              <DialogDescription>
                {action?.mode === 'complete'
                  ? t('tickets.action.completeDescription')
                  : t('tickets.action.startDescription')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel htmlFor='ticket-note'>
                  {t('tickets.field.handlingNote')}
                </FieldLabel>
                <Textarea
                  id='ticket-note'
                  name='handlingNote'
                  rows={4}
                  maxLength={2000}
                  placeholder={
                    action?.mode === 'complete'
                      ? t('tickets.field.completeNotePlaceholder')
                      : t('tickets.field.handlingNotePlaceholder')
                  }
                  required={action?.mode === 'start'}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setAction(null)}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit'>
                {action?.mode === 'complete'
                  ? t('tickets.action.complete')
                  : t('tickets.action.start')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function DetailField({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div>
      <dt className='text-xs font-medium text-muted-foreground'>{label}</dt>
      <dd className='mt-1'>{value}</dd>
    </div>
  );
}

function formValue(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value.trim() : '';
}
