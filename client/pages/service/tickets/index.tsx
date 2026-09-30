import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, TicketIcon } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  AcceptanceBadge,
  ConfidentialBadge,
  TicketPriorityBadge,
  TicketStatusBadge,
} from '../components/service-badges.js';
import { ServiceTableToolbar } from '../components/service-table-toolbar.js';
import {
  DateTimeText,
  EmptyState,
  LoadError,
  TableSkeleton,
} from '../components/service-states.js';
import { useAsync, useServiceApi } from '../service-hooks.js';
import { TICKET_STATUSES, type ServiceTicket } from '../types.js';

type StatusFilter = 'all' | 'open' | (typeof TICKET_STATUSES)[number];

const STATUS_FILTERS: readonly StatusFilter[] = [
  'all',
  'pending_acceptance',
  'pending_processing',
  'processing',
  'pending_confirmation',
  'closed',
];

const OPEN_STATUSES = TICKET_STATUSES.filter(
  (status) => status !== 'closed',
).join(',');

/** The ticket list, its lifecycle filters, and the child routes that open over it. */
export default function ServiceTicketsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<StatusFilter>('all');

  const query =
    filter === 'all' ? '' : filter === 'open' ? OPEN_STATUSES : filter;

  const tickets = useAsync(
    () =>
      api.listTickets(
        filter === 'all'
          ? { limit: 200 }
          : filter === 'open'
            ? { statuses: OPEN_STATUSES, limit: 200 }
            : { status: filter, limit: 200 },
      ),
    `tickets:${query}`,
  );

  const canCreate = useCan({
    resource: { type: 'composite', id: 'service.tickets' },
    action: 'create',
  }).can;

  const reload = useCallback(() => tickets.reload(), [tickets]);

  const columns = useMemo<ColumnDef<ServiceTicket>[]>(
    () => [
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.ticket.code')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium tabular-nums'>{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.ticket.title')}
          />
        ),
        filterFn: (row, _columnId, value) => {
          const needle = String(value).toLowerCase();
          return [
            row.original.title,
            row.original.customerName,
            row.original.deviceName,
          ]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(needle));
        },
        cell: ({ row }) => (
          <div className='flex min-w-0 flex-col'>
            <span className='truncate font-medium'>{row.original.title}</span>
            <span className='truncate text-xs text-muted-foreground'>
              {[row.original.customerName, row.original.deviceName]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: t('service.ticket.status'),
        cell: ({ row }) => (
          <div className='flex flex-wrap items-center gap-1'>
            <TicketStatusBadge value={row.original.status} />
            {row.original.confidential ? <ConfidentialBadge /> : null}
            <AcceptanceBadge
              status={row.original.acceptanceStatus ?? null}
              error={row.original.acceptanceError ?? null}
            />
          </div>
        ),
      },
      {
        accessorKey: 'priority',
        header: t('service.ticket.priority'),
        cell: ({ row }) => (
          <TicketPriorityBadge value={row.original.priority} />
        ),
      },
      {
        accessorKey: 'assigneeName',
        header: t('service.ticket.assignee'),
        cell: ({ row }) => (
          <span className='text-sm'>
            {row.original.assigneeName ?? (
              <span className='text-muted-foreground'>
                {t('service.ticket.unassigned')}
              </span>
            )}
          </span>
        ),
      },
      {
        accessorKey: 'dueAt',
        header: t('service.ticket.dueAt'),
        cell: ({ row }) => <DateTimeText value={row.original.dueAt} />,
      },
      {
        accessorKey: 'createdAt',
        header: t('service.ticket.createdAt'),
        cell: ({ row }) => <DateTimeText value={row.original.createdAt} />,
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.tickets.title')}
        description={t('service.tickets.description')}
        actions={
          canCreate ? (
            <Button onClick={() => void navigate('new')}>
              <PlusIcon />
              {t('service.tickets.new')}
            </Button>
          ) : null
        }
      />

      <Tabs
        value={filter}
        onValueChange={(value) => setFilter(value as StatusFilter)}
      >
        <TabsList className='flex-wrap'>
          {STATUS_FILTERS.map((status) => (
            <TabsTrigger key={status} value={status}>
              {status === 'all'
                ? t('service.tickets.filterAll')
                : t(`service.ticketStatus.${status}`, { defaultValue: status })}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tickets.error ? (
        <LoadError error={tickets.error} onRetry={tickets.reload} />
      ) : null}

      {tickets.loading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : (
        <DataTable
          columns={columns}
          data={tickets.data ?? []}
          emptyMessage={<EmptyState title={t('service.tickets.empty')} />}
          toolbar={(table) => (
            <ServiceTableToolbar
              table={table}
              columnId='title'
              placeholder={t('service.tickets.searchPlaceholder')}
            />
          )}
          onRowClick={(row) => void navigate(String(row.original.id))}
        />
      )}

      {tickets.data && tickets.data.length > 0 ? (
        <p className='flex items-center gap-2 text-xs text-muted-foreground'>
          <TicketIcon className='size-3.5' />
          {t('service.tickets.count', { count: tickets.data.length })}
        </p>
      ) : null}

      <Outlet context={{ reload }} />
    </PageContainer>
  );
}
