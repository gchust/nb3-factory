import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
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
import { cn } from '@/lib/utils';

import { listBorrowRecords } from '../equipment/api.js';
import { ReturnLoanAction } from '../equipment/return-loan-action.js';
import { LoanStatusBadge } from '../equipment/status-badge.js';
import type {
  BorrowRecord,
  BorrowRecordsOutletContext,
} from '../equipment/types.js';

type LoanFilter = 'all' | 'active' | 'returned' | 'overdue';

function matchesFilter(record: BorrowRecord, filter: LoanFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'active':
      // Everything still out: a running loan and an overdue one.
      return record.returnedAt === null;
    case 'returned':
      return record.returnedAt !== null;
    case 'overdue':
      return record.status === 'overdue';
  }
}

/** Route `/borrow-records`: every loan, searchable by borrower and filterable by return state. */
export default function BorrowRecordsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = `borrow-records:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: BorrowRecord[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `borrow-records:${reloadCount}`;
    listBorrowRecords(api, controller.signal).then(
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
  const [filter, setFilter] = useState<LoanFilter>('all');

  const dateTimeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const stats = useMemo(() => {
    const all = rows ?? [];
    const active = all.filter((record) => record.returnedAt === null).length;
    const overdue = all.filter((record) => record.status === 'overdue').length;
    return { total: all.length, active, overdue };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (rows ?? []).filter(
      (record) =>
        matchesFilter(record, filter) &&
        (!needle ||
          record.borrower.toLowerCase().includes(needle) ||
          (record.equipment?.name ?? '').toLowerCase().includes(needle) ||
          (record.equipment?.assetCode ?? '').toLowerCase().includes(needle)),
    );
  }, [rows, filter, search]);

  const hasFilters = search.trim() !== '' || filter !== 'all';

  const columns = useMemo<ColumnDef<BorrowRecord>[]>(
    () => [
      {
        id: 'equipment',
        accessorFn: (record) => record.equipment?.assetCode ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('borrowRecords.columns.equipment')}
          />
        ),
        cell: ({ row }) => {
          const equipment = row.original.equipment;
          if (!equipment) {
            return <span className='text-muted-foreground'>—</span>;
          }
          return (
            <div className='flex flex-col gap-0.5'>
              <span className='font-medium tabular-nums'>
                {equipment.assetCode}
              </span>
              <span className='text-sm text-muted-foreground'>
                {equipment.name}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'borrower',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('borrowRecords.columns.borrower')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.borrower}</span>
        ),
      },
      {
        accessorKey: 'purpose',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('borrowRecords.columns.purpose')}
          />
        ),
        cell: ({ row }) =>
          row.original.purpose ? (
            <span
              className='block max-w-[16rem] truncate'
              title={row.original.purpose}
            >
              {row.original.purpose}
            </span>
          ) : (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'borrowedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('borrowRecords.columns.borrowedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {dateTimeFormat.format(new Date(row.original.borrowedAt))}
          </span>
        ),
      },
      {
        accessorKey: 'expectedReturnAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('borrowRecords.columns.expectedReturnAt')}
          />
        ),
        cell: ({ row }) => (
          <span
            className={cn(
              row.original.status === 'overdue'
                ? 'font-medium text-destructive'
                : 'text-muted-foreground',
            )}
          >
            {dateTimeFormat.format(new Date(row.original.expectedReturnAt))}
          </span>
        ),
      },
      {
        accessorKey: 'returnedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('borrowRecords.columns.returnedAt')}
          />
        ),
        cell: ({ row }) =>
          row.original.returnedAt ? (
            <span className='text-muted-foreground'>
              {dateTimeFormat.format(new Date(row.original.returnedAt))}
            </span>
          ) : (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        id: 'status',
        accessorFn: (record) => record.status,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('borrowRecords.columns.status')}
          />
        ),
        cell: ({ row }) => <LoanStatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) =>
          row.original.returnedAt === null ? (
            <div className='flex justify-end'>
              <ReturnLoanAction
                record={row.original}
                onReturned={(saved) => {
                  setResult((current) =>
                    current?.rows
                      ? {
                          ...current,
                          rows: current.rows.map((item) =>
                            item.id === saved.id ? saved : item,
                          ),
                        }
                      : current,
                  );
                  reload();
                }}
              />
            </div>
          ) : (
            <span className='block text-right text-muted-foreground'>
              {t('borrowRecords.actions.returned')}
            </span>
          ),
      },
    ],
    [t, dateTimeFormat, reload],
  );

  const outletContext = useMemo<BorrowRecordsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  let content: ReactElement;
  const status = error instanceof ApiClientError ? error.status : undefined;
  if (error) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {status === 403
            ? t('borrowRecords.error.forbidden')
            : t('borrowRecords.error.requestFailed')}
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
            <ClipboardListIcon />
          </EmptyMedia>
          <EmptyTitle>{t('borrowRecords.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('borrowRecords.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('borrowRecords.actions.new')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={filteredRows}
        getRowId={(record) => String(record.id)}
        emptyMessage={
          <div className='flex flex-col items-center gap-3 py-6'>
            <p className='text-sm text-muted-foreground'>
              {t('borrowRecords.empty.filtered')}
            </p>
            {hasFilters ? (
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  setSearch('');
                  setFilter('all');
                }}
              >
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
        title={t('borrowRecords.title')}
        description={t('borrowRecords.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('borrowRecords.actions.new')}
          </Button>
        }
      />

      <div className='grid gap-4 sm:grid-cols-3'>
        <StatCard
          label={t('borrowRecords.stats.total')}
          value={stats.total}
          icon={<ClipboardListIcon />}
        />
        <StatCard
          label={t('borrowRecords.stats.active')}
          value={stats.active}
          icon={<PackageOpenIcon />}
        />
        <StatCard
          label={t('borrowRecords.stats.overdue')}
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
            placeholder={t('borrowRecords.search.placeholder')}
            aria-label={t('borrowRecords.search.label')}
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
            if (next) setFilter(next as LoanFilter);
          }}
          aria-label={t('borrowRecords.filter.label')}
        >
          <ToggleGroupItem value='all'>
            {t('borrowRecords.filter.all')}
          </ToggleGroupItem>
          <ToggleGroupItem value='active'>
            {t('borrowRecords.filter.active')}
          </ToggleGroupItem>
          <ToggleGroupItem value='overdue'>
            {t('borrowRecords.filter.overdue')}
          </ToggleGroupItem>
          <ToggleGroupItem value='returned'>
            {t('borrowRecords.filter.returned')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {content}

      <Outlet context={outletContext} />
    </PageContainer>
  );
}
