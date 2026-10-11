import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  LaptopIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '#components/data-table';
import { DataTableColumnHeader } from '#components/data-table/column-header';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#components/ui/input-group';
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
import { useUrlSearch } from '#hooks/use-url-search';

import { DeviceStatusBadge } from './status-badge.js';
import {
  DEVICE_STATUSES,
  isDeviceStatus,
  type Device,
  type DeviceList,
  type DevicesOutletContext,
} from './types.js';

// The endpoint pages every list and caps a page at 100 records. This page sorts and paginates in the browser, so it
// asks for the largest page and says so when more records match (guideline T1.10). A list that outgrows it uses the
// server-paginated table instead.
const PAGE_SIZE = 100;

export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  // The search term lives in the URL behind a search box that keeps its own text (url-search.md): typing, input
  // methods, back and forward all stay in step. The status filter is read from the same parameters.
  const { searchParams, search, text, inputProps, updateParams, clear } =
    useUrlSearch();
  const statusParam = searchParams.get('status');
  // Treat an unrecognized value as no filter.
  const status = isDeviceStatus(statusParam) ? statusParam : undefined;

  function changeStatus(value: string | null): void {
    updateParams((params) => {
      if (value && value !== 'all') params.set('status', value);
      else params.delete('status');
    });
  }

  // Decide by the input's text, so "Clear filters" appears as soon as the first character is typed.
  const hasFilters = text.trim() !== '' || status !== undefined;

  function clearFilters(): void {
    clear((params) => params.delete('status'));
    // The "Clear filters" button disappears along with the filters; move focus to the search box (guideline A6).
    searchRef.current?.focus();
  }

  // Load the list. An effect must not call setState synchronously: store the result only in the request callbacks,
  // and derive "loading" from whether the result belongs to the current request. Each reload() call increments the
  // count, and the effect requests again.
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([search, status ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Device[];
    /** Whether this batch was fetched with filters; tells "empty" apart from "no results". */
    readonly filtered?: boolean;
    readonly error?: unknown;
    /** The number of matching records on all pages; more than rows.length when the page cap cut the list. */
    readonly total?: number;
  }>();

  useEffect(() => {
    // Abort the request when the filters change or the component unmounts, so an old result never overwrites a new one.
    const controller = new AbortController();
    const key = JSON.stringify([search, status ?? null, reloadCount]);
    api
      .request<DeviceList>({
        path: 'devices',
        query: { q: search || undefined, status, pageSize: PAGE_SIZE },
        signal: controller.signal,
      })
      .then(
        ({ data, meta }) => {
          if (!controller.signal.aborted) {
            setResult({
              key,
              rows: [...data],
              total: meta.total,
              filtered: search !== '' || status !== undefined,
            });
          }
        },
        (error: unknown) => {
          // Keep the previous batch on failure: after "Retry", show the old data and a small Spinner, not the skeleton.
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, search, status, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  // While reloading, rows is still the previous batch.
  const rows = result?.rows;
  // Decide by the filters the displayed data was fetched with, not by the current filters: right after "Clear filters"
  // is clicked, the screen still shows the old filtered result.
  const rowsFiltered = result?.filtered ?? false;

  // Keep the context passed to child routes stable; otherwise effects in child routes that depend on it run again and again.
  const outletContext = useMemo<DevicesOutletContext>(
    () => ({ reload }),
    [reload],
  );

  // The collator follows the current language and is recreated when it switches, so Chinese names sort by pinyin.
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const statusItems = [
    { value: 'all', label: t('devices.filters.allStatuses') },
    ...DEVICE_STATUSES.map((value) => ({
      value,
      label: t(`devices.status.${value}`),
    })),
  ];

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
        // The default sort compares character codes, so Chinese does not sort by pinyin; use the current language's collation.
        sortingFn: (a, b) => collator.compare(a.original.name, b.original.name),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devices.fields.name')}
          />
        ),
        cell: ({ row }) => row.original.name,
      },
      {
        accessorKey: 'status',
        enableHiding: false,
        header: t('devices.fields.status'),
        cell: ({ row }) => <DeviceStatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('devices.actions.label')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('devices.actions.more', {
                      name: row.original.name,
                    })}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuGroup>
                  {/* Edit is the list's own child route, edit/:deviceId: the menu item is a link, and the dialog opens alone over the list. */}
                  <DropdownMenuItem
                    render={
                      <Link
                        to={{
                          pathname: `edit/${encodeURIComponent(row.original.id)}`,
                          search: location.search,
                        }}
                      />
                    }
                  >
                    <PencilIcon />
                    {t('devices.actions.edit')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [collator, location.search, t],
  );

  // Check in the order "failed → first load → empty → data or no results".
  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    // The session ended; signing in again is the only way forward (guideline S4).
    content = <SessionExpiredAlert />;
  } else if (error) {
    // Retrying cannot succeed without permission, so offer no "Retry" (guideline S4).
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('devices.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('devices.error.forbidden')
            : t('devices.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                reload();
                // This button disappears after a retry; move focus to the search box (guideline A6).
                searchRef.current?.focus();
              }}
            >
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = <TableSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0 && !rowsFiltered) {
    content = (
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <LaptopIcon />
          </EmptyMedia>
          <EmptyTitle>{t('devices.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('devices.empty.description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* While the list is empty the primary action is only here; the page header leaves it out (guideline L7). */}
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
    const capped = (result?.total ?? 0) > rows.length;
    content = (
      <>
        {/* Information, not an error (guideline A8): a plain paragraph, not an alert. */}
        {capped ? (
          <p className='text-sm text-muted-foreground'>
            {t('devices.capNotice', { count: rows.length })}
          </p>
        ) : null}
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          // No row selection on this page, so no "0 of N row(s) selected" summary.
          showSelectedCount={false}
          emptyMessage={
            <div className='flex flex-col items-center gap-2'>
              <span>{t('devices.empty.noResults')}</span>
              <Button variant='link' size='sm' onClick={clearFilters}>
                {t('devices.filters.clear')}
              </Button>
            </div>
          }
        />
      </>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('devices.title')}
        description={t('devices.description')}
        actions={
          // Decided from loaded data: no action while loading, and none while the empty state carries it (guideline L7).
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
        <InputGroup className='w-full sm:max-w-xs'>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            {...inputProps}
            placeholder={t('devices.search.placeholder')}
            aria-label={t('devices.search.label')}
          />
        </InputGroup>
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
        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
            {t('devices.filters.clear')}
          </Button>
        ) : null}
        {/* Reloading keeps the old data and shows only a small Spinner here. */}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      {/* The create and edit dialogs render here and get the list's refresh function from context. */}
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
          <Skeleton className='h-4 w-24' />
          <Skeleton className='h-4 w-40' />
          <Skeleton className='ml-auto h-5 w-16 rounded-full' />
        </div>
      ))}
    </div>
  );
}
