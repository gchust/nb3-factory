import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  HardDriveIcon,
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

import { DataTable, DataTableColumnHeader } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';

import { DeviceStatusBadge } from './status-badge.js';
import {
  DEVICE_STATUSES,
  isDeviceStatus,
  type Device,
  type DeviceList,
  type DevicesOutletContext,
} from './types.js';

/**
 * The device ledger. Every signed-in user can open it, add a device and edit one; a device belongs to the office
 * rather than to the person who added it, so there is no per-record ownership.
 */
export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // The status filter lives in the URL, so a refresh, going back or a shared link keeps it.
  const statusParam = searchParams.get('status');
  // An unrecognized value means no filter.
  const status = isDeviceStatus(statusParam) ? statusParam : undefined;

  function changeStatus(value: string | null): void {
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        if (value && value !== 'all') params.set('status', value);
        else params.delete('status');
        return params;
      },
      { replace: true },
    );
  }

  // One request per filter change or reload. "Loading" is derived from whether the stored result belongs to the
  // current request, so nothing is set synchronously from the effect.
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([status ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Device[];
    /** Whether this batch was fetched with a filter; tells "no devices yet" apart from "none in this status". */
    readonly filtered?: boolean;
    readonly error?: unknown;
    readonly total?: number;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([status ?? null, reloadCount]);
    api
      .request<DeviceList>({
        path: 'devices',
        query: { status },
        signal: controller.signal,
      })
      .then(
        ({ data, meta }) => {
          if (!controller.signal.aborted) {
            setResult({
              key,
              rows: data,
              total: meta.total,
              filtered: status !== undefined,
            });
          }
        },
        (error: unknown) => {
          // Keep the previous rows on failure, so "Retry" shows data plus a Spinner rather than the skeleton.
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, status, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const rowsFiltered = result?.filtered ?? false;

  // The endpoint already returns the list in code order; the name column sorts in the current language's order, so
  // Chinese names sort as a Chinese reader expects rather than by character code.
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const columns = useMemo<ColumnDef<Device>[]>(
    () => [
      {
        accessorKey: 'code',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devices.fields.code')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'name',
        enableHiding: false,
        sortingFn: (a, b) => collator.compare(a.original.name, b.original.name),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devices.fields.name')}
          />
        ),
        // A device name is what someone typed, in whichever language they typed it; it is stored and shown as
        // written and is never translated. The tooltip only reveals a name the column cut off.
        cell: ({ row }) => {
          const name = row.original.name;
          return (
            <Tooltip
              onOpenChange={(open, details) => {
                const trigger = details.trigger;
                if (
                  open &&
                  trigger &&
                  trigger.scrollWidth <= trigger.clientWidth
                ) {
                  details.cancel();
                }
              }}
            >
              <TooltipTrigger
                render={<span className='block max-w-60 truncate' />}
              >
                {name}
              </TooltipTrigger>
              <TooltipContent>{name}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: 'status',
        header: t('devices.fields.status'),
        cell: ({ row }) => <DeviceStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'notes',
        header: t('devices.fields.notes'),
        // Notes are free text too, shown as written.
        cell: ({ row }) =>
          row.original.notes ? (
            <Tooltip
              onOpenChange={(open, details) => {
                const trigger = details.trigger;
                if (
                  open &&
                  trigger &&
                  trigger.scrollWidth <= trigger.clientWidth
                ) {
                  details.cancel();
                }
              }}
            >
              <TooltipTrigger
                render={<span className='block max-w-60 truncate' />}
              >
                {row.original.notes}
              </TooltipTrigger>
              <TooltipContent>{row.original.notes}</TooltipContent>
            </Tooltip>
          ) : (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('devices.actions.label')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            {/* Edit is the list's own child route, edit/:deviceId, so the dialog opens alone over the list. */}
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('devices.actions.editNamed', {
                name: row.original.name,
              })}
              render={
                <Link
                  to={{
                    pathname: `edit/${encodeURIComponent(row.original.id)}`,
                    search: location.search,
                  }}
                />
              }
              nativeButton={false}
            >
              <PencilIcon />
            </Button>
          </div>
        ),
      },
    ],
    [collator, location.search, t],
  );

  const statusItems = [
    { value: 'all', label: t('devices.filters.allStatuses') },
    ...DEVICE_STATUSES.map((value) => ({
      value,
      label:
        value === 'available'
          ? t('devices.status.available')
          : t('devices.status.borrowed'),
    })),
  ];

  // Keep the context passed to the child routes stable, so an effect in one of them does not run again on every render.
  const outletContext = useMemo<DevicesOutletContext>(
    () => ({ reload }),
    [reload],
  );

  // The four states, in the order "failed → first load → empty → rows or no results".
  let content: ReactElement;
  if (error) {
    // The page itself is open to every signed-in user, so the failure worth naming is the session being gone.
    const unauthorized =
      error instanceof ApiClientError && error.status === 401;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('devices.error.title')}</AlertTitle>
        <AlertDescription>
          {unauthorized
            ? t('devices.error.sessionExpired')
            : t('devices.error.requestFailed')}
        </AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={() => reload()}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (rows === undefined) {
    content = <TableSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0 && !rowsFiltered) {
    content = (
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <HardDriveIcon />
          </EmptyMedia>
          <EmptyTitle>{t('devices.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('devices.empty.description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* While the list is empty the create action is only here; the page header leaves it out. */}
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('devices.create.action')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        showSelectedCount={false}
        emptyMessage={
          <div className='flex flex-col items-center gap-2'>
            <span>{t('devices.empty.noResults')}</span>
            <Button
              variant='link'
              size='sm'
              onClick={() => changeStatus('all')}
            >
              {t('devices.filters.clear')}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('devices.title')}
        description={t('devices.description')}
        actions={
          // Decided from loaded data: no action while loading, and none while the empty state carries it.
          rows !== undefined && (rows.length > 0 || rowsFiltered) ? (
            <Button
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
              nativeButton={false}
            >
              <PlusIcon data-icon='inline-start' />
              {t('devices.create.action')}
            </Button>
          ) : null
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Select
          items={statusItems}
          value={status ?? 'all'}
          onValueChange={changeStatus}
        >
          <SelectTrigger
            className='w-full sm:w-40'
            aria-label={t('devices.filters.status')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
            <SelectGroup>
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {status !== undefined ? (
          <Button variant='ghost' onClick={() => changeStatus('all')}>
            {t('devices.filters.clear')}
          </Button>
        ) : null}
        {/* Reloading keeps the old rows on screen and shows only a small Spinner here. */}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      {/* The create dialog and a row's edit dialog render here and refresh the list through this context. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function TableSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div
      role='status'
      aria-label={label}
      className='overflow-hidden rounded-lg border'
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className='flex items-center gap-4 border-b px-4 py-3 last:border-b-0'
        >
          <Skeleton className='h-4 w-20' />
          <Skeleton className='h-4 w-40' />
          <Skeleton className='h-5 w-16 rounded-full' />
          <Skeleton className='ml-auto h-4 w-32' />
        </div>
      ))}
    </div>
  );
}
