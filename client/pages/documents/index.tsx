import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
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
import { Link, Outlet, useLocation } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { useUrlSearch } from '#hooks/use-url-search';
import { DocumentsClient, type DocumentItem } from '#lib/documents-client';

import { DocumentDeleteDialog } from './document-delete-dialog.js';
import {
  DOCUMENTS_PAGE_SIZE,
  DOCUMENTS_RESOURCE,
  type DocumentSortField,
  type DocumentSortOrder,
  type DocumentsOutletContext,
} from './types.js';

const SORT_FIELDS: readonly DocumentSortField[] = ['title', 'updatedAt'];

function isSortField(value: string | null): value is DocumentSortField {
  return SORT_FIELDS.some((field) => field === value);
}

function isSortOrder(value: string | null): value is DocumentSortOrder {
  return value === 'asc' || value === 'desc';
}

function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** `/documents` — the document list. What it shows is decided by the server's record access, not by the client. */
export default function DocumentsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);
  // Hide "New" for a reader: the permission snapshot decides, never the loaded rows.
  const { can: canCreate } = useCan({
    resource: DOCUMENTS_RESOURCE,
    action: 'create',
  });

  const { searchParams, search, text, inputProps, updateParams, clear } =
    useUrlSearch();
  const page = parsePage(searchParams.get('page'));
  const sortByParam = searchParams.get('sortBy');
  const sortOrderParam = searchParams.get('sortOrder');
  const sortBy: DocumentSortField = isSortField(sortByParam)
    ? sortByParam
    : 'updatedAt';
  const sortOrder: DocumentSortOrder = isSortOrder(sortOrderParam)
    ? sortOrderParam
    : 'desc';

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([
    search,
    page,
    sortBy,
    sortOrder,
    reloadCount,
  ]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: readonly DocumentItem[];
    readonly total?: number;
    /** Whether this batch was fetched with a filter; tells "nothing at all" apart from "nothing matched". */
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([search, page, sortBy, sortOrder, reloadCount]);
    new DocumentsClient(api)
      .list({
        q: search || undefined,
        page,
        pageSize: DOCUMENTS_PAGE_SIZE,
        sortBy,
        sortOrder,
        signal: controller.signal,
      })
      .then(
        ({ data, meta }) => {
          if (!controller.signal.aborted) {
            setResult({
              key,
              rows: data,
              total: meta.total,
              // Decide by the filters the shown data was fetched with, not by the current ones.
              filtered: search.trim() !== '',
            });
          }
        },
        (error: unknown) => {
          // Keep the previous batch on failure: after "Retry" the old rows stay and a small Spinner shows.
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, search, page, sortBy, sortOrder, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const total = result?.total ?? 0;
  const rowsFiltered = result?.filtered ?? false;

  // After a delete the row and the link that opened the drawer are gone: refresh, then put focus back on the search box.
  const focusSearchAfterReloadRef = useRef(false);
  useEffect(() => {
    if (loading || !focusSearchAfterReloadRef.current) return;
    focusSearchAfterReloadRef.current = false;
    searchRef.current?.focus();
  }, [loading]);

  // Keep the context stable, or effects in child overlays that depend on it run again on every render. The overlays
  // read the edit part too: a save or a record that has gone refreshes the list behind them.
  const outletContext = useMemo<DocumentsOutletContext>(
    () => ({
      reload,
      onSaved: () => reload(),
      onNotFound: () => reload(),
    }),
    [reload],
  );

  const [deletion, setDeletion] = useState<{
    readonly open: boolean;
    readonly document: DocumentItem | null;
  }>({ open: false, document: null });

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  function changeSort(field: DocumentSortField): void {
    updateParams((params) => {
      if (sortBy === field) {
        params.set('sortOrder', sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        params.set('sortBy', field);
        params.set('sortOrder', field === 'title' ? 'asc' : 'desc');
      }
      // Sorting restarts at the first page.
      params.delete('page');
    });
  }

  function goToPage(next: number): void {
    updateParams((params) => {
      if (next <= 1) params.delete('page');
      else params.set('page', String(next));
    });
  }

  function clearFilters(): void {
    clear();
    searchRef.current?.focus();
  }

  const hasRows = rows !== undefined && rows.length > 0;
  const pageCount = Math.max(1, Math.ceil(total / DOCUMENTS_PAGE_SIZE));
  // Whether any row offers an action at all: for a reader the whole column disappears.
  const showActions = (rows ?? []).some((row) => row.canEdit || row.canDelete);

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = <SessionExpiredAlert />;
  } else if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {forbidden
            ? t('documents.error.forbidden')
            : t('documents.error.requestFailed')}
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
  } else if (rows.length === 0) {
    content = (
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <FileTextIcon />
          </EmptyMedia>
          <EmptyTitle>
            {rowsFiltered
              ? t('documents.empty.noResults')
              : t('documents.empty.title')}
          </EmptyTitle>
          <EmptyDescription>
            {rowsFiltered
              ? t('documents.empty.noResultsDescription')
              : t('documents.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        {rowsFiltered ? (
          <EmptyContent>
            <Button variant='outline' onClick={clearFilters}>
              {t('documents.filters.clear')}
            </Button>
          </EmptyContent>
        ) : canCreate ? (
          <EmptyContent>
            <Button
              nativeButton={false}
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
            >
              <PlusIcon data-icon='inline-start' />
              {t('documents.create.action')}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  } else {
    content = (
      <>
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortButton
                    label={t('documents.fields.title')}
                    active={sortBy === 'title'}
                    order={sortOrder}
                    onClick={() => changeSort('title')}
                  />
                </TableHead>
                <TableHead>{t('documents.fields.owner')}</TableHead>
                <TableHead>{t('documents.fields.status')}</TableHead>
                <TableHead>
                  <SortButton
                    label={t('documents.fields.updatedAt')}
                    active={sortBy === 'updatedAt'}
                    order={sortOrder}
                    onClick={() => changeSort('updatedAt')}
                  />
                </TableHead>
                {showActions ? (
                  <TableHead className='w-10'>
                    <span className='sr-only'>
                      {t('documents.rowActions.label')}
                    </span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className='max-w-[24rem]'>
                    <Link
                      to={{ pathname: String(row.id), search: location.search }}
                      className='font-medium hover:underline'
                    >
                      {row.title}
                    </Link>
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {row.ownerName ?? '—'}
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-1'>
                      <StatusBadge tone={row.published ? 'success' : 'neutral'}>
                        {row.published
                          ? t('documents.status.published')
                          : t('documents.status.draft')}
                      </StatusBadge>
                      {row.confidential ? (
                        <StatusBadge tone='warning'>
                          {t('documents.status.confidential')}
                        </StatusBadge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-muted-foreground'>
                    {dateFormat.format(new Date(row.updatedAt))}
                  </TableCell>
                  {showActions ? (
                    <TableCell className='text-right'>
                      {row.canEdit || row.canDelete ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant='ghost'
                                size='icon-sm'
                                aria-label={t('documents.rowActions.more', {
                                  name: row.title,
                                })}
                              />
                            }
                          >
                            <MoreHorizontalIcon />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end'>
                            {row.canEdit ? (
                              <DropdownMenuItem
                                render={
                                  <Link
                                    to={{
                                      pathname: `edit/${encodeURIComponent(row.id)}`,
                                      search: location.search,
                                    }}
                                  />
                                }
                              >
                                <PencilIcon />
                                {t('documents.rowActions.edit')}
                              </DropdownMenuItem>
                            ) : null}
                            {row.canEdit && row.canDelete ? (
                              <DropdownMenuSeparator />
                            ) : null}
                            {row.canDelete ? (
                              <DropdownMenuItem
                                variant='destructive'
                                onClick={() =>
                                  setDeletion({ open: true, document: row })
                                }
                              >
                                <Trash2Icon />
                                {t('documents.rowActions.delete')}
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <p className='text-sm text-muted-foreground'>
            {t('documents.pagination.summary', {
              total,
              page,
              pageCount,
            })}
          </p>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={page <= 1 || loading}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeftIcon data-icon='inline-start' />
              {t('documents.pagination.previous')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={page >= pageCount || loading}
              onClick={() => goToPage(page + 1)}
            >
              {t('documents.pagination.next')}
              <ChevronRightIcon data-icon='inline-end' />
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('documents.title')}
        description={t('documents.description')}
        actions={
          // The primary action belongs in the header only once the empty state no longer carries it.
          hasRows && canCreate ? (
            <Button
              nativeButton={false}
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
            >
              <PlusIcon data-icon='inline-start' />
              {t('documents.create.action')}
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
            placeholder={t('documents.search.placeholder')}
            aria-label={t('documents.search.label')}
          />
        </InputGroup>
        {text.trim() !== '' ? (
          <Button
            variant='ghost'
            onClick={() => {
              clear();
              searchRef.current?.focus();
            }}
          >
            {t('documents.filters.clear')}
          </Button>
        ) : null}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      <DocumentDeleteDialog
        open={deletion.open}
        onOpenChange={(open) =>
          setDeletion((current) => ({ ...current, open }))
        }
        document={deletion.document}
        onDeleted={() => {
          setDeletion((current) => ({ ...current, open: false }));
          focusSearchAfterReloadRef.current = true;
          reload();
        }}
        deletedFocusRef={searchRef}
      />

      {/* The create dialog, the drawer and a row's edit dialog render here, reading the list's refresh from context. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function SortButton({
  label,
  active,
  order,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly order: DocumentSortOrder;
  readonly onClick: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Button
      variant='ghost'
      size='sm'
      className='-ml-2.5 data-[active=true]:text-foreground'
      data-active={active}
      aria-label={
        active
          ? t('documents.sort.toggle', { field: label })
          : t('documents.sort.by', { field: label })
      }
      onClick={onClick}
    >
      {label}
      {active ? (
        order === 'asc' ? (
          <ArrowUpIcon data-icon='inline-end' />
        ) : (
          <ArrowDownIcon data-icon='inline-end' />
        )
      ) : null}
    </Button>
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
