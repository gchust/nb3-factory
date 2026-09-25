import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  MoreHorizontalIcon,
  NotebookPenIcon,
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

import { CustomerMemoDeleteDialog } from './customer-memo-delete-dialog.js';
import type { CustomerMemo, CustomerMemosOutletContext } from './types.js';

export default function CustomerMemosPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  // The search term lives in the URL, so a refresh, going back or a shared link restores it.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('q') ?? '';

  // The latest query parameters: the ones this page last wrote, or the router last updated.
  // The router changes the URL in a transition, so two nearly simultaneous writes would
  // overwrite each other if each started from the render's own parameters.
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
    // Compare with the previous value during render instead of calling setState in an effect.
    setSeenSearch(urlSearch);
    // Browser back/forward or a clicked link changed q: show the new value.
    // A value this page wrote itself arrives after later keystrokes (it equals ownSearch) and must not overwrite the input.
    if (urlSearch !== ownSearch) {
      setOwnSearch(urlSearch);
      setText(urlSearch);
    }
  }
  const searchTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(searchTimerRef.current), []);

  function scheduleSearch(value: string): void {
    window.clearTimeout(searchTimerRef.current);
    // While the timer runs, only outside navigation can change q; if it happened, drop this write.
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

  // Decide by the input's text, so "Clear filters" appears as soon as the first character is typed.
  const hasFilters = text.trim() !== '';

  function clearFilters(): void {
    window.clearTimeout(searchTimerRef.current);
    setText('');
    setOwnSearch('');
    updateParams((params) => {
      params.delete('q');
    });
    // The "Clear filters" button disappears along with the search term; move focus to the search box.
    searchRef.current?.focus();
  }

  // Load the list. An effect must not call setState synchronously: store the result only in the
  // request callbacks, and derive "loading" from whether the result belongs to the current request.
  const search = urlSearch.trim();
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([search, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: CustomerMemo[];
    /** Whether this batch was fetched with filters; tells "empty" apart from "no results". */
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort the request when the search term changes or the component unmounts, so an old result never overwrites a new one.
    const controller = new AbortController();
    const key = JSON.stringify([search, reloadCount]);
    api
      .request<{ data: CustomerMemo[] }>({
        path: 'customer-memos',
        query: { search: search || undefined },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setResult({ key, rows: data, filtered: search !== '' });
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
  // While reloading, rows is still the previous batch.
  const rows = result?.rows;
  // Decide by the filters the displayed data was fetched with, not by the current filters.
  const rowsFiltered = result?.filtered ?? false;

  // After a record is deleted in the drawer, its row and the link that opened the drawer disappear
  // once the list refreshes: wait for the refresh to finish, then move focus to the search box.
  const focusSearchAfterReloadRef = useRef(false);
  useEffect(() => {
    if (loading || !focusSearchAfterReloadRef.current) return;
    focusSearchAfterReloadRef.current = false;
    searchRef.current?.focus();
  }, [loading]);

  // Keep the context passed to child routes stable; otherwise effects in child routes that depend on it run again and again.
  const outletContext = useMemo<CustomerMemosOutletContext>(
    () => ({
      reload,
      afterDelete: () => {
        focusSearchAfterReloadRef.current = true;
        reload();
      },
    }),
    [reload],
  );

  // The delete confirmation dialog uses component state. Store the open state and the target separately:
  // closing changes only open, so the title stays the same during the exit animation.
  const [deletion, setDeletion] = useState<{
    readonly open: boolean;
    readonly memo: CustomerMemo | null;
  }>({ open: false, memo: null });

  // The formatter follows the current language and is recreated when it switches.
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const columns = useMemo<ColumnDef<CustomerMemo>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('customerMemos.fields.name')}
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
        accessorKey: 'notes',
        header: t('customerMemos.fields.notes'),
        cell: ({ row }) =>
          row.original.notes ? (
            <span className='line-clamp-1 max-w-[24rem]'>
              {row.original.notes}
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
            title={t('customerMemos.fields.createdAt')}
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
          <span className='sr-only'>{t('customerMemos.actions.label')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('customerMemos.actions.more', {
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
                  {t('customerMemos.actions.view')}
                </DropdownMenuItem>
                {/* Edit is a child route of the detail drawer: the menu item renders as a link. */}
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
                  {t('customerMemos.actions.edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() =>
                    setDeletion({ open: true, memo: row.original })
                  }
                >
                  <Trash2Icon />
                  {t('customerMemos.actions.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [dateFormat, location.search, t],
  );

  // Check in the order "failed → first load → empty → data or no results".
  let content: ReactElement;
  if (error) {
    // Retrying cannot succeed without permission, so offer no "Retry".
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('customerMemos.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('customerMemos.error.forbidden')
            : t('customerMemos.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                reload();
                // This button disappears after a retry; move focus to the search box.
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
            <NotebookPenIcon />
          </EmptyMedia>
          <EmptyTitle>{t('customerMemos.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('customerMemos.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* The page header already has the primary button, so use outline here: one primary button per view. */}
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('customerMemos.create.action')}
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
            <span>{t('customerMemos.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={clearFilters}>
              {t('customerMemos.filters.clear')}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('customerMemos.title')}
        description={t('customerMemos.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('customerMemos.create.action')}
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
              // Pinyin being composed is not a search term: onCompositionEnd starts the timer once a candidate is confirmed.
              if (!(event.nativeEvent as InputEvent).isComposing) {
                scheduleSearch(event.target.value);
              }
            }}
            onCompositionEnd={(event) =>
              scheduleSearch(event.currentTarget.value)
            }
            placeholder={t('customerMemos.search.placeholder')}
            aria-label={t('customerMemos.search.label')}
          />
        </InputGroup>
        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
            {t('customerMemos.filters.clear')}
          </Button>
        ) : null}
        {/* Reloading keeps the old data and shows only a small Spinner here. */}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      <CustomerMemoDeleteDialog
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
