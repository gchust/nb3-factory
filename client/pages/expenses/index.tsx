import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  PlusIcon,
  ReceiptIcon,
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

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useUrlSearch } from '@/hooks/use-url-search';

import { fetchClaims, fetchDepartments } from './claim-api.js';
import { formatAmount, formatDateTime } from './claim-format.js';
import { ClaimStatusBadge } from './claim-status-badge.js';
import { ExportPanel } from './export-panel.js';
import {
  CLAIM_STATUSES,
  MAX_CLAIM_PAGE_SIZE,
  type ClaimFilters,
  type ClaimListItem,
  type ClaimStatus,
  type Department,
} from './types.js';

function isClaimStatus(value: string | null): value is ClaimStatus {
  return CLAIM_STATUSES.some((status) => status === value);
}

export default function ExpenseListPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  const { searchParams, search, text, inputProps, updateParams, clear } =
    useUrlSearch();
  const statusParam = searchParams.get('status');
  // An unrecognized value is treated as no filter rather than sent on to the server.
  const status = isClaimStatus(statusParam) ? statusParam : undefined;
  const departmentId = searchParams.get('departmentId') ?? undefined;

  function changeStatus(value: string | null): void {
    const next = value ?? 'all';
    updateParams((params) => {
      if (next === 'all') {
        params.delete('status');
      } else {
        params.set('status', next);
      }
    });
  }

  function changeDepartment(value: string | null): void {
    const next = value ?? 'all';
    updateParams((params) => {
      if (next === 'all') {
        params.delete('departmentId');
      } else {
        params.set('departmentId', next);
      }
    });
  }

  const hasFilters =
    text.trim() !== '' || status !== undefined || departmentId !== undefined;

  function clearFilters(): void {
    clear((params) => {
      params.delete('status');
      params.delete('departmentId');
    });
    // The "Clear filters" control disappears with the filters; move focus somewhere stable (guideline A6).
    searchRef.current?.focus();
  }

  // The departments are the filter's options, not the list's data, so they load once and a failure only hides them.
  const [departments, setDepartments] = useState<readonly Department[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetchDepartments(api, controller.signal).then(
      ({ data }) => {
        if (!controller.signal.aborted) {
          setDepartments(data);
        }
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [api]);

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([
    search,
    status ?? null,
    departmentId ?? null,
    reloadCount,
  ]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: ClaimListItem[];
    /** Whether this batch was fetched with filters; tells "empty" apart from "no results". */
    readonly filtered?: boolean;
    /** The number of matching claims on all pages; more than `rows.length` when the page cap cut the list. */
    readonly total?: number;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort the request when the filters change or the component unmounts, so a stale result cannot overwrite a new one.
    const controller = new AbortController();
    const key = JSON.stringify([
      search,
      status ?? null,
      departmentId ?? null,
      reloadCount,
    ]);
    const query: ClaimFilters & { pageSize: number } = {
      status,
      departmentId,
      keyword: search || undefined,
      pageSize: MAX_CLAIM_PAGE_SIZE,
    };
    fetchClaims(api, query, controller.signal).then(
      ({ data, meta }) => {
        if (!controller.signal.aborted) {
          setResult({
            key,
            rows: data,
            total: meta.total,
            filtered:
              search !== '' ||
              status !== undefined ||
              departmentId !== undefined,
          });
        }
      },
      (error: unknown) => {
        // Keep the previous batch on failure: after "Retry", the old rows stay with a small Spinner, not the skeleton.
        if (!controller.signal.aborted) {
          setResult((previous) => ({ ...previous, key, error }));
        }
      },
    );
    return () => controller.abort();
  }, [api, departmentId, reloadCount, search, status]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  // Decide by the filters the displayed batch was fetched with, not the current ones: right after "Clear filters",
  // the screen still shows the old filtered result.
  const rowsFiltered = result?.filtered ?? false;

  const statusItems = [
    { value: 'all', label: t('expense.filters.allStatuses') },
    ...CLAIM_STATUSES.map((value) => ({
      value,
      label: t(`expense.status.${value}`),
    })),
  ];
  const departmentItems = [
    { value: 'all', label: t('expense.filters.allDepartments') },
    ...departments.map((department) => ({
      value: department.id,
      label: department.name,
    })),
  ];

  const columns = useMemo<ColumnDef<ClaimListItem>[]>(
    () => [
      {
        accessorKey: 'claimNo',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('expense.fields.claimNo')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='font-medium whitespace-nowrap hover:underline'
            to={{
              pathname: encodeURIComponent(row.original.id),
              search: location.search,
            }}
          >
            {row.original.claimNo}
          </Link>
        ),
      },
      {
        accessorKey: 'title',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('expense.fields.title')}
          />
        ),
      },
      {
        accessorKey: 'applicantName',
        header: t('expense.fields.applicant'),
        cell: ({ row }) => row.original.applicantName,
      },
      {
        accessorKey: 'departmentName',
        header: t('expense.fields.department'),
        cell: ({ row }) =>
          row.original.departmentName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'status',
        header: t('expense.fields.status'),
        cell: ({ row }) => <ClaimStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'totalAmount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('expense.fields.totalAmount')}
          />
        ),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatAmount(row.original.totalAmount)}
          </span>
        ),
      },
      {
        accessorKey: 'submittedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('expense.fields.submittedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {formatDateTime(row.original.submittedAt, locale) ?? '—'}
          </span>
        ),
      },
    ],
    [locale, location.search, t],
  );

  // Check in the order "failed → first load → empty → data or no results".
  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = <SessionExpiredAlert />;
  } else if (error) {
    // Retrying cannot succeed without permission, so offer no "Retry" (guideline S4).
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('expense.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('expense.error.forbidden')
            : t('expense.error.requestFailed')}
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
            <ReceiptIcon />
          </EmptyMedia>
          <EmptyTitle>{t('expense.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('expense.empty.description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* The page header already has the primary button, so this one is outline: one primary button per view. */}
          <Button
            variant='outline'
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('expense.create.action')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    const capped = (result?.total ?? 0) > rows.length;
    content = (
      <>
        {/* Information, not an error: a plain paragraph, not an alert. */}
        {capped ? (
          <p className='text-sm text-muted-foreground'>
            {t('expense.capNotice', { count: rows.length })}
          </p>
        ) : null}
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          // No row selection here, so no "0 of N row(s) selected" summary.
          showSelectedCount={false}
          emptyMessage={
            <div className='flex flex-col items-center gap-2'>
              <span>{t('expense.empty.noResults')}</span>
              <Button variant='link' size='sm' onClick={clearFilters}>
                {t('expense.filters.clear')}
              </Button>
            </div>
          }
        />
      </>
    );
  }

  const filterLabel = [
    status ? t(`expense.status.${status}`) : t('expense.filters.allStatuses'),
    departmentId
      ? (departments.find((department) => department.id === departmentId)
          ?.name ?? departmentId)
      : t('expense.filters.allDepartments'),
    search ? `“${search}”` : t('expense.filters.anyKeyword'),
  ].join(' · ');

  return (
    <PageContainer>
      <PageHeader
        title={t('expense.title')}
        description={t('expense.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('expense.create.action')}
          </Button>
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
            placeholder={t('expense.search.placeholder')}
            aria-label={t('expense.search.label')}
          />
        </InputGroup>
        <Select
          items={statusItems}
          value={status ?? 'all'}
          onValueChange={changeStatus}
        >
          <SelectTrigger
            className='w-full sm:w-40'
            aria-label={t('expense.filters.status')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          items={departmentItems}
          value={departmentId ?? 'all'}
          onValueChange={changeDepartment}
        >
          <SelectTrigger
            className='w-full sm:w-48'
            aria-label={t('expense.filters.department')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {departmentItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
            {t('expense.filters.clear')}
          </Button>
        ) : null}
        {/* Reloading keeps the old rows and shows only a small Spinner here. */}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      <ExportPanel
        filters={{ status, departmentId, keyword: search || undefined }}
        labels={filterLabel}
      />

      {/* The create page, a claim's page and the edit page render here and return `RouteChildPage`. */}
      <Outlet context={{ reload }} />
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
          <Skeleton className='ml-auto h-4 w-20' />
        </div>
      ))}
    </div>
  );
}
