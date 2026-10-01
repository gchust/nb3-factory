import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { EyeIcon, PlayIcon, PlusIcon, RefreshCwIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import {
  TICKET_RESOURCE,
  TICKET_STATUSES,
  createTicket,
  completeTicket,
  listTickets,
  startTicket,
  type CreateTicketInput,
  type RepairTicket,
  type TicketListResult,
  type TicketStatus,
} from './api.js';
import { TicketDetailSheet } from './ticket-detail.js';
import { TicketFormDialog } from './ticket-form.js';

type StatusFilter = TicketStatus | 'all';

const STATUS_BADGE: Record<
  TicketStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  processing: 'secondary',
  completed: 'default',
};

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'payload' in error) {
    const payload = (error as { payload?: unknown }).payload;
    if (
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof (payload as { message?: unknown }).message === 'string'
    ) {
      return (payload as { message: string }).message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/** Employee IT repair requests: submit, track, and handle tickets. */
export default function ItRepairPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const canCreate = useCan({
    resource: TICKET_RESOURCE,
    action: 'create',
  }).can;

  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const applyLoad = useCallback((result: TicketListResult): void => {
    setTickets(result.data);
    setFailed(false);
  }, []);

  const reportLoadError = useCallback(
    (error: unknown): void => {
      setFailed(true);
      toaster.show({
        type: 'error',
        title: t('itRepair.loadFailed'),
        description: errorMessage(error),
      });
    },
    [t, toaster],
  );

  // The first load runs the promise in the effect and answers in its callbacks,
  // not by calling a state-setting function synchronously in the effect body.
  useEffect(() => {
    let active = true;
    listTickets(api)
      .then(
        (result) => {
          if (active) applyLoad(result);
        },
        (error: unknown) => {
          if (active) reportLoadError(error);
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, applyLoad, reportLoadError]);

  const refresh = useCallback((): void => {
    setLoading(true);
    setFailed(false);
    void listTickets(api)
      .then(applyLoad, reportLoadError)
      .finally(() => {
        setLoading(false);
      });
  }, [api, applyLoad, reportLoadError]);

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = {
      all: tickets.length,
      pending: 0,
      processing: 0,
      completed: 0,
    };
    for (const ticket of tickets) result[ticket.status] += 1;
    return result;
  }, [tickets]);

  const visible = useMemo(
    () =>
      status === 'all'
        ? tickets
        : tickets.filter((ticket) => ticket.status === status),
    [tickets, status],
  );

  const detail = useMemo(
    () => tickets.find((ticket) => ticket.id === detailId) ?? null,
    [tickets, detailId],
  );

  const submit = useCallback(
    async (input: CreateTicketInput): Promise<void> => {
      setSubmitting(true);
      try {
        const created = await createTicket(api, input);
        setCreating(false);
        setTickets((current) => [created, ...current]);
        toaster.show({
          type: 'success',
          title: t('itRepair.created'),
          description: created.title,
        });
      } catch (error) {
        toaster.show({
          type: 'error',
          title: t('itRepair.createFailed'),
          description: errorMessage(error),
        });
      } finally {
        setSubmitting(false);
      }
    },
    [api, t, toaster],
  );

  const replace = useCallback((ticket: RepairTicket): void => {
    setTickets((current) =>
      current.map((entry) => (entry.id === ticket.id ? ticket : entry)),
    );
  }, []);

  const start = useCallback(
    async (ticket: RepairTicket): Promise<void> => {
      setBusy(true);
      try {
        replace(await startTicket(api, ticket.id));
        toaster.show({
          type: 'success',
          title: t('itRepair.started'),
          description: ticket.title,
        });
      } catch (error) {
        toaster.show({
          type: 'error',
          title: t('itRepair.startFailed'),
          description: errorMessage(error),
        });
      } finally {
        setBusy(false);
      }
    },
    [api, replace, t, toaster],
  );

  const complete = useCallback(
    async (ticket: RepairTicket, resolution: string): Promise<void> => {
      setBusy(true);
      try {
        replace(await completeTicket(api, ticket.id, resolution));
        toaster.show({
          type: 'success',
          title: t('itRepair.completed'),
          description: ticket.title,
        });
      } catch (error) {
        toaster.show({
          type: 'error',
          title: t('itRepair.completeFailed'),
          description: errorMessage(error),
        });
      } finally {
        setBusy(false);
      }
    },
    [api, replace, t, toaster],
  );

  const columns = useMemo<ColumnDef<RepairTicket, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itRepair.columns.title')}
          />
        ),
        cell: ({ row }) => (
          <div className='min-w-0'>
            <div className='truncate font-medium'>{row.original.title}</div>
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
        header: t('itRepair.columns.category'),
        cell: ({ row }) => (
          <Badge variant='outline'>
            {t(`itRepair.category.${row.original.category}`)}
          </Badge>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itRepair.columns.status')}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={STATUS_BADGE[row.original.status]}>
            {t(`itRepair.status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        accessorKey: 'submittedByName',
        header: t('itRepair.columns.submitter'),
      },
      {
        accessorKey: 'handlerName',
        header: t('itRepair.columns.handler'),
        cell: ({ row }) => row.original.handlerName ?? '—',
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itRepair.columns.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {format(new Date(row.original.createdAt), 'PP')}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => {
          const ticket = row.original;
          return (
            <div className='flex justify-end gap-2'>
              {ticket.canStart ? (
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={busy}
                  onClick={() => void start(ticket)}
                >
                  <PlayIcon />
                  {t('itRepair.start')}
                </Button>
              ) : null}
              <Button
                type='button'
                size='sm'
                variant='ghost'
                aria-label={t('itRepair.view')}
                onClick={() => setDetailId(ticket.id)}
              >
                <EyeIcon />
              </Button>
            </div>
          );
        },
      },
    ],
    [busy, start, t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('itRepair.title')}
        description={t('itRepair.description')}
        actions={
          <>
            <Button
              type='button'
              variant='outline'
              size='icon'
              aria-label={t('itRepair.refresh')}
              disabled={loading}
              onClick={refresh}
            >
              <RefreshCwIcon />
            </Button>
            {canCreate ? (
              <Button type='button' onClick={() => setCreating(true)}>
                <PlusIcon />
                {t('itRepair.create')}
              </Button>
            ) : null}
          </>
        }
      />

      <Card className='gap-0 py-0'>
        <div className='p-4'>
          <Tabs
            value={status}
            onValueChange={(value) => setStatus(value as StatusFilter)}
          >
            <TabsList variant='line'>
              {(['all', ...TICKET_STATUSES] as const).map((entry) => (
                <TabsTrigger key={entry} value={entry}>
                  {entry === 'all'
                    ? t('itRepair.filter.all')
                    : t(`itRepair.status.${entry}`)}
                  <Badge variant='secondary' className='tabular-nums'>
                    {counts[entry]}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        {failed ? (
          <div className='p-4'>
            <Alert variant='destructive'>
              <AlertTitle>{t('itRepair.loadFailed')}</AlertTitle>
              <AlertDescription>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={refresh}
                >
                  {t('status.retry')}
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={visible}
            getRowId={(ticket) => String(ticket.id)}
            emptyMessage={t('itRepair.empty')}
            onRowClick={(row) => setDetailId(row.original.id)}
          />
        )}
      </Card>

      <TicketFormDialog
        open={creating}
        onOpenChange={setCreating}
        submitting={submitting}
        onSubmit={(input) => void submit(input)}
      />

      <TicketDetailSheet
        ticket={detail}
        busy={busy}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        onStart={(ticket) => void start(ticket)}
        onComplete={(ticket, resolution) => void complete(ticket, resolution)}
      />
    </PageContainer>
  );
}
