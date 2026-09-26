import { useApiClient, ApiClientError } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  LaptopIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Undo2Icon,
  ArrowUpRightIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { fetchEquipmentList } from './api.js';
import { ReturnLoanDialog } from './return-loan-dialog.js';
import { DateValue, EquipmentStatusBadge, StatCard } from './shared.js';
import type {
  Equipment,
  EquipmentOutletContext,
  EquipmentStatus,
} from './types.js';

const EQUIPMENT_STATUSES: readonly EquipmentStatus[] = [
  'available',
  'borrowed',
];

function isEquipmentStatus(value: string | null): value is EquipmentStatus {
  return EQUIPMENT_STATUSES.some((status) => status === value);
}

/**
 * Equipment ledger: every device with its availability, who holds it and when
 * it is due back, plus the three totals the team watches. Adding, editing and
 * borrowing are child-route dialogs rendered in the `<Outlet />` below.
 */
export default function EquipmentPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  // The search term and status filter live in the URL, so a refresh restores them.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('q') ?? '';
  const statusParam = searchParams.get('status');
  const status = isEquipmentStatus(statusParam) ? statusParam : undefined;

  const paramsRef = useRef(searchParams);
  useEffect(() => {
    paramsRef.current = searchParams;
  }, [searchParams]);
  function updateParams(mutate: (params: URLSearchParams) => void): void {
    const next = new URLSearchParams(paramsRef.current);
    mutate(next);
    paramsRef.current = next;
    setSearchParams(next, { replace: true });
  }

  const [text, setText] = useState(urlSearch);
  const [ownSearch, setOwnSearch] = useState(urlSearch);
  const [seenSearch, setSeenSearch] = useState(urlSearch);
  if (urlSearch !== seenSearch) {
    setSeenSearch(urlSearch);
    if (urlSearch !== ownSearch) {
      setOwnSearch(urlSearch);
      setText(urlSearch);
    }
  }
  const searchTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(searchTimerRef.current), []);

  function scheduleSearch(value: string): void {
    window.clearTimeout(searchTimerRef.current);
    const addressSearch = (): string =>
      new URLSearchParams(window.location.search).get('q') ?? '';
    const startSearch = paramsRef.current.get('q') ?? '';
    const startAddress = addressSearch();
    searchTimerRef.current = window.setTimeout(() => {
      if (
        (paramsRef.current.get('q') ?? '') !== startSearch ||
        addressSearch() !== startAddress
      ) {
        return;
      }
      setOwnSearch(value);
      updateParams((params) => {
        if (value) params.set('q', value);
        else params.delete('q');
      });
    }, 300);
  }

  function changeStatus(value: string | null): void {
    updateParams((params) => {
      if (value && value !== 'all') params.set('status', value);
      else params.delete('status');
    });
  }

  const hasFilters = text.trim() !== '' || status !== undefined;

  function clearFilters(): void {
    window.clearTimeout(searchTimerRef.current);
    setText('');
    setOwnSearch('');
    updateParams((params) => {
      params.delete('q');
      params.delete('status');
    });
    searchRef.current?.focus();
  }

  const search = urlSearch.trim();
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([search, status ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly items?: Equipment[];
    readonly stats?: { total: number; borrowed: number; overdue: number };
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([search, status ?? null, reloadCount]);
    fetchEquipmentList(
      api,
      { keyword: search || undefined, status },
      controller.signal,
    ).then(
      (response) => {
        if (!controller.signal.aborted) {
          setResult({
            key,
            items: response.items,
            stats: response.stats,
            filtered: search !== '' || status !== undefined,
          });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult((previous) => ({ ...previous, key, error }));
        }
      },
    );
    return () => controller.abort();
  }, [api, search, status, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.items;
  const stats = result?.stats;
  const rowsFiltered = result?.filtered ?? false;

  const focusSearchAfterReloadRef = useRef(false);
  useEffect(() => {
    if (loading || !focusSearchAfterReloadRef.current) return;
    focusSearchAfterReloadRef.current = false;
    searchRef.current?.focus();
  }, [loading]);

  const outletContext = useMemo<EquipmentOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const [returning, setReturning] = useState<{
    readonly open: boolean;
    readonly loanId: number | null;
    readonly description: string;
  }>({ open: false, loanId: null, description: '' });

  const statusItems = [
    { value: 'all', label: t('equipment.filters.allStatuses') },
    ...EQUIPMENT_STATUSES.map((value) => ({
      value,
      label: t(`equipment.status.${value}`),
    })),
  ];

  const columns = useMemo<ColumnDef<Equipment>[]>(
    () => [
      {
        accessorKey: 'assetNo',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.fields.assetNo')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium tabular-nums'>
            {row.original.assetNo}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        enableHiding: false,
        sortingFn: (a, b) => collator.compare(a.original.name, b.original.name),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.fields.name')}
          />
        ),
        cell: ({ row }) => row.original.name,
      },
      {
        accessorKey: 'category',
        header: t('equipment.fields.category'),
        cell: ({ row }) =>
          row.original.category || (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'status',
        header: t('equipment.fields.status'),
        cell: ({ row }) => (
          <div className='flex items-center gap-2'>
            <EquipmentStatusBadge status={row.original.status} />
            {row.original.overdue ? (
              <span className='text-xs font-medium text-destructive'>
                {t('equipment.overdue')}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'currentBorrower',
        header: t('equipment.fields.currentBorrower'),
        cell: ({ row }) =>
          row.original.currentBorrower ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'expectedReturnAt',
        header: t('equipment.fields.expectedReturnAt'),
        cell: ({ row }) => (
          <span className='whitespace-nowrap'>
            <DateValue value={row.original.expectedReturnAt} />
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('equipment.actions.label')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end gap-2'>
            <Button
              variant='outline'
              size='sm'
              render={
                <Link
                  to={{
                    pathname: `${row.original.id}/edit`,
                    search: location.search,
                  }}
                />
              }
              nativeButton={false}
            >
              <PencilIcon data-icon='inline-start' />
              {t('equipment.actions.edit')}
            </Button>
            {row.original.status === 'available' ? (
              <Button
                size='sm'
                render={
                  <Link
                    to={{
                      pathname: `${row.original.id}/borrow`,
                      search: location.search,
                    }}
                  />
                }
                nativeButton={false}
              >
                <ArrowUpRightIcon data-icon='inline-start' />
                {t('equipment.actions.borrow')}
              </Button>
            ) : row.original.currentLoanId !== null ? (
              <Button
                variant='secondary'
                size='sm'
                onClick={() =>
                  setReturning({
                    open: true,
                    loanId: row.original.currentLoanId,
                    description: t('equipment.return.description', {
                      name: row.original.name,
                      borrower: row.original.currentBorrower ?? '',
                    }),
                  })
                }
              >
                <Undo2Icon data-icon='inline-start' />
                {t('equipment.actions.return')}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [collator, location.search, t],
  );

  let content: ReactElement;
  if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('equipment.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('equipment.error.forbidden')
            : t('equipment.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                reload();
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
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <LaptopIcon />
          </EmptyMedia>
          <EmptyTitle>{t('equipment.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('equipment.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('equipment.create.action')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
        emptyMessage={
          <div className='flex flex-col items-center gap-2'>
            <span>{t('equipment.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={clearFilters}>
              {t('equipment.filters.clear')}
            </Button>
          </div>
        }
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
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('equipment.create.action')}
          </Button>
        }
      />

      <div className='grid gap-4 sm:grid-cols-3'>
        <StatCard label={t('equipment.stats.total')} value={stats?.total} />
        <StatCard
          label={t('equipment.stats.borrowed')}
          value={stats?.borrowed}
        />
        <StatCard
          label={t('equipment.stats.overdue')}
          value={stats?.overdue}
          tone='destructive'
        />
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <InputGroup className='w-full sm:max-w-xs'>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (!(event.nativeEvent as InputEvent).isComposing) {
                scheduleSearch(event.target.value);
              }
            }}
            onCompositionEnd={(event) =>
              scheduleSearch(event.currentTarget.value)
            }
            placeholder={t('equipment.search.placeholder')}
            aria-label={t('equipment.search.label')}
          />
        </InputGroup>
        <Select
          items={statusItems}
          value={status ?? 'all'}
          onValueChange={changeStatus}
        >
          <SelectTrigger
            className='w-40'
            aria-label={t('equipment.filters.status')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
            {t('equipment.filters.clear')}
          </Button>
        ) : null}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>

      {content}

      <ReturnLoanDialog
        open={returning.open}
        loanId={returning.loanId}
        description={returning.description}
        onOpenChange={(open) =>
          setReturning((current) => ({ ...current, open }))
        }
        onReturned={() => {
          focusSearchAfterReloadRef.current = true;
          reload();
        }}
      />

      {/* The new, edit and borrow child routes render here and refresh the list through context. */}
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
          <Skeleton className='ml-auto h-4 w-28' />
        </div>
      ))}
    </div>
  );
}
