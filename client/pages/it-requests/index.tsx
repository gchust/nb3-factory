import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  InfoIcon,
  LifeBuoyIcon,
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

import { ItTicketCategoryBadge, ItTicketStatusBadge } from './status-badge.js';
import {
  isItTicketCategory,
  isItTicketStatus,
  IT_CATEGORY_LABEL_KEYS,
  IT_STATUS_LABEL_KEYS,
  IT_TICKET_CATEGORIES,
  IT_TICKET_STATUSES,
  IT_TICKETS_RESOURCE,
  type ItRequestsOutletContext,
  type ItTicket,
} from './types.js';

/** The server caps a listing at this many rows; the notice below explains a full page. */
const LIST_LIMIT = 200;

export default function ItRequestsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  // The search term and the filters live in the URL, so refreshing, going
  // back, or opening a shared link restores the same view.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('q') ?? '';
  const statusParam = searchParams.get('status');
  const categoryParam = searchParams.get('category');
  // An unrecognized value counts as no filter.
  const status = isItTicketStatus(statusParam) ? statusParam : undefined;
  const category = isItTicketCategory(categoryParam)
    ? categoryParam
    : undefined;

  // The latest query parameters: the ones this page last wrote, or the router
  // last updated. Two nearly simultaneous writes (the search timer firing, a
  // filter change) must start from this value rather than from the render that
  // issued them.
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

  // The search box text is component state and reaches the URL only 300ms
  // after typing stops; requests follow the URL.
  const [text, setText] = useState(urlSearch);
  const [ownSearch, setOwnSearch] = useState(urlSearch);
  const [seenSearch, setSeenSearch] = useState(urlSearch);
  if (urlSearch !== seenSearch) {
    // Compare during render instead of in an effect. A value this page wrote
    // arrives after later keystrokes and must not overwrite the input.
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
      // Outside navigation (back, forward, a clicked link) wins over this
      // write if it landed while the timer was pending.
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

  function changeCategory(value: string | null): void {
    updateParams((params) => {
      if (value && value !== 'all') params.set('category', value);
      else params.delete('category');
    });
  }

  // Decide by the input text so "Clear filters" appears on the first character.
  const hasFilters =
    text.trim() !== '' || status !== undefined || category !== undefined;

  function clearFilters(): void {
    window.clearTimeout(searchTimerRef.current);
    setText('');
    setOwnSearch('');
    updateParams((params) => {
      params.delete('q');
      params.delete('status');
      params.delete('category');
    });
    // This button disappears along with the filters; move focus to search.
    searchRef.current?.focus();
  }

  // Load the list. The effect stores results only in the request callbacks and
  // derives "loading" from whether the result belongs to the current request.
  const search = urlSearch.trim();
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([
    search,
    status ?? null,
    category ?? null,
    reloadCount,
  ]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: ItTicket[];
    /** Whether this batch was fetched with filters; tells "empty" from "no results". */
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([
      search,
      status ?? null,
      category ?? null,
      reloadCount,
    ]);
    api
      .request<{ data: ItTicket[] }>({
        path: 'it/tickets',
        query: {
          status,
          category,
          keyword: search || undefined,
        },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setResult({
              key,
              rows: data,
              filtered:
                search !== '' || status !== undefined || category !== undefined,
            });
          }
        },
        (error: unknown) => {
          // Keep the previous batch on failure: after "Retry" show the old data
          // and a small Spinner rather than the skeleton.
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, search, status, category, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const rowsFiltered = result?.filtered ?? false;

  // The list's refresh function, kept stable for the child routes.
  const outletContext = useMemo<ItRequestsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  // Whether this session may submit a request. The endpoint enforces the same
  // rule; this only decides whether the action is shown.
  const canCreate = useCan({
    resource: { type: 'composite', id: IT_TICKETS_RESOURCE },
    action: 'create',
  }).can;

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const statusItems = [
    { value: 'all', label: t('it.filters.allStatuses') },
    ...IT_TICKET_STATUSES.map((value) => ({
      value,
      label: t(IT_STATUS_LABEL_KEYS[value]),
    })),
  ];
  const categoryItems = [
    { value: 'all', label: t('it.filters.allCategories') },
    ...IT_TICKET_CATEGORIES.map((value) => ({
      value,
      label: t(IT_CATEGORY_LABEL_KEYS[value]),
    })),
  ];

  const columns = useMemo<ColumnDef<ItTicket>[]>(
    () => [
      {
        accessorKey: 'title',
        enableHiding: false,
        sortingFn: (a, b) =>
          collator.compare(a.original.title, b.original.title),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('it.fields.title')} />
        ),
        cell: ({ row }) => (
          // The title links to the detail child route and keeps the filters.
          <Link
            to={{
              pathname: String(row.original.id),
              search: location.search,
            }}
            className='font-medium hover:underline'
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'category',
        header: t('it.fields.category'),
        cell: ({ row }) => (
          <ItTicketCategoryBadge category={row.original.category} />
        ),
      },
      {
        accessorKey: 'status',
        header: t('it.fields.status'),
        cell: ({ row }) => <ItTicketStatusBadge status={row.original.status} />,
      },
      {
        id: 'submitter',
        enableSorting: false,
        header: t('it.fields.submitter'),
        cell: ({ row }) =>
          row.original.submitter?.name ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'createdAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('it.fields.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {dateFormat.format(new Date(row.original.createdAt))}
          </span>
        ),
      },
    ],
    [collator, dateFormat, location.search, t],
  );

  // Failed → first load → empty → data or no results.
  let content: ReactElement;
  if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('it.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden ? t('it.error.forbidden') : t('it.error.requestFailed')}
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
            <LifeBuoyIcon />
          </EmptyMedia>
          <EmptyTitle>{t('it.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('it.empty.description')}</EmptyDescription>
        </EmptyHeader>
        {canCreate ? (
          <EmptyContent>
            {/* The page header already holds the primary button, so use
                outline here: one primary button per view. */}
            <Button
              variant='outline'
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
              nativeButton={false}
            >
              <PlusIcon data-icon='inline-start' />
              {t('it.create.action')}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        emptyMessage={
          <div className='flex flex-col items-center gap-2'>
            <span>{t('it.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={clearFilters}>
              {t('it.filters.clear')}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('it.title')}
        description={t('it.description')}
        actions={
          canCreate ? (
            <Button
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
              nativeButton={false}
            >
              <PlusIcon data-icon='inline-start' />
              {t('it.create.action')}
            </Button>
          ) : undefined
        }
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
              // A pinyin candidate being composed is not a search term:
              // onCompositionEnd starts the timer once it is confirmed.
              if (!(event.nativeEvent as InputEvent).isComposing) {
                scheduleSearch(event.target.value);
              }
            }}
            onCompositionEnd={(event) =>
              scheduleSearch(event.currentTarget.value)
            }
            placeholder={t('it.search.placeholder')}
            aria-label={t('it.search.label')}
          />
        </InputGroup>
        <Select
          items={statusItems}
          value={status ?? 'all'}
          onValueChange={changeStatus}
        >
          <SelectTrigger className='w-40' aria-label={t('it.filters.status')}>
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
        <Select
          items={categoryItems}
          value={category ?? 'all'}
          onValueChange={changeCategory}
        >
          <SelectTrigger className='w-40' aria-label={t('it.filters.category')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categoryItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
            {t('it.filters.clear')}
          </Button>
        ) : null}
        {/* Reloading keeps the old data and shows only a small Spinner here. */}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {rows !== undefined && rows.length === LIST_LIMIT ? (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            {t('it.cap.notice', { count: LIST_LIMIT })}
          </AlertDescription>
        </Alert>
      ) : null}
      {content}

      {/* The create and detail child routes render here with the refresh function. */}
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
          <Skeleton className='h-4 w-40' />
          <Skeleton className='h-5 w-16 rounded-full' />
          <Skeleton className='h-5 w-16 rounded-full' />
          <Skeleton className='ml-auto h-4 w-28' />
        </div>
      ))}
    </div>
  );
}
