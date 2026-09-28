import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { fetchItTickets } from './api.js';
import { ItTicketStatusBadge } from './status-badge.js';
import {
  IT_TICKET_STATUSES,
  isItTicketStatus,
  type ItTicket,
  type ItTicketCapabilities,
  type ItSupportOutletContext,
} from './types.js';

type StatusFilter = 'all' | (typeof IT_TICKET_STATUSES)[number];

/** Route `/it-support`: the ticket list, shared by employees and processors. */
export default function ItSupportPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly tickets?: ItTicket[];
    readonly capabilities?: ItTicketCapabilities;
    readonly error?: unknown;
  }>();

  const requestKey = `${statusFilter}:${reloadToken}`;
  useEffect(() => {
    const controller = new AbortController();
    const key = requestKey;
    fetchItTickets(api, {
      status: statusFilter === 'all' ? undefined : statusFilter,
      signal: controller.signal,
    }).then(
      ({ data, capabilities }) => {
        if (!controller.signal.aborted) {
          setResult({ key, tickets: data, capabilities });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, statusFilter, requestKey]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const tickets = loading ? [] : (result?.tickets ?? []);
  const capabilities = result?.capabilities;
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const columns = useMemo<ColumnDef<ItTicket>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itSupport.column.title')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='font-medium underline-offset-4 hover:underline'
            to={{ pathname: String(row.original.id), search: location.search }}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'category',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itSupport.column.category')}
          />
        ),
        cell: ({ row }) => t(`itSupport.category.${row.original.category}`),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itSupport.column.status')}
          />
        ),
        cell: ({ row }) => <ItTicketStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'submitterName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itSupport.column.submitter')}
          />
        ),
        cell: ({ row }) => row.original.submitterName ?? '—',
      },
      {
        accessorKey: 'handlerName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itSupport.column.handler')}
          />
        ),
        cell: ({ row }) => row.original.handlerName ?? '—',
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itSupport.column.createdAt')}
          />
        ),
        cell: ({ row }) =>
          row.original.createdAt
            ? dateFormat.format(new Date(row.original.createdAt))
            : '—',
      },
    ],
    [dateFormat, location.search, t],
  );

  const outletContext = useMemo<ItSupportOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const createAction = capabilities?.create ? (
    <Button
      nativeButton={false}
      render={
        <Link
          className={''}
          to={{ pathname: 'new', search: location.search }}
        />
      }
    >
      <PlusIcon data-icon='inline-start' />
      {t('itSupport.create.action')}
    </Button>
  ) : undefined;

  return (
    <PageContainer>
      <PageHeader
        title={t('itSupport.title')}
        description={t('itSupport.description')}
        actions={createAction}
      />

      <Tabs
        value={statusFilter}
        onValueChange={(value: string) => {
          if (value === 'all' || isItTicketStatus(value)) {
            setStatusFilter(value);
          }
        }}
      >
        <TabsList variant='line'>
          <TabsTrigger value='all'>{t('itSupport.filter.all')}</TabsTrigger>
          {IT_TICKET_STATUSES.map((status) => (
            <TabsTrigger key={status} value={status}>
              {t(`itSupport.status.${status}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{t('itSupport.error.listFailed')}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : loading ? (
        <Loading label={t('status.loading')} />
      ) : tickets.length === 0 ? (
        <div className='flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center'>
          <p className='text-sm text-muted-foreground'>
            {statusFilter === 'all'
              ? t('itSupport.empty.all')
              : t(`itSupport.empty.${statusFilter}`)}
          </p>
          {createAction}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={tickets}
          emptyMessage={t('dataTable.noResults')}
          getRowId={(row) => String(row.id)}
        />
      )}

      <Outlet context={outletContext} />
    </PageContainer>
  );
}
