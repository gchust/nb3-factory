import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo } from 'react';

import { DataTable } from '#components/data-table';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { dateRange, formatInstant } from './format.js';
import type { LeaveStatus, LeaveType, LeaveRequest } from './types.js';
import { leaveStatuses, leaveTypes } from './types.js';

const statusTone = {
  pending: 'warning',
  approved: 'success',
  rejected: 'neutral',
} as const;

export function LeaveRequestTable({
  rows,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  loading,
  status,
  onStatusChange,
  type,
  onTypeChange,
  showEmployee,
  search,
}: {
  readonly rows: readonly LeaveRequest[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (pageSize: number) => void;
  readonly loading: boolean;
  readonly status: LeaveStatus | 'all';
  readonly onStatusChange: (status: LeaveStatus | 'all') => void;
  readonly type: LeaveType | 'all';
  readonly onTypeChange: (type: LeaveType | 'all') => void;
  readonly showEmployee: boolean;
  readonly search: string;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const columns = useMemo<ColumnDef<LeaveRequest>[]>(() => {
    const base: ColumnDef<LeaveRequest>[] = [
      ...(showEmployee
        ? [
            {
              accessorKey: 'userName',
              header: t('leave.table.employee'),
              cell: ({ row }) => (
                <span className='font-medium'>{row.original.userName}</span>
              ),
            } satisfies ColumnDef<LeaveRequest>,
          ]
        : []),
      {
        accessorKey: 'type',
        header: t('leave.table.type'),
        cell: ({ row }) => t(`leave.type.${row.original.type}`),
      },
      {
        accessorKey: 'startDate',
        header: t('leave.table.dates'),
        cell: ({ row }) => (
          <span className='whitespace-nowrap'>
            {dateRange(row.original.startDate, row.original.endDate, language)}
          </span>
        ),
      },
      {
        accessorKey: 'days',
        header: t('leave.table.days'),
        cell: ({ row }) => (
          <span className='tabular-nums'>{row.original.days}</span>
        ),
      },
      {
        accessorKey: 'reason',
        header: t('leave.table.reason'),
        cell: ({ row }) => (
          <span className='block max-w-64 truncate' title={row.original.reason}>
            {row.original.reason}
          </span>
        ),
      },
      {
        accessorKey: 'submittedAt',
        header: t('leave.table.submitted'),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {formatInstant(row.original.submittedAt, language)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: t('leave.table.status'),
        cell: ({ row }) => (
          <StatusBadge
            size='sm'
            tone={statusTone[row.original.status]}
            className='whitespace-nowrap'
          >
            {t(`leave.status.${row.original.status}`)}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        header: () => (
          <span className='sr-only'>{t('leave.table.actions')}</span>
        ),
        cell: ({ row }) => (
          <Button
            variant='ghost'
            size='sm'
            nativeButton={false}
            render={
              <Link
                to={`/leave/${encodeURIComponent(row.original.id)}${search}`}
              />
            }
          >
            {t('leave.actions.view')}
          </Button>
        ),
      },
    ];
    return base;
  }, [language, search, showEmployee, t]);

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Select
          items={[
            { value: 'all', label: t('leave.filter.allStatuses') },
            ...leaveStatuses.map((value) => ({
              value,
              label: t(`leave.status.${value}`),
            })),
          ]}
          value={status}
          onValueChange={(value) =>
            onStatusChange(value as LeaveStatus | 'all')
          }
        >
          <SelectTrigger aria-label={t('leave.table.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('leave.filter.allStatuses')}</SelectItem>
            {leaveStatuses.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`leave.status.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={[
            { value: 'all', label: t('leave.filter.allTypes') },
            ...leaveTypes.map((value) => ({
              value,
              label: t(`leave.type.${value}`),
            })),
          ]}
          value={type}
          onValueChange={(value) => onTypeChange(value as LeaveType | 'all')}
        >
          <SelectTrigger aria-label={t('leave.table.type')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('leave.filter.allTypes')}</SelectItem>
            {leaveTypes.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`leave.type.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DataTable
        columns={columns}
        data={[...rows]}
        manualPagination
        rowCount={total}
        paginationState={{ pageIndex: page - 1, pageSize }}
        onPaginationChange={(next) => {
          const nextState =
            typeof next === 'function'
              ? next({ pageIndex: page - 1, pageSize })
              : next;
          if (nextState.pageSize !== pageSize) {
            onPageSizeChange(nextState.pageSize);
          } else {
            onPageChange(nextState.pageIndex + 1);
          }
        }}
        loading={loading}
        emptyMessage={t('leave.list.empty')}
      />
    </div>
  );
}
