import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  LaptopIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import { DataTable } from '#components/data-table';
import { DataTableColumnHeader } from '#components/data-table/column-header';
import { DataTableViewOptions } from '#components/data-table/view-options';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';

import { DeviceStatusBadge } from './status-badge.js';
import {
  DEVICE_STATUSES,
  isDeviceStatus,
  type Device,
  type DevicesOutletContext,
} from './types.js';

// The endpoint returns the whole list and this page sorts and paginates in the browser, so it asks for one large page.
const PAGE_SIZE = 100;

/** The all-statuses option, kept out of `DEVICE_STATUSES` because it is a filter value, not a device state. */
const ALL_STATUSES = 'all';

export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // The status filter lives in the URL, so it survives a refresh and is restored by back and forward.
  const statusParam = searchParams.get('status');
  const status = isDeviceStatus(statusParam) ? statusParam : undefined;
  const hasFilters = status !== undefined;

  function changeStatus(value: string | null): void {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value && value !== ALL_STATUSES) next.set('status', value);
        else next.delete('status');
        return next;
      },
      { replace: true },
    );
  }

  // Load the list. The effect stores results only in the request callbacks; "loading" is derived by comparing the
  // result's key with the current request, so an old response never overwrites a newer one.
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([status ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Device[];
    /** Whether the displayed batch was fetched with a filter; tells "empty" apart from "no results". */
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([status ?? null, reloadCount]);
    api
      .request<{ data: Device[] }>({
        path: 'devices',
        query: { status },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setResult({ key, rows: data, filtered: status !== undefined });
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, status, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const errorStatus =
    error instanceof ApiClientError ? error.status : undefined;
  const rows = result?.rows;
  const rowsFiltered = result?.filtered ?? false;

  const columns = useMemo<ColumnDef<Device>[]>(
    () => [
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devices.fields.code')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.getValue<string>('code')}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devices.fields.name')}
          />
        ),
      },
      {
        accessorKey: 'status',
        enableSorting: false,
        header: () => t('devices.fields.status'),
        cell: ({ row }) => <DeviceStatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('devices.actions.label')}</span>
        ),
        cell: ({ row }) => <DeviceRowActions device={row.original} />,
      },
    ],
    [t],
  );

  const columnLabels: Record<string, string> = {
    code: t('devices.fields.code'),
    name: t('devices.fields.name'),
    status: t('devices.fields.status'),
  };

  // Keep the context stable, or child routes' effects depending on it run again and again.
  const outletContext = useMemo<DevicesOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const addButton = (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'new', search: location.search }} />}
    >
      <PlusIcon data-icon='inline-start' />
      {t('devices.add')}
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('devices.title')}
        description={t('devices.description')}
        actions={addButton}
      />

      {errorStatus === 401 ? (
        <SessionExpiredAlert />
      ) : error ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>{t('devices.errors.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={() => reload()}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : loading && rows === undefined ? (
        <TableSkeleton />
      ) : rows && rows.length === 0 && !rowsFiltered ? (
        <Empty>
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
      ) : (
        <DataTable
          columns={columns}
          data={rows ?? []}
          getRowId={(row) => row.id}
          pageSize={PAGE_SIZE}
          pageSizeOptions={[PAGE_SIZE]}
          showSelectedCount={false}
          emptyMessage={t('devices.noResults')}
          toolbar={(table) => (
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex flex-wrap items-center gap-2'>
                <Select
                  items={[
                    { value: ALL_STATUSES, label: t('devices.filter.all') },
                    ...DEVICE_STATUSES.map((value) => ({
                      value,
                      label: t(`devices.status.${value}`),
                    })),
                  ]}
                  value={status ?? ALL_STATUSES}
                  onValueChange={(value: string | null) => changeStatus(value)}
                >
                  <SelectTrigger
                    size='sm'
                    className='w-[160px]'
                    aria-label={t('devices.filter.label')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={ALL_STATUSES}>
                        {t('devices.filter.all')}
                      </SelectItem>
                      {DEVICE_STATUSES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`devices.status.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {hasFilters ? (
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => changeStatus(ALL_STATUSES)}
                  >
                    {t('devices.filter.clear')}
                  </Button>
                ) : null}
              </div>
              <DataTableViewOptions
                table={table}
                getColumnLabel={(column) =>
                  columnLabels[column.id] ?? column.id
                }
              />
            </div>
          )}
        />
      )}

      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function DeviceRowActions({
  device,
}: {
  readonly device: Device;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <div className='flex justify-end'>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('devices.actions.more', { name: device.name })}
            />
          }
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            render={
              <Link
                to={{
                  pathname: `edit/${device.id}`,
                  search: location.search,
                }}
              />
            }
          >
            <PencilIcon />
            {t('devices.actions.edit')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function TableSkeleton(): ReactElement {
  return (
    <div className='space-y-3'>
      <Skeleton className='h-8 w-full' />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className='h-10 w-full' />
      ))}
    </div>
  );
}
