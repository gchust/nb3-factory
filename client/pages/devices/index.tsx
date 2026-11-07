import { DataTable } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { Boxes, PlusIcon } from 'lucide-react';
import { useMemo, type ReactElement } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import {
  DEVICE_STATUSES,
  isDeviceStatus,
  type Device,
  type DeviceListResponse,
  type DeviceStatus,
} from './types.js';
import { useDeviceRequest } from './use-device-data.js';

const PAGE_SIZES = [20, 50, 100] as const;

export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const requestedStatus = params.get('status');
  const status: DeviceStatus | 'all' = isDeviceStatus(requestedStatus)
    ? requestedStatus
    : 'all';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const requestedPageSize = Number.parseInt(params.get('pageSize') ?? '20', 10);
  const pageSize = PAGE_SIZES.includes(
    requestedPageSize as (typeof PAGE_SIZES)[number],
  )
    ? requestedPageSize
    : 20;
  const path = useMemo(() => {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (status !== 'all') query.set('status', status);
    return `devices?${query.toString()}`;
  }, [page, pageSize, status]);
  const request = useDeviceRequest<DeviceListResponse>(path);
  const rows = request.data?.data ?? [];
  const filtered = status !== 'all';
  const update = (key: string, value: string) => {
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key === 'status') next.delete('page');
        return next;
      },
      { replace: true },
    );
  };
  const clearFilter = () => {
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        next.delete('status');
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  };
  const create = (
    <Button
      nativeButton={false}
      render={
        <Link to={{ pathname: '/devices/new', search: location.search }} />
      }
    >
      <PlusIcon />
      {t('devices.create.action')}
    </Button>
  );
  const columns = useMemo<ColumnDef<Device>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('devices.fields.code'),
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: t('devices.fields.name'),
        enableHiding: false,
        enableSorting: false,
      },
      {
        id: 'status',
        header: t('devices.fields.status'),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === 'available' ? 'secondary' : 'default'
            }
          >
            {t(`devices.status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: 'notes',
        header: t('devices.fields.notes'),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.notes ? (
            <span
              className='block max-w-72 truncate'
              title={row.original.notes}
            >
              {row.original.notes}
            </span>
          ) : (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        id: 'actions',
        header: t('devices.table.actions'),
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            nativeButton={false}
            variant='ghost'
            size='sm'
            render={
              <Link
                to={{
                  pathname: `/devices/edit/${encodeURIComponent(row.original.id)}`,
                  search: location.search,
                }}
              />
            }
          >
            {t('actions.edit')}
          </Button>
        ),
      },
    ],
    [location.search, t],
  );

  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('devices.title')}
          description={t('devices.description')}
          actions={create}
        />
        <div className='flex flex-wrap items-center gap-3'>
          <Select
            items={[
              { value: 'all', label: t('devices.status.all') },
              ...DEVICE_STATUSES.map((value) => ({
                value,
                label: t(`devices.status.${value}`),
              })),
            ]}
            value={status}
            onValueChange={(value) => {
              if (value !== null)
                update('status', value === 'all' ? '' : value);
            }}
          >
            <SelectTrigger
              className='w-full sm:w-48'
              aria-label={t('devices.filter.status')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('devices.status.all')}</SelectItem>
              {DEVICE_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`devices.status.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtered && (
            <Button variant='ghost' onClick={clearFilter}>
              {t('devices.filter.clear')}
            </Button>
          )}
          {request.data && request.loading && (
            <span role='status' className='text-sm text-muted-foreground'>
              {t('status.loading')}
            </span>
          )}
        </div>
        {request.error ? (
          <div className='rounded-lg border border-destructive/30 bg-card p-4 text-sm text-destructive'>
            <p>{t('devices.error.loadFailed')}</p>
            <Button
              className='mt-3'
              variant='outline'
              size='sm'
              onClick={request.reload}
            >
              {t('actions.retry')}
            </Button>
          </div>
        ) : request.loading && !request.data ? (
          <div
            role='status'
            className='rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground'
          >
            {t('status.loading')}
          </div>
        ) : rows.length ? (
          <DataTable<Device>
            columns={columns}
            data={rows}
            getRowId={(row) => row.id}
            manualPagination
            rowCount={request.data?.meta.total ?? 0}
            paginationState={{ pageIndex: page - 1, pageSize }}
            onPaginationChange={(updater) => {
              const next =
                typeof updater === 'function'
                  ? updater({ pageIndex: page - 1, pageSize })
                  : updater;
              setParams(
                (old) => {
                  const result = new URLSearchParams(old);
                  result.set('page', String(next.pageIndex + 1));
                  result.set('pageSize', String(next.pageSize));
                  return result;
                },
                { replace: true },
              );
            }}
            pageSizeOptions={[...PAGE_SIZES]}
            showSelectedCount={false}
            loading={request.loading}
          />
        ) : (
          <Empty className='min-h-48 border border-dashed'>
            <EmptyMedia variant='icon'>
              <Boxes />
            </EmptyMedia>
            <EmptyTitle>
              {t(
                filtered
                  ? 'devices.empty.filteredTitle'
                  : 'devices.empty.title',
              )}
            </EmptyTitle>
            <EmptyDescription>
              {t(
                filtered
                  ? 'devices.empty.filteredDescription'
                  : 'devices.empty.description',
              )}
            </EmptyDescription>
            {filtered ? (
              <Button variant='outline' onClick={clearFilter}>
                {t('devices.filter.clear')}
              </Button>
            ) : (
              create
            )}
          </Empty>
        )}
        {request.data && !request.error && (
          <p className='text-sm text-muted-foreground'>
            {t('devices.total', { count: request.data.meta.total })}
          </p>
        )}
      </PageContainer>
      <Outlet context={{ reload: request.reload }} />
    </>
  );
}
