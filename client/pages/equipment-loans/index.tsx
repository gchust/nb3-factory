import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  ClipboardListIcon,
  SearchIcon,
  Undo2Icon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link, useSearchParams } from 'react-router';

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
import { Badge } from '@/components/ui/badge';
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

import { DateValue, OverdueBadge } from '../equipment/shared.js';
import { ReturnLoanDialog } from '../equipment/return-loan-dialog.js';
import type { Loan, LoanStatus } from '../equipment/types.js';
import { fetchLoans } from './api.js';

const LOAN_STATUSES: readonly LoanStatus[] = ['active', 'returned'];

function isLoanStatus(value: string | null): value is LoanStatus {
  return LOAN_STATUSES.some((status) => status === value);
}

/** Every borrow and return, with search by borrower and the overdue loans called out. */
export default function EquipmentLoansPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const searchRef = useRef<HTMLInputElement>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('q') ?? '';
  const statusParam = searchParams.get('status');
  const status = isLoanStatus(statusParam) ? statusParam : undefined;

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
    readonly loans?: Loan[];
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([search, status ?? null, reloadCount]);
    fetchLoans(
      api,
      { keyword: search || undefined, status },
      controller.signal,
    ).then(
      (loans) => {
        if (!controller.signal.aborted) {
          setResult({
            key,
            loans,
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
  const rows = result?.loans;
  const rowsFiltered = result?.filtered ?? false;

  const focusSearchAfterReloadRef = useRef(false);
  useEffect(() => {
    if (loading || !focusSearchAfterReloadRef.current) return;
    focusSearchAfterReloadRef.current = false;
    searchRef.current?.focus();
  }, [loading]);

  const collator = useMemo(() => new Intl.Collator(locale), [locale]);
  const [returning, setReturning] = useState<{
    readonly open: boolean;
    readonly loanId: number | null;
    readonly description: string;
  }>({ open: false, loanId: null, description: '' });

  const statusItems = [
    { value: 'all', label: t('equipment.filters.allLoanStatuses') },
    ...LOAN_STATUSES.map((value) => ({
      value,
      label: t(`equipment.loanStatus.${value}`),
    })),
  ];

  const columns = useMemo<ColumnDef<Loan>[]>(
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
        accessorKey: 'equipmentName',
        header: t('equipment.fields.name'),
        cell: ({ row }) => row.original.equipmentName,
      },
      {
        accessorKey: 'borrower',
        enableHiding: false,
        sortingFn: (a, b) =>
          collator.compare(a.original.borrower, b.original.borrower),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.fields.borrower')}
          />
        ),
        cell: ({ row }) => row.original.borrower,
      },
      {
        accessorKey: 'purpose',
        header: t('equipment.fields.purpose'),
        cell: ({ row }) =>
          row.original.purpose || (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'borrowedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.fields.borrowedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap'>
            <DateValue value={row.original.borrowedAt} />
          </span>
        ),
      },
      {
        accessorKey: 'expectedReturnAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.fields.expectedReturnAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap'>
            <DateValue value={row.original.expectedReturnAt} />
          </span>
        ),
      },
      {
        accessorKey: 'returnedAt',
        header: t('equipment.fields.returnedAt'),
        cell: ({ row }) => (
          <span className='whitespace-nowrap'>
            <DateValue value={row.original.returnedAt} />
          </span>
        ),
      },
      {
        id: 'status',
        header: t('equipment.fields.loanStatus'),
        cell: ({ row }) => (
          <div className='flex items-center gap-2'>
            {row.original.returnedAt ? (
              <Badge variant='secondary'>
                {t('equipment.loanStatus.returned')}
              </Badge>
            ) : (
              <Badge variant='outline'>
                {t('equipment.loanStatus.active')}
              </Badge>
            )}
            {row.original.overdue ? <OverdueBadge /> : null}
          </div>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('equipment.actions.label')}</span>
        ),
        cell: ({ row }) =>
          row.original.returnedAt ? null : (
            <div className='flex justify-end'>
              <Button
                variant='secondary'
                size='sm'
                onClick={() =>
                  setReturning({
                    open: true,
                    loanId: row.original.id,
                    description: t('equipment.return.description', {
                      name: row.original.equipmentName,
                      borrower: row.original.borrower,
                    }),
                  })
                }
              >
                <Undo2Icon data-icon='inline-start' />
                {t('equipment.actions.return')}
              </Button>
            </div>
          ),
      },
    ],
    [collator, t],
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
            <ClipboardListIcon />
          </EmptyMedia>
          <EmptyTitle>{t('equipment.loans.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('equipment.loans.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            render={<Link to='/equipment' />}
            nativeButton={false}
          >
            {t('equipment.loans.empty.action')}
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
            <span>{t('equipment.loans.empty.noResults')}</span>
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
        title={t('equipment.loans.title')}
        description={t('equipment.loans.description')}
      />

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
            placeholder={t('equipment.search.borrowerPlaceholder')}
            aria-label={t('equipment.search.borrowerLabel')}
          />
        </InputGroup>
        <Select
          items={statusItems}
          value={status ?? 'all'}
          onValueChange={changeStatus}
        >
          <SelectTrigger
            className='w-44'
            aria-label={t('equipment.filters.loanStatus')}
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
          <Skeleton className='h-4 w-32' />
          <Skeleton className='h-5 w-16 rounded-full' />
          <Skeleton className='ml-auto h-4 w-24' />
        </div>
      ))}
    </div>
  );
}
