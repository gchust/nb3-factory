import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Share2Icon,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
import { useUrlSearch } from '#hooks/use-url-search';

import { MaterialDeleteDialog } from './material-delete-dialog.js';
import {
  MaterialConfidentialBadge,
  MaterialPublishBadge,
} from './status-badges.js';
import {
  type Material,
  type MaterialEditOutletContext,
  type MaterialListResponse,
  type MaterialsOutletContext,
} from './types.js';

// The endpoint pages every list and caps a page at 100 records. This page filters on the server and sorts and
// paginates in the browser, so it asks for the largest page (guideline T1.10).
const PAGE_SIZE = 100;

function parseBoolean(value: string | null): boolean | undefined {
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

/** `/materials`: the internal materials list. Readers see only what they are allowed to read. */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  // The search term and the two filters live in the URL (url-search.md); the search box keeps its own text so typing
  // and input methods stay smooth.
  const { searchParams, search, text, inputProps, updateParams, clear } =
    useUrlSearch();
  const published = parseBoolean(searchParams.get('published'));
  const confidential = parseBoolean(searchParams.get('confidential'));

  function changePublished(value: string | null): void {
    updateParams((params) => {
      if (value && value !== 'all') params.set('published', value);
      else params.delete('published');
    });
  }

  function changeConfidential(value: string | null): void {
    updateParams((params) => {
      if (value && value !== 'all') params.set('confidential', value);
      else params.delete('confidential');
    });
  }

  // Decide by the input's text, so "Clear filters" appears as soon as the first character is typed.
  const hasFilters =
    text.trim() !== '' || published !== undefined || confidential !== undefined;

  function clearFilters(): void {
    clear((params) => {
      params.delete('published');
      params.delete('confidential');
    });
    searchRef.current?.focus();
  }

  // Load the list. An effect must not call setState synchronously: store the result only in the request callbacks and
  // derive "loading" from whether the result belongs to the current request. reload() increments the count.
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([
    search,
    published ?? null,
    confidential ?? null,
    reloadCount,
  ]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Material[];
    readonly capabilities?: MaterialListResponse['meta']['capabilities'];
    /** Whether this batch was fetched with filters; tells "empty" apart from "no results". */
    readonly filtered?: boolean;
    readonly error?: unknown;
    readonly total?: number;
  }>();

  useEffect(() => {
    // Abort the request when the filters change or the component unmounts, so an old result never overwrites a new one.
    const controller = new AbortController();
    const key = JSON.stringify([
      search,
      published ?? null,
      confidential ?? null,
      reloadCount,
    ]);
    api
      .request<MaterialListResponse>({
        path: 'materials',
        query: {
          q: search || undefined,
          published: published === undefined ? undefined : String(published),
          confidential:
            confidential === undefined ? undefined : String(confidential),
          pageSize: PAGE_SIZE,
        },
        signal: controller.signal,
      })
      .then(
        ({ data, meta }) => {
          if (!controller.signal.aborted) {
            setResult({
              key,
              rows: data,
              capabilities: meta.capabilities,
              total: meta.total,
              filtered:
                search !== '' ||
                published !== undefined ||
                confidential !== undefined,
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
  }, [api, search, published, confidential, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const capabilities = result?.capabilities;
  const rowsFiltered = result?.filtered ?? false;

  // After a record is deleted, its row and the link that opened it disappear once the list refreshes: move focus back
  // to the search box once the refresh finishes (guideline A6).
  const focusSearchAfterReloadRef = useRef(false);
  useEffect(() => {
    if (loading || !focusSearchAfterReloadRef.current) return;
    focusSearchAfterReloadRef.current = false;
    searchRef.current?.focus();
  }, [loading]);

  // Keep the context passed to child routes stable; the list opens the create dialog, the drawer and a row's edit
  // dialog, so it passes what each of them reads.
  const outletContext = useMemo<
    MaterialsOutletContext & MaterialEditOutletContext
  >(
    () => ({
      capabilities,
      reload,
      afterDelete: () => {
        focusSearchAfterReloadRef.current = true;
        reload();
      },
      onSaved: () => reload(),
      onNotFound: reload,
    }),
    [capabilities, reload],
  );

  const [deletion, setDeletion] = useState<{
    readonly open: boolean;
    readonly material: Material | null;
  }>({ open: false, material: null });

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const publishedItems = [
    { value: 'all', label: t('materials.filters.allPublished') },
    { value: 'true', label: t('materials.publish.published') },
    { value: 'false', label: t('materials.publish.draft') },
  ];
  const confidentialItems = [
    { value: 'all', label: t('materials.filters.allConfidential') },
    { value: 'true', label: t('materials.confidentiality.confidential') },
    { value: 'false', label: t('materials.confidentiality.public') },
  ];

  const canUpdate = capabilities?.canUpdate ?? false;
  const canDelete = capabilities?.canDelete ?? false;
  const canShare = capabilities?.canShare ?? false;
  const hasRowActions = canUpdate || canDelete || canShare;

  const columns = useMemo<ColumnDef<Material>[]>(
    () => [
      {
        accessorKey: 'title',
        enableHiding: false,
        sortingFn: (a, b) =>
          collator.compare(a.original.title, b.original.title),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('materials.fields.title')}
          />
        ),
        cell: ({ row }) => (
          // The title links to the detail child route and keeps the current query parameters.
          <Link
            to={{ pathname: String(row.original.id), search: location.search }}
            className='font-medium hover:underline'
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'ownerName',
        header: t('materials.fields.ownerName'),
        cell: ({ row }) =>
          row.original.ownerName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'published',
        header: t('materials.fields.published'),
        cell: ({ row }) => (
          <MaterialPublishBadge published={row.original.published} />
        ),
      },
      {
        accessorKey: 'confidential',
        header: t('materials.fields.confidential'),
        cell: ({ row }) => (
          <MaterialConfidentialBadge confidential={row.original.confidential} />
        ),
      },
      {
        accessorKey: 'updatedAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('materials.fields.updatedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {dateFormat.format(new Date(row.original.updatedAt))}
          </span>
        ),
      },
      ...(hasRowActions
        ? [
            {
              id: 'actions',
              enableHiding: false,
              header: () => (
                <span className='sr-only'>{t('materials.actions.label')}</span>
              ),
              cell: ({ row }) => (
                <div className='flex justify-end'>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          aria-label={t('materials.actions.more', {
                            title: row.original.title,
                          })}
                        />
                      }
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuGroup>
                        {canUpdate ? (
                          <DropdownMenuItem
                            render={
                              <Link
                                to={{
                                  pathname: `edit/${encodeURIComponent(String(row.original.id))}`,
                                  search: location.search,
                                }}
                              />
                            }
                          >
                            <PencilIcon />
                            {t('materials.actions.edit')}
                          </DropdownMenuItem>
                        ) : null}
                        {canShare ? (
                          <DropdownMenuItem
                            render={
                              <Link
                                to={{
                                  pathname: `${encodeURIComponent(String(row.original.id))}/shares`,
                                  search: location.search,
                                }}
                              />
                            }
                          >
                            <Share2Icon />
                            {t('materials.actions.share')}
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuGroup>
                      {canDelete ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              variant='destructive'
                              onClick={() =>
                                setDeletion({
                                  open: true,
                                  material: row.original,
                                })
                              }
                            >
                              <Trash2Icon />
                              {t('materials.actions.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ),
            } satisfies ColumnDef<Material>,
          ]
        : []),
    ],
    [
      canDelete,
      canShare,
      canUpdate,
      collator,
      dateFormat,
      hasRowActions,
      location.search,
      t,
    ],
  );

  // Check in the order "failed → first load → empty → data or no results".
  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = <SessionExpiredAlert />;
  } else if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('materials.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('materials.error.forbidden')
            : t('materials.error.requestFailed')}
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
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <FileTextIcon />
          </EmptyMedia>
          <EmptyTitle>{t('materials.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('materials.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        {capabilities?.canCreate ? (
          <EmptyContent>
            <Button
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
              nativeButton={false}
            >
              <PlusIcon data-icon='inline-start' />
              {t('materials.create.action')}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  } else {
    const capped = (result?.total ?? 0) > rows.length;
    content = (
      <>
        {capped ? (
          <p className='text-sm text-muted-foreground'>
            {t('materials.capNotice', { count: rows.length })}
          </p>
        ) : null}
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.id)}
          showSelectedCount={false}
          emptyMessage={
            <div className='flex flex-col items-center gap-2'>
              <span>{t('materials.empty.noResults')}</span>
              <Button variant='link' size='sm' onClick={clearFilters}>
                {t('materials.filters.clear')}
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
        title={t('materials.title')}
        description={t('materials.description')}
        actions={
          capabilities?.canCreate &&
          rows !== undefined &&
          (rows.length > 0 || rowsFiltered) ? (
            <Button
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
              nativeButton={false}
            >
              <PlusIcon data-icon='inline-start' />
              {t('materials.create.action')}
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
            placeholder={t('materials.search.placeholder')}
            aria-label={t('materials.search.label')}
          />
        </InputGroup>
        <Select
          items={publishedItems}
          value={published === undefined ? 'all' : String(published)}
          onValueChange={changePublished}
        >
          <SelectTrigger
            className='w-full sm:w-40'
            aria-label={t('materials.filters.published')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {publishedItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          items={confidentialItems}
          value={confidential === undefined ? 'all' : String(confidential)}
          onValueChange={changeConfidential}
        >
          <SelectTrigger
            className='w-full sm:w-40'
            aria-label={t('materials.filters.confidential')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {confidentialItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
            {t('materials.filters.clear')}
          </Button>
        ) : null}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      <MaterialDeleteDialog
        open={deletion.open}
        onOpenChange={(open) =>
          setDeletion((current) => ({ ...current, open }))
        }
        material={deletion.material}
        onDeleted={() => {
          setDeletion((current) => ({ ...current, open: false }));
          reload();
        }}
        deletedFocusRef={searchRef}
      />

      {/* The create dialog, the drawer and a row's edit dialog render here and read the list's refresh functions. */}
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
          <Skeleton className='h-5 w-16 rounded-full' />
          <Skeleton className='ml-auto h-4 w-28' />
        </div>
      ))}
    </div>
  );
}
