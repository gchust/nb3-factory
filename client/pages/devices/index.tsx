import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  MonitorSmartphoneIcon,
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

import { DeviceStatusBadge } from './status-badge.js';
import {
  DEVICE_STATUSES,
  type Device,
  type DeviceList,
  type DeviceStatus,
  type DevicesOutletContext,
} from './types.js';

// The endpoint pages every list and caps a page at 100 records. This page sorts and paginates in the browser, so it
// asks for the largest page and says so when more records match (guideline T1.10).
const PAGE_SIZE = 100;

function isDeviceStatus(value: string | null): value is DeviceStatus {
  return DEVICE_STATUSES.some((status) => status === value);
}

/** The device ledger: every device, filtered by status, with the create and edit dialogs as child routes. */
export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();

  // The status filter lives in the URL (guideline T1.7), so a filtered list is a link someone can share and back
  // and forward restore. A Select has no input method to keep in step, so the parameters are read and written
  // directly. Everything else in the URL — nothing today, but the query string the dialogs carry — is left alone.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  // Treat an unrecognized value as no filter.
  const status = isDeviceStatus(statusParam) ? statusParam : undefined;

  function changeStatus(value: string | null | undefined): void {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'all') next.set('status', value);
    else next.delete('status');
    setSearchParams(next, { replace: true });
  }

  const hasFilters = status !== undefined;

  // Load the list. An effect must not call setState synchronously: store the result only in the request callbacks,
  // and derive "loading" from whether the result belongs to the current request. Each reload() call increments the
  // count, and the effect requests again.
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([status ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Device[];
    /** Whether this batch was fetched with a filter; tells "empty" apart from "no results". */
    readonly filtered?: boolean;
    readonly error?: unknown;
    /** The number of matching records on all pages; more than rows.length when the page cap cut the list. */
    readonly total?: number;
  }>();

  useEffect(() => {
    // Abort the request when the filter changes or the component unmounts, so an old result never overwrites a new one.
    const controller = new AbortController();
    const key = JSON.stringify([status ?? null, reloadCount]);
    api
      .request<DeviceList>({
        path: 'devices',
        query: { status, pageSize: PAGE_SIZE },
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
          // Keep the previous batch on failure: after "Retry", show the old data and a small Spinner, not the skeleton.
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, status, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  // While reloading, rows is still the previous batch.
  const rows = result?.rows;
  // Decide by the filter the displayed data was fetched with, not by the current one: right after "Clear filters" is
  // clicked, the screen still shows the old filtered result.
  const rowsFiltered = result?.filtered ?? false;

  // Keep the context passed to child routes stable; otherwise effects in child routes that depend on it run again and again.
  const outletContext = useMemo<DevicesOutletContext>(
    () => ({
      reload,
      // The list is all there is to refresh after a save or on finding the record gone.
      onSaved: () => reload(),
      onNotFound: reload,
    }),
    [reload],
  );

  // The collator follows the current language and is recreated when it switches.
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
        // The code identifies a device; it sits first and carries no link (there is no detail view).
        header: t('devices.fields.code'),
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
            {/* One non-destructive action on every row, so it is a plain ghost button rather than a "…" menu (guideline T1.5). */}
            <Button
              variant='ghost'
              size='icon-sm'
              nativeButton={false}
              aria-label={t('devices.actions.edit', {
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
            >
              <PencilIcon />
            </Button>
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
            <Button variant='outline' size='sm' onClick={reload}>
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
            <MonitorSmartphoneIcon />
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
              <Button
                variant='link'
                size='sm'
                onClick={() => changeStatus(undefined)}
              >
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
          <Button variant='ghost' onClick={() => changeStatus(undefined)}>
            {t('devices.filters.clear')}
          </Button>
        ) : null}
        {/* Reloading keeps the old data and shows only a small Spinner here. */}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      {/* The create dialog and a row's edit dialog render here and get the list's refresh functions from context. */}
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
          <Skeleton className='h-5 w-16 rounded-full' />
          <Skeleton className='ml-auto h-4 w-6' />
        </div>
      ))}
    </div>
  );
}
