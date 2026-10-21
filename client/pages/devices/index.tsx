import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { LaptopIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { DataTable } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
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
import { Skeleton } from '#components/ui/skeleton';

import { DeviceErrorAlert } from './device-error.js';
import {
  DEVICE_STATUSES,
  isDeviceStatus,
  type Device,
  type DeviceListResponse,
  type DeviceOutletContext,
  type DeviceStatus,
} from './types.js';

const ALL_STATUSES = 'all';

function statusTone(status: DeviceStatus): 'success' | 'warning' {
  return status === 'available' ? 'success' : 'warning';
}

export function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [status, setStatus] = useState<DeviceStatus>();
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loaded, setLoaded] = useState<{
    readonly key: string;
    readonly devices?: readonly Device[];
    readonly total: number;
    readonly error?: unknown;
  }>();
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = `${status ?? ALL_STATUSES}:${pageIndex}:${pageSize}:${reloadToken}`;

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void api
      .request<DeviceListResponse>({
        path: 'devices',
        query: {
          page: pageIndex + 1,
          pageSize,
          ...(status ? { status } : {}),
        },
        signal: controller.signal,
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        setLoaded({
          key: requestKey,
          devices: response.data,
          total: response.meta.total,
        });
      })
      .catch((next: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({ key: requestKey, total: 0, error: next });
      });

    return () => controller.abort();
  }, [api, pageIndex, pageSize, requestKey, status]);

  const current = loaded?.key === requestKey ? loaded : undefined;
  const devices = current?.devices ?? loaded?.devices;
  const total = current?.total ?? loaded?.total ?? 0;
  const loading = current === undefined;
  const error = current?.error;

  const columns: ColumnDef<Device>[] = [
    {
      accessorKey: 'code',
      header: t('devices.fields.code'),
      cell: ({ row }) => (
        <span className='font-mono text-xs'>{row.original.code}</span>
      ),
    },
    {
      accessorKey: 'name',
      header: t('devices.fields.name'),
      cell: ({ row }) => (
        <span className='font-medium'>{row.original.name}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('devices.fields.status'),
      cell: ({ row }) => (
        <StatusBadge tone={statusTone(row.original.status)}>
          {t(`devices.status.${row.original.status}`)}
        </StatusBadge>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      header: () => (
        <span className='sr-only'>{t('devices.fields.actions')}</span>
      ),
      cell: ({ row }) => (
        <div className='flex justify-end'>
          <Button
            variant='ghost'
            size='icon-sm'
            nativeButton={false}
            aria-label={t('devices.edit.actionFor', {
              name: row.original.name,
            })}
            render={<Link to={`${row.original.id}/edit`} />}
          >
            <PencilIcon />
          </Button>
        </div>
      ),
    },
  ];

  const statusOptions = [
    { value: ALL_STATUSES, label: t('devices.filters.allStatuses') },
    ...DEVICE_STATUSES.map((value) => ({
      value,
      label: t(`devices.status.${value}`),
    })),
  ];

  const filter = (
    <Select
      value={status ?? ALL_STATUSES}
      items={statusOptions}
      onValueChange={(value) => {
        setStatus(value !== null && isDeviceStatus(value) ? value : undefined);
        setPageIndex(0);
      }}
    >
      <SelectTrigger
        aria-label={t('devices.filters.status')}
        className='w-full sm:w-44'
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_STATUSES}>
          {t('devices.filters.allStatuses')}
        </SelectItem>
        {DEVICE_STATUSES.map((value) => (
          <SelectItem key={value} value={value}>
            {t(`devices.status.${value}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const addButton = (
    <Button nativeButton={false} render={<Link to='create' />}>
      <PlusIcon />
      {t('devices.create.action')}
    </Button>
  );

  const showInitialLoading = loading && devices === undefined && !error;
  const emptyLedger =
    !error &&
    devices !== undefined &&
    devices.length === 0 &&
    status === undefined;

  return (
    <PageContainer>
      <PageHeader
        title={t('devices.title')}
        description={t('devices.description')}
        actions={addButton}
      />

      {error ? <DeviceErrorAlert error={error} retry={reload} /> : null}

      {showInitialLoading ? (
        <div
          role='status'
          aria-label={t('devices.loading')}
          className='flex flex-col gap-3'
        >
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-16 w-full' />
          <Skeleton className='h-16 w-full' />
        </div>
      ) : emptyLedger ? (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <LaptopIcon />
            </EmptyMedia>
            <EmptyTitle>{t('devices.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {t('devices.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{addButton}</EmptyContent>
        </Empty>
      ) : devices !== undefined ? (
        <DataTable
          columns={columns}
          data={devices}
          loading={loading}
          manualPagination
          rowCount={total}
          paginationState={{ pageIndex, pageSize }}
          onPaginationChange={(updater) => {
            const next =
              typeof updater === 'function'
                ? updater({ pageIndex, pageSize })
                : updater;
            setPageIndex(next.pageIndex);
            setPageSize(next.pageSize);
          }}
          pageSizeOptions={[10, 20, 50]}
          showSelectedCount={false}
          toolbar={() => filter}
          emptyMessage={
            <div className='flex flex-col items-center gap-2'>
              <span>{t('devices.empty.filtered')}</span>
              <Button variant='link' onClick={() => setStatus(undefined)}>
                {t('devices.filters.clear')}
              </Button>
            </div>
          }
        />
      ) : null}

      <Outlet context={{ reload } satisfies DeviceOutletContext} />
    </PageContainer>
  );
}

export default DevicesPage;
