import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  EyeIcon,
  InboxIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useNavigate } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
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
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
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
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import {
  completeTicket,
  createTicket,
  fetchTickets,
  startTicket,
} from './api.js';
import { TicketDetail } from './ticket-detail.js';
import {
  TICKET_CATEGORIES,
  type Ticket,
  type TicketCategory,
  type TicketListResult,
  type TicketStatus,
  TICKET_STATUSES,
} from './types.js';

type StatusTab = 'all' | TicketStatus;

const STATUS_BADGE: Record<
  TicketStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  processing: 'secondary',
  completed: 'default',
};

interface QueryState {
  readonly key: string;
  readonly result?: TicketListResult;
  readonly error?: unknown;
}

/** Loads the list for one status, discarding a response that a newer request has already superseded. */
function useTicketList(
  status: TicketStatus | undefined,
  enabled: boolean,
  reloadToken: number,
): {
  loading: boolean;
  result?: TicketListResult;
  error?: unknown;
} {
  const api = useApiClient();
  const key = `${status ?? 'all'}:${reloadToken}`;
  const [state, setState] = useState<QueryState>({ key });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetchTickets(api, status, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setState({ key, result });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, status, enabled, key]);

  if (!enabled) return { loading: false };
  return {
    loading: state.key !== key,
    result: state.key === key ? state.result : undefined,
    error: state.key === key ? state.error : undefined,
  };
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();

  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [reloadToken, setReloadToken] = useState(0);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const all = useTicketList(undefined, true, reloadToken);
  const filtered = useTicketList(
    statusTab === 'all' ? undefined : statusTab,
    statusTab !== 'all',
    reloadToken,
  );

  const active = statusTab === 'all' ? all : filtered;
  const meta = all.result?.meta;
  const canProcess = meta?.canProcess ?? false;
  const rows = active.result?.data ?? [];

  const counts = useMemo(() => {
    const list = all.result?.data ?? [];
    const count = (status: TicketStatus): number =>
      list.filter((ticket) => ticket.status === status).length;
    return {
      all: list.length,
      pending: count('pending'),
      processing: count('processing'),
      completed: count('completed'),
    } satisfies Record<StatusTab, number>;
  }, [all.result]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const reportError = useCallback(
    (error: unknown, fallbackKey: string): void => {
      const message =
        error instanceof ApiClientError && error.message
          ? error.message
          : t(fallbackKey);
      toaster.show({ type: 'error', title: message });
    },
    [toaster, t],
  );

  const applyStarted = useCallback(
    (ticket: Ticket): void => {
      setSelected((current) => (current?.id === ticket.id ? ticket : current));
      reload();
    },
    [reload],
  );

  async function handleCreate(input: {
    title: string;
    category: TicketCategory;
    description: string;
  }): Promise<void> {
    setBusy(true);
    try {
      const created = await createTicket(api, {
        title: input.title,
        category: input.category,
        description: input.description || undefined,
      });
      setCreating(false);
      reload();
      toaster.show({
        type: 'success',
        title: t('tickets.created', { reference: created.data.reference }),
      });
    } catch (error) {
      reportError(error, 'tickets.createFailed');
    } finally {
      setBusy(false);
    }
  }

  async function handleStart(ticket: Ticket): Promise<void> {
    setBusy(true);
    try {
      const result = await startTicket(api, ticket.id);
      applyStarted(result.data);
      toaster.show({ type: 'success', title: t('tickets.detail.started') });
    } catch (error) {
      reportError(error, 'tickets.detail.startFailed');
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete(
    ticket: Ticket,
    resolution: string,
  ): Promise<void> {
    setBusy(true);
    try {
      const result = await completeTicket(api, ticket.id, resolution);
      applyStarted(result.data);
      toaster.show({ type: 'success', title: t('tickets.detail.completed') });
    } catch (error) {
      reportError(error, 'tickets.detail.completeFailed');
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<ColumnDef<Ticket>[]>(() => {
    const definitions: ColumnDef<Ticket>[] = [
      {
        accessorKey: 'reference',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.fields.reference')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.reference}</span>
        ),
      },
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.fields.title')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.title}</span>
        ),
      },
      {
        accessorKey: 'category',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.fields.category')}
          />
        ),
        cell: ({ row }) => (
          <Badge variant='secondary'>
            {t(`tickets.category.${row.original.category}`)}
          </Badge>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.fields.status')}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={STATUS_BADGE[row.original.status]}>
            {t(`tickets.status.${row.original.status}`)}
          </Badge>
        ),
      },
    ];

    if (canProcess) {
      definitions.push({
        accessorKey: 'submitterName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.fields.submitter')}
          />
        ),
      });
    }

    definitions.push(
      {
        accessorKey: 'handlerName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.fields.handler')}
          />
        ),
        cell: ({ row }) =>
          row.original.handlerName ?? (
            <span className='text-muted-foreground'>
              {t('tickets.handlerUnassigned')}
            </span>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.fields.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {formatWhen(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('tickets.fields.actions')}</span>
        ),
        cell: ({ row }) => (
          <Button
            variant='ghost'
            size='sm'
            onClick={(event) => {
              event.stopPropagation();
              setSelected(row.original);
            }}
          >
            <EyeIcon data-icon='inline-start' />
            {canProcess ? t('tickets.action.open') : t('tickets.action.view')}
          </Button>
        ),
      },
    );

    return definitions;
  }, [canProcess, t]);

  return (
    <PageContainer>
      <PageHeader
        title={t('tickets.title')}
        description={t('tickets.description')}
        actions={
          <>
            <Button
              variant='outline'
              onClick={reload}
              disabled={active.loading}
            >
              <RefreshCwIcon data-icon='inline-start' />
              {t('tickets.refresh')}
            </Button>
            {meta?.canCreate ? (
              <Button onClick={() => setCreating(true)}>
                <PlusIcon data-icon='inline-start' />
                {t('tickets.newTicket')}
              </Button>
            ) : null}
          </>
        }
      />

      <Tabs
        value={statusTab}
        onValueChange={(value) => setStatusTab(value as StatusTab)}
      >
        <TabsList variant='line'>
          {(['all', ...TICKET_STATUSES] as const).map((status) => (
            <TabsTrigger key={status} value={status}>
              {status === 'all'
                ? t('tickets.filter.all')
                : t(`tickets.status.${status}`)}
              <Badge variant='secondary' className='tabular-nums'>
                {counts[status]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {active.error ? (
        <Alert variant='destructive'>
          <ShieldAlertIcon />
          <AlertTitle>{t('tickets.loadFailed')}</AlertTitle>
          <AlertDescription className='flex items-center justify-between gap-4'>
            <span>
              {active.error instanceof ApiClientError && active.error.message
                ? active.error.message
                : t('tickets.loadFailedHint')}
            </span>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('tickets.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : active.loading && rows.length === 0 ? (
        <div className='space-y-2'>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className='h-12 w-full' />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={[...rows]}
          pageSize={10}
          getRowId={(ticket) => ticket.id}
          onRowClick={(row) => setSelected(row.original)}
          emptyMessage={
            <div className='flex flex-col items-center gap-2 py-8 text-center'>
              <InboxIcon className='size-8 text-muted-foreground' />
              <p className='text-sm text-muted-foreground'>
                {statusTab === 'all'
                  ? t('tickets.empty')
                  : t('tickets.emptyFiltered')}
              </p>
            </div>
          }
          toolbar={(table) => (
            <DataTableViewOptions
              table={table}
              getColumnLabel={(column) =>
                t(`tickets.fields.${column.id}`, {
                  defaultValue: column.id,
                })
              }
            />
          )}
        />
      )}

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className='w-full sm:max-w-lg'>
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.title}</SheetTitle>
                <SheetDescription>{selected.reference}</SheetDescription>
              </SheetHeader>
              <div className='flex-1 overflow-y-auto px-4'>
                <TicketDetail
                  ticket={selected}
                  meta={
                    meta ?? {
                      role: 'employee',
                      canCreate: false,
                      canProcess: false,
                    }
                  }
                  busy={busy}
                  onStart={() => handleStart(selected)}
                  onComplete={(resolution) =>
                    handleComplete(selected, resolution)
                  }
                />
                <div className='py-4'>
                  <Button
                    variant='outline'
                    onClick={() => {
                      void navigate(`/tickets/${selected.id}`);
                    }}
                  >
                    {t('tickets.action.openFull')}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <CreateTicketDialog
        open={creating}
        busy={busy}
        onOpenChange={(open) => {
          if (!open) setCreating(false);
        }}
        onSubmit={handleCreate}
      />
    </PageContainer>
  );
}

interface CreateTicketDialogProps {
  readonly open: boolean;
  readonly busy: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (input: {
    title: string;
    category: TicketCategory;
    description: string;
  }) => void | Promise<void>;
}

function CreateTicketDialog({
  open,
  busy,
  onOpenChange,
  onSubmit,
}: CreateTicketDialogProps): ReactElement {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TicketCategory>('computer');
  const [description, setDescription] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const valid = title.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('tickets.createTitle')}</DialogTitle>
          <DialogDescription>
            {t('tickets.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='ticket-title'>
              {t('tickets.fields.title')}
            </FieldLabel>
            <Input
              id='ticket-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('tickets.form.titlePlaceholder')}
              maxLength={200}
              autoFocus
            />
            {showErrors && !valid ? (
              <FieldDescription className='text-destructive'>
                {t('tickets.form.titleRequired')}
              </FieldDescription>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor='ticket-category'>
              {t('tickets.fields.category')}
            </FieldLabel>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as TicketCategory)}
            >
              <SelectTrigger id='ticket-category'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_CATEGORIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`tickets.category.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor='ticket-description'>
              {t('tickets.fields.description')}
            </FieldLabel>
            <Textarea
              id='ticket-description'
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('tickets.form.descriptionPlaceholder')}
              rows={4}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              if (!valid) {
                setShowErrors(true);
                return;
              }
              void onSubmit({
                title: title.trim(),
                category,
                description: description.trim(),
              });
            }}
          >
            {t('tickets.form.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
