import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutlet,
  useSearchParams,
} from 'react-router';

import { DataTable } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
  type Device,
  type DeviceList,
  type DeviceStatus,
  type DevicesOutletContext,
} from './types.js';

const PAGE_SIZE = 20;
const ALL_STATUSES = 'all';

interface ListState {
  readonly list?: DeviceList;
  readonly loading: boolean;
  readonly error?: unknown;
}

type ListAction =
  | { readonly type: 'load' }
  | { readonly type: 'loaded'; readonly list: DeviceList }
  | { readonly type: 'failed'; readonly error: unknown };

function listReducer(state: ListState, action: ListAction): ListState {
  switch (action.type) {
    case 'load':
      return { ...state, loading: true, error: undefined };
    case 'loaded':
      return { list: action.list, loading: false };
    case 'failed':
      return { list: undefined, loading: false, error: action.error };
  }
}

function isDeviceStatus(value: string | null): value is DeviceStatus {
  return DEVICE_STATUSES.some((status) => status === value);
}

export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const outlet = useOutlet();

  const [searchParams, setSearchParams] = useSearchParams();
  const rawStatus = searchParams.get('status');
  const status = isDeviceStatus(rawStatus) ? rawStatus : undefined;
  const requestedPage = Number(searchParams.get('page') ?? '1');
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

  const [state, dispatch] = useReducer(listReducer, { loading: true });
  // Bumping this refetches without changing the filter or the page.
  const [reloadCount, setReloadCount] = useReducer(
    (count: number) => count + 1,
    0,
  );
  const reload = useCallback(() => setReloadCount(), []);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (status) query.set('status', status);

    dispatch({ type: 'load' });
    api
      .request<DeviceList>({
        path: `devices?${query.toString()}`,
        signal: controller.signal,
      })
      .then(
        (list) => {
          if (!controller.signal.aborted) dispatch({ type: 'loaded', list });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            dispatch({ type: 'failed', error });
          }
        },
      );
    return () => controller.abort();
  }, [api, page, reloadCount, status]);

  function setFilter(next: DeviceStatus | undefined): void {
    const nextParams = new URLSearchParams(searchParams);
    if (next) nextParams.set('status', next);
    else nextParams.delete('status');
    // A filter change starts again from the first page.
    nextParams.delete('page');
    setSearchParams(nextParams, { replace: true });
  }

  function setPage(next: number): void {
    const nextParams = new URLSearchParams(searchParams);
    if (next <= 1) nextParams.delete('page');
    else nextParams.set('page', String(next));
    setSearchParams(nextParams, { replace: true });
  }

  const columns = useMemo<ColumnDef<Device>[]>(
    () => [
      {
        accessorKey: 'code',
        header: () => t('devices.fields.code'),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: () => t('devices.fields.name'),
      },
      {
        accessorKey: 'status',
        header: () => t('devices.fields.status'),
        cell: ({ row }) => <DeviceStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'notes',
        header: () => t('devices.fields.notes'),
        cell: ({ row }) => (
          <span className='block max-w-[24rem] truncate'>
            {row.original.notes ?? t('devices.list.noNotes')}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => (
          <span className='sr-only'>{t('devices.fields.actions')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('devices.actionsFor', {
                      name: row.original.name,
                    })}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-auto min-w-36'>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    render={
                      <Link
                        to={{
                          pathname: encodeURIComponent(row.original.id),
                          search: location.search,
                        }}
                      />
                    }
                  >
                    <PencilIcon />
                    {t('actions.edit')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [location.search, t],
  );

  // TanStack Table returns a mutable instance the React Compiler cannot memoize safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: state.list?.data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const list = state.list;
  const statusItems = [
    { value: ALL_STATUSES, label: t('devices.filters.allStatuses') },
    ...DEVICE_STATUSES.map((value) => ({
      value,
      label: t(`devices.status.${value}`),
    })),
  ];
  const total = list?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total);

  const errorStatus =
    state.error instanceof ApiClientError ? state.error.status : undefined;

  let content: ReactElement;
  if (state.loading) {
    content = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-3'
      >
        <Skeleton className='h-10 w-full' />
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className='h-12 w-full' />
        ))}
      </div>
    );
  } else if (errorStatus === 401) {
    content = <SessionExpiredAlert />;
  } else if (state.error) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('devices.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!list || list.data.length === 0) {
    content = (
      <Empty className='rounded-lg border border-dashed border-border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <SlidersHorizontalIcon />
          </EmptyMedia>
          <EmptyTitle>
            {status
              ? t('devices.empty.filteredTitle')
              : t('devices.empty.title')}
          </EmptyTitle>
          <EmptyDescription>
            {status
              ? t('devices.empty.filteredDescription')
              : t('devices.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {status ? (
            <Button variant='outline' onClick={() => setFilter(undefined)}>
              {t('devices.filters.clear')}
            </Button>
          ) : (
            <Button
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
              nativeButton={false}
            >
              <PlusIcon data-icon='inline-start' />
              {t('devices.create.action')}
            </Button>
          )}
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <>
        <DataTable table={table} />
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p className='text-sm text-muted-foreground'>
            {t('devices.list.range', { first, last, total })}
          </p>
          {totalPages > 1 ? (
            <div className='flex items-center gap-2'>
              <span className='text-sm text-muted-foreground'>
                {t('devices.list.page', { page, totalPages })}
              </span>
              <Button
                variant='outline'
                size='icon-sm'
                aria-label={t('devices.list.previous')}
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant='outline'
                size='icon-sm'
                aria-label={t('devices.list.next')}
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          ) : null}
        </div>
      </>
    );
  }

  // While a child route is open, mark the page behind it inert. It stays readable and hidden from assistive
  // technology, and the user comes back to it when the dialog closes.
  return (
    <>
      <PageContainer inert={outlet ? true : undefined}>
        <PageHeader
          title={t('devices.title')}
          description={t('devices.description')}
          actions={
            // While the list is empty, the empty state carries the only primary action.
            list && (list.data.length > 0 || status !== undefined) ? (
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
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium'>
              {t('devices.fields.status')}
            </span>
            <Select
              items={statusItems}
              value={status ?? ALL_STATUSES}
              onValueChange={(value) => {
                if (!value) return;
                setFilter(isDeviceStatus(value) ? value : undefined);
              }}
            >
              <SelectTrigger
                className='w-40'
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
          </div>
          {list ? (
            <p className='text-sm text-muted-foreground'>
              {t('devices.list.total', { total: list.meta.total })}
            </p>
          ) : null}
        </div>
        {content}
      </PageContainer>
      {/* The create and edit dialogs render here, over the list. */}
      <Outlet context={{ reload } satisfies DevicesOutletContext} />
    </>
  );
}
