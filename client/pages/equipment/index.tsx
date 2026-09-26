import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  ArchiveIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  PackageOpenIcon,
  PlusIcon,
  SearchIcon,
  TimerOffIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import { listEquipment } from './api.js';
import { EquipmentStatusBadge } from './status-badge.js';
import type { Equipment, EquipmentOutletContext } from './types.js';

type EquipmentFilter = 'all' | 'available' | 'borrowed' | 'overdue';

/** Matches the search box against the fields a user would look up a device by. */
function matchesSearch(equipment: Equipment, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return [equipment.assetCode, equipment.name, equipment.category ?? ''].some(
    (value) => value.toLowerCase().includes(needle),
  );
}

function matchesFilter(equipment: Equipment, filter: EquipmentFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'available':
      return equipment.status === 'available';
    case 'borrowed':
      // Both a running loan and an overdue one: everything currently out.
      return equipment.activeLoan !== null;
    case 'overdue':
      return equipment.status === 'overdue';
  }
}

/** Route `/equipment`: the equipment ledger with summary totals, search and status filter. */
export default function EquipmentPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();

  // A stable dispatch so the child routes can refresh the ledger without re-running their effects.
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = `equipment:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Equipment[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `equipment:${reloadCount}`;
    listEquipment(api, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) setResult({ key, rows });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<EquipmentFilter>('all');

  const dateTimeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }),
    [locale],
  );

  const stats = useMemo(() => {
    const all = rows ?? [];
    const borrowed = all.filter((item) => item.activeLoan !== null).length;
    const overdue = all.filter((item) => item.status === 'overdue').length;
    return { total: all.length, borrowed, overdue };
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      (rows ?? []).filter(
        (item) => matchesFilter(item, filter) && matchesSearch(item, search),
      ),
    [rows, filter, search],
  );

  const hasFilters = search.trim() !== '' || filter !== 'all';

  const columns = useMemo<ColumnDef<Equipment>[]>(
    () => [
      {
        accessorKey: 'assetCode',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.columns.assetCode')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium tabular-nums'>
            {row.original.assetCode}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.columns.name')}
          />
        ),
        cell: ({ row }) => row.original.name,
      },
      {
        accessorKey: 'category',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.columns.category')}
          />
        ),
        cell: ({ row }) =>
          row.original.category ? (
            row.original.category
          ) : (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.columns.status')}
          />
        ),
        cell: ({ row }) => (
          <EquipmentStatusBadge status={row.original.status} />
        ),
      },
      {
        id: 'currentLoan',
        header: t('equipment.columns.currentLoan'),
        enableSorting: false,
        cell: ({ row }) => {
          const loan = row.original.activeLoan;
          if (!loan) return <span className='text-muted-foreground'>—</span>;
          return (
            <div className='flex flex-col gap-0.5 text-sm'>
              <span className='font-medium'>{loan.borrower}</span>
              <span
                className={
                  loan.isOverdue ? 'text-destructive' : 'text-muted-foreground'
                }
              >
                {t('equipment.currentLoan.due', {
                  date: dateFormat.format(new Date(loan.expectedReturnAt)),
                })}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'notes',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.columns.notes')}
          />
        ),
        cell: ({ row }) =>
          row.original.notes ? (
            <span
              className='block max-w-[16rem] truncate'
              title={row.original.notes}
            >
              {row.original.notes}
            </span>
          ) : (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.columns.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {dateTimeFormat.format(new Date(row.original.createdAt))}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => {
          const equipment = row.original;
          return (
            <div className='flex justify-end gap-2'>
              {equipment.status === 'available' ? (
                <Button
                  variant='outline'
                  size='sm'
                  nativeButton={false}
                  render={
                    <Link
                      to={{
                        pathname: `${equipment.id}/borrow`,
                        search: location.search,
                      }}
                    />
                  }
                >
                  {t('equipment.actions.borrow')}
                </Button>
              ) : null}
              <Button
                variant='ghost'
                size='sm'
                nativeButton={false}
                render={
                  <Link
                    to={{
                      pathname: `${equipment.id}/edit`,
                      search: location.search,
                    }}
                  />
                }
              >
                {t('actions.edit')}
              </Button>
            </div>
          );
        },
      },
    ],
    [t, dateFormat, dateTimeFormat, location.search],
  );

  const outletContext = useMemo<EquipmentOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const clearFilters = (): void => {
    setSearch('');
    setFilter('all');
  };

  let content: ReactElement;
  const status = error instanceof ApiClientError ? error.status : undefined;
  if (error) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {status === 403
            ? t('equipment.error.forbidden')
            : t('equipment.error.requestFailed')}
        </AlertDescription>
        {status === 403 ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='space-y-3 rounded-lg border p-4'
      >
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className='h-9 w-full' />
        ))}
      </div>
    );
  } else if (rows.length === 0) {
    content = (
      <Empty className='rounded-lg border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <ArchiveIcon />
          </EmptyMedia>
          <EmptyTitle>{t('equipment.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('equipment.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('equipment.actions.create')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={filteredRows}
        getRowId={(row) => String(row.id)}
        emptyMessage={
          <div className='flex flex-col items-center gap-3 py-6'>
            <p className='text-sm text-muted-foreground'>
              {t('equipment.empty.filtered')}
            </p>
            {hasFilters ? (
              <Button variant='outline' size='sm' onClick={clearFilters}>
                {t('equipment.actions.clearFilters')}
              </Button>
            ) : null}
          </div>
        }
        toolbar={(table) => <DataTableViewOptions table={table} />}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('equipment.title')}
        description={t('equipment.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('equipment.actions.create')}
          </Button>
        }
      />

      <div className='grid gap-4 sm:grid-cols-3'>
        <StatCard
          label={t('equipment.stats.total')}
          value={stats.total}
          icon={<ArchiveIcon />}
        />
        <StatCard
          label={t('equipment.stats.borrowed')}
          value={stats.borrowed}
          icon={<ClipboardListIcon />}
        />
        <StatCard
          label={t('equipment.stats.overdue')}
          value={stats.overdue}
          tone={stats.overdue > 0 ? 'destructive' : 'default'}
          icon={<TimerOffIcon />}
        />
      </div>

      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='relative w-full sm:w-72'>
          <SearchIcon
            aria-hidden='true'
            className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('equipment.search.placeholder')}
            aria-label={t('equipment.search.label')}
            className='pl-8'
          />
        </div>
        <ToggleGroup
          variant='outline'
          size='sm'
          spacing={0}
          value={[filter]}
          onValueChange={(values: string[]) => {
            const [next] = values;
            if (next) setFilter(next as EquipmentFilter);
          }}
          aria-label={t('equipment.filter.label')}
        >
          <ToggleGroupItem value='all'>
            <PackageOpenIcon />
            {t('equipment.filter.all')}
            <span className='text-muted-foreground tabular-nums'>
              {stats.total}
            </span>
          </ToggleGroupItem>
          <ToggleGroupItem value='available'>
            <CheckCircle2Icon />
            {t('equipment.filter.available')}
          </ToggleGroupItem>
          <ToggleGroupItem value='borrowed'>
            <ClipboardListIcon />
            {t('equipment.filter.borrowed')}
          </ToggleGroupItem>
          <ToggleGroupItem value='overdue'>
            <TimerOffIcon />
            {t('equipment.filter.overdue')}
            {stats.overdue > 0 ? (
              <span className='text-destructive tabular-nums'>
                {stats.overdue}
              </span>
            ) : null}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {content}

      <Outlet context={outletContext} />
    </PageContainer>
  );
}
