import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { PlusIcon, WrenchIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { fetchTickets } from './ticket-api.js';
import {
  STATUS_BADGE,
  TICKET_STATUSES,
  type Ticket,
  type TicketStatus,
} from './types.js';

export interface TicketsOutletContext {
  readonly reload: () => void;
}

function toStatus(value: string | null): TicketStatus | undefined {
  return value && (TICKET_STATUSES as readonly string[]).includes(value)
    ? (value as TicketStatus)
    : undefined;
}

export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = toStatus(searchParams.get('status'));

  const [tickets, setTickets] = useState<readonly Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => {
    setLoading(true);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    fetchTickets(api, status)
      .then((data) => {
        if (!active) return;
        setTickets(data);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, status, revision]);

  const columns = useMemo<ColumnDef<Ticket, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.columns.title')}
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
            title={t('tickets.columns.category')}
          />
        ),
        cell: ({ row }) => t(`tickets.category.${row.original.category}`),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.columns.status')}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={STATUS_BADGE[row.original.status]}>
            {t(`tickets.status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        accessorKey: 'submitterName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.columns.submitter')}
          />
        ),
      },
      {
        accessorKey: 'handlerName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.columns.handler')}
          />
        ),
        cell: ({ row }) => row.original.handlerName ?? '—',
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.columns.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {format(new Date(row.original.createdAt), 'PPp')}
          </span>
        ),
      },
    ],
    [location.search, t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('tickets.title')}
        description={t('tickets.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('tickets.create.action')}
          </Button>
        }
      />

      {failed ? (
        <Alert variant='destructive'>
          <WrenchIcon />
          <AlertTitle>{t('tickets.error.title')}</AlertTitle>
          <AlertDescription>{t('tickets.error.reload')}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        columns={columns}
        data={[...tickets]}
        emptyMessage={t('tickets.empty')}
        toolbar={() => (
          <Select
            value={status ?? 'all'}
            onValueChange={(value: string | null) => {
              const next = new URLSearchParams(searchParams);
              if (!value || value === 'all') next.delete('status');
              else next.set('status', value);
              setLoading(true);
              setSearchParams(next, { replace: true });
            }}
          >
            <SelectTrigger
              className='w-44'
              aria-label={t('tickets.filter.label')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('tickets.filter.all')}</SelectItem>
              {TICKET_STATUSES.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`tickets.status.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {loading ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner />
          {t('tickets.loading')}
        </div>
      ) : null}

      <Outlet context={{ reload } satisfies TicketsOutletContext} />
    </PageContainer>
  );
}
