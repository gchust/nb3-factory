import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  EyeIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { fetchMemos } from './memo-api.js';
import { MemoDeleteDialog } from './memo-delete-dialog.js';
import type { CustomerMemo, MemosOutletContext } from './types.js';
import { useDateTimeFormat } from './use-date-time-format.js';

export default function MemosPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  // The search term lives in the URL, so a refresh, going back or a shared link restores it.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('q') ?? '';

  // The router changes the URL in a transition, so every write starts from the latest parameters this page holds.
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

  // The search box text lives in component state and reaches the URL only 300ms after typing stops; requests follow the URL.
  const [text, setText] = useState(urlSearch);
  // The q this page last wrote (or received from outside), and the q the previous render saw.
  const [ownSearch, setOwnSearch] = useState(urlSearch);
  const [seenSearch, setSeenSearch] = useState(urlSearch);
  if (urlSearch !== seenSearch) {
    setSeenSearch(urlSearch);
    // Browser back/forward or a clicked link changed q: show the new value, unless it is this page's own write
    // arriving after later keystrokes.
    if (urlSearch !== ownSearch) {
      setOwnSearch(urlSearch);
      setText(urlSearch);
    }
  }
  const searchTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(searchTimerRef.current), []);

  function scheduleSearch(value: string): void {
    window.clearTimeout(searchTimerRef.current);
    // Only outside navigation can change q while the timer runs: if it did, drop this write and let the navigation win.
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

  const hasFilters = text.trim() !== '';

  function clearSearch(): void {
    window.clearTimeout(searchTimerRef.current);
    setText('');
    setOwnSearch('');
    updateParams((params) => params.delete('q'));
    // The "Clear search" button disappears along with the filter; move focus to the search box.
    searchRef.current?.focus();
  }

  // Load the list. An effect must not call setState synchronously: store the result only in the request callbacks and
  // derive "loading" from whether the result belongs to the current request.
  const search = urlSearch.trim();
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([search, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: CustomerMemo[];
    /** Whether this batch was fetched with a filter; tells "empty" apart from "no results". */
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([search, reloadCount]);
    fetchMemos(api, search, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) {
          setResult({ key, rows, filtered: search !== '' });
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
  }, [api, search, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  // Decide by the filters the displayed data was fetched with, not by the current filters.
  const rowsFiltered = result?.filtered ?? false;

  // After a memo is deleted in the drawer, wait for the refresh to finish, then move focus to the search box.
  const focusSearchAfterReloadRef = useRef(false);
  useEffect(() => {
    if (loading || !focusSearchAfterReloadRef.current) return;
    focusSearchAfterReloadRef.current = false;
    searchRef.current?.focus();
  }, [loading]);

  // Keep the context passed to child routes stable; otherwise effects in child routes that depend on it run again and again.
  const outletContext = useMemo<MemosOutletContext>(
    () => ({
      reload,
      afterDelete: () => {
        focusSearchAfterReloadRef.current = true;
        reload();
      },
    }),
    [reload],
  );

  // The delete confirmation uses component state. Store the open state and the target separately: closing changes only
  // open, so the title stays the same during the exit animation.
  const [deletion, setDeletion] = useState<{
    readonly open: boolean;
    readonly memo: CustomerMemo | null;
  }>({ open: false, memo: null });

  const dateFormat = useDateTimeFormat();
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const columns = useMemo<ColumnDef<CustomerMemo>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        // The default sort compares character codes, so Chinese does not sort by pinyin; use the current language's collation.
        sortingFn: (a, b) => collator.compare(a.original.name, b.original.name),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('memos.fields.name')}
          />
        ),
        cell: ({ row }) => (
          // The name links to the detail child route and keeps the current query parameters.
          <Link
            to={{ pathname: String(row.original.id), search: location.search }}
            className='font-medium hover:underline'
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'note',
        enableSorting: false,
        header: t('memos.fields.note'),
        cell: ({ row }) =>
          row.original.note ? (
            <span
              className='block max-w-[32rem] truncate'
              title={row.original.note}
            >
              {row.original.note}
            </span>
          ) : (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'createdAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('memos.fields.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {dateFormat.format(new Date(row.original.createdAt))}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('memos.actions.label')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('memos.actions.more', {
                      name: row.original.name,
                    })}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  render={
                    <Link
                      to={{
                        pathname: String(row.original.id),
                        search: location.search,
                      }}
                    />
                  }
                >
                  <EyeIcon />
                  {t('memos.actions.view')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={
                    <Link
                      to={{
                        pathname: `${row.original.id}/edit`,
                        search: location.search,
                      }}
                    />
                  }
                >
                  <PencilIcon />
                  {t('memos.actions.edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() =>
                    setDeletion({ open: true, memo: row.original })
                  }
                >
                  <Trash2Icon />
                  {t('memos.actions.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [collator, dateFormat, location.search, t],
  );

  // Check in the order "failed → first load → empty → data or no results".
  let content: ReactElement;
  if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('memos.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('memos.error.forbidden')
            : t('memos.error.requestFailed')}
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
            <FileTextIcon />
          </EmptyMedia>
          <EmptyTitle>{t('memos.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('memos.empty.description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* The page header already has the primary button, so use outline here. */}
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('memos.create.action')}
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
            <span>{t('memos.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={clearSearch}>
              {t('memos.filters.clear')}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('memos.title')}
        description={t('memos.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('memos.create.action')}
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
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              // Pinyin being composed is not a search term; onCompositionEnd starts the timer once a candidate is confirmed.
              if (!(event.nativeEvent as InputEvent).isComposing) {
                scheduleSearch(event.target.value);
              }
            }}
            onCompositionEnd={(event) =>
              scheduleSearch(event.currentTarget.value)
            }
            placeholder={t('memos.search.placeholder')}
            aria-label={t('memos.search.label')}
          />
        </InputGroup>
        {hasFilters ? (
          <Button variant='ghost' onClick={clearSearch}>
            {t('memos.filters.clear')}
          </Button>
        ) : null}
        {/* Reloading keeps the old data and shows only a small Spinner here. */}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      <MemoDeleteDialog
        open={deletion.open}
        onOpenChange={(open) =>
          setDeletion((current) => ({ ...current, open }))
        }
        memo={deletion.memo}
        onDeleted={() => {
          setDeletion((current) => ({ ...current, open: false }));
          reload();
        }}
        deletedFocusRef={searchRef}
      />

      {/* The create and detail child routes render here and get the list refresh function from context. */}
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
          <Skeleton className='h-4 w-24' />
          <Skeleton className='ml-auto h-4 w-28' />
        </div>
      ))}
    </div>
  );
}
