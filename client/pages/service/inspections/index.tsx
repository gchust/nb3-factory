import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarPlusIcon, ClipboardCheckIcon } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ServiceTableToolbar } from '../components/service-table-toolbar.js';
import {
  DateText,
  DateTimeText,
  EmptyState,
  LoadError,
  TableSkeleton,
} from '../components/service-states.js';
import { InspectionStatusBadge } from '../components/service-badges.js';
import {
  useAsync,
  useServiceApi,
  useServicePermission,
} from '../service-hooks.js';
import type { ServiceInspection } from '../types.js';
import type { InspectionsOutletContext } from './context.js';

type StatusFilter = 'all' | 'scheduled' | 'overdue' | 'completed';

const STATUS_FILTERS: readonly StatusFilter[] = [
  'all',
  'scheduled',
  'overdue',
  'completed',
];

/** Inspection plans with their overdue state, and the child routes that open over them. */
export default function ServiceInspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<StatusFilter>('all');

  const inspections = useAsync(
    () => api.listInspections(filter === 'all' ? {} : { status: filter }),
    `inspections:${filter}`,
  );

  const canManage = useServicePermission('service.inspections', 'manage');

  const reload = useCallback(() => inspections.reload(), [inspections]);

  const columns = useMemo<ColumnDef<ServiceInspection>[]>(
    () => [
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.inspection.code')}
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
            title={t('service.inspection.title')}
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
        accessorKey: 'scheduledDate',
        header: t('service.inspection.scheduledDate'),
        cell: ({ row }) => <DateText value={row.original.scheduledDate} />,
      },
      {
        accessorKey: 'status',
        header: t('service.inspection.status'),
        cell: ({ row }) => (
          <InspectionStatusBadge value={row.original.status} />
        ),
      },
      {
        accessorKey: 'assigneeName',
        header: t('service.inspection.assignee'),
        cell: ({ row }) =>
          row.original.assigneeName ?? (
            <span className='text-muted-foreground'>
              {t('service.ticket.unassigned')}
            </span>
          ),
      },
      {
        accessorKey: 'completedAt',
        header: t('service.inspection.completedAt'),
        cell: ({ row }) => <DateTimeText value={row.original.completedAt} />,
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.inspections.title')}
        description={t('service.inspections.description')}
        actions={
          canManage ? (
            <Button onClick={() => void navigate('new')}>
              <CalendarPlusIcon />
              {t('service.inspections.new')}
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
                ? t('service.inspections.filterAll')
                : t(`service.inspectionStatus.${status}`, {
                    defaultValue: status,
                  })}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {inspections.error ? (
        <LoadError error={inspections.error} onRetry={inspections.reload} />
      ) : null}

      {inspections.loading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : (
        <DataTable
          columns={columns}
          data={inspections.data ?? []}
          emptyMessage={<EmptyState title={t('service.inspections.empty')} />}
          toolbar={(table) => (
            <ServiceTableToolbar
              table={table}
              columnId='title'
              placeholder={t('service.inspections.searchPlaceholder')}
            />
          )}
          onRowClick={(row) => void navigate(String(row.original.id))}
        />
      )}

      {inspections.data && inspections.data.length > 0 ? (
        <p className='flex items-center gap-2 text-xs text-muted-foreground'>
          <ClipboardCheckIcon className='size-3.5' />
          {t('service.inspections.count', { count: inspections.data.length })}
        </p>
      ) : null}

      <Outlet context={{ reload } satisfies InspectionsOutletContext} />
    </PageContainer>
  );
}
