import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontalIcon, PlusIcon, SearchIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { DataTable, DataTableColumnHeader } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
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
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { useUrlSearch } from '#hooks/use-url-search';

import { fetchDocuments } from './api.js';
import type { LibraryOutletContext } from './context.js';
import { formatDateTime } from './format.js';
import type { LibraryDocument, LibraryDocumentVisibility } from './types.js';
import { DocumentVisibility } from './visibility.js';

const VISIBILITIES = ['published', 'draft', 'confidential'] as const;

function isVisibility(
  value: string | null,
): value is LibraryDocumentVisibility {
  return VISIBILITIES.some((visibility) => visibility === value);
}

/**
 * The document library: everything the signed-in colleague may read, with the
 * records it may change offered for editing.
 *
 * The list does not decide what is visible. It asks `/api/library/documents`,
 * which answers through the caller's Repository Policy, so a reader's list is
 * the published, non-confidential documents plus whatever an administrator
 * shared, and a maintainer's is its own. Hiding the edit action is convenience
 * only — the endpoint refuses the write either way.
 *
 * The search term and the visibility filter live in the URL, so a link into an
 * overlay keeps them and going back restores them (T1.7).
 */
export default function LibraryPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { searchParams, search, inputProps, updateParams, clear } =
    useUrlSearch();
  const visibilityParam = searchParams.get('visibility');
  const visibility = isVisibility(visibilityParam)
    ? visibilityParam
    : undefined;

  // The result carries the request key that produced it, so "loading" is derived
  // rather than set from the effect.
  const [result, setResult] = useState<{
    readonly key: string;
    readonly items: readonly LibraryDocument[];
    readonly total: number;
    readonly canCreate: boolean;
    readonly error?: unknown;
  }>({ key: '', items: [], total: 0, canCreate: false });
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);
  const requestKey = JSON.stringify([visibility, search, reloadToken]);

  useEffect(() => {
    const requestId = ++requestRef.current;
    fetchDocuments(api, {
      q: search || undefined,
      visibility,
    }).then(
      (page) => {
        if (requestId !== requestRef.current) return;
        setResult({
          key: requestKey,
          items: page.items,
          total: page.total,
          canCreate: page.canCreate,
        });
      },
      (error: unknown) => {
        if (requestId !== requestRef.current) return;
        setResult({
          key: requestKey,
          items: [],
          total: 0,
          canCreate: false,
          error,
        });
      },
    );
  }, [api, requestKey, visibility, search]);

  const loading = result.key !== requestKey;
  const items = loading ? [] : result.items;
  const total = loading ? 0 : result.total;
  const error = loading ? undefined : result.error;
  const canCreate = !loading && !error && result.canCreate;
  const hasFilters = Boolean(search || visibility);

  // A stable refresh for the overlays, so the create dialog can reload the list
  // without remounting it.
  const reload = useCallback(
    () => setReloadToken((token) => token + 1),
    [setReloadToken],
  );
  const outletContext = useMemo<LibraryOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const openDocument = useCallback(
    (document: LibraryDocument): void => {
      void navigate({
        pathname: `/library/${document.id}`,
        search: location.search,
      });
    },
    [navigate, location.search],
  );

  const openEditor = useCallback(
    (document: LibraryDocument): void => {
      void navigate({
        pathname: `/library/${document.id}/edit`,
        search: location.search,
      });
    },
    [navigate, location.search],
  );

  const columns = useMemo<ColumnDef<LibraryDocument, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('library.column.title')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.title}</span>
        ),
      },
      {
        accessorKey: 'ownerName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('library.column.owner')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {row.original.ownerName}
          </span>
        ),
      },
      {
        id: 'visibility',
        header: () => t('library.column.visibility'),
        enableSorting: false,
        cell: ({ row }) => (
          <DocumentVisibility
            published={row.original.published}
            confidential={row.original.confidential}
          />
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('library.column.updatedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {formatDateTime(row.original.updatedAt, locale)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => (
          <span className='sr-only'>{t('library.column.actions')}</span>
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <div className='text-right'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('library.row.actions', {
                      title: row.original.title,
                    })}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onClick={() => openDocument(row.original)}>
                  {t('library.row.view')}
                </DropdownMenuItem>
                {row.original.editable ? (
                  <DropdownMenuItem onClick={() => openEditor(row.original)}>
                    {t('library.row.edit')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    // `t` and `locale` change the rendered words; the callbacks close over the router.
    [t, locale, openDocument, openEditor],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('library.title')}
        description={t('library.description')}
        actions={
          canCreate ? (
            // `nativeButton={false}`: it renders an `<a>` through `Link`, and Base UI warns otherwise.
            <Button
              nativeButton={false}
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
            >
              <PlusIcon />
              {t('library.create.action')}
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.error.title')}</AlertTitle>
          <AlertDescription>
            {error instanceof ApiClientError && error.status === 403
              ? t('library.error.forbidden')
              : t('library.error.description')}
          </AlertDescription>
          {error instanceof ApiClientError && error.status === 403 ? null : (
            <AlertAction>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setReloadToken((token) => token + 1)}
              >
                {t('actions.retry')}
              </Button>
            </AlertAction>
          )}
        </Alert>
      ) : null}

      <DataTable
        columns={columns}
        data={items}
        getRowId={(document) => document.id}
        loading={loading}
        showPagination={items.length > 0}
        onRowClick={openDocument}
        toolbar={
          <div className='flex w-full flex-wrap items-center gap-2'>
            <InputGroup className='w-full sm:w-64'>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                {...inputProps}
                placeholder={t('library.search.placeholder')}
                aria-label={t('library.search.label')}
              />
            </InputGroup>
            <Select
              value={visibility ?? 'all'}
              onValueChange={(value: string | null) =>
                updateParams((params) => {
                  if (!value || value === 'all') params.delete('visibility');
                  else params.set('visibility', value);
                })
              }
            >
              <SelectTrigger
                className='w-40'
                aria-label={t('library.filter.visibility')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>
                  {t('library.filter.allVisibilities')}
                </SelectItem>
                {VISIBILITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`library.visibility.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters ? (
              <Button
                variant='ghost'
                size='sm'
                onClick={() => clear((params) => params.delete('visibility'))}
              >
                {t('library.clearFilters')}
              </Button>
            ) : null}
            {!loading ? (
              <span className='ml-auto text-sm text-muted-foreground'>
                {t('library.list.count', { count: total })}
              </span>
            ) : null}
          </div>
        }
        emptyTitle={
          hasFilters ? t('library.list.emptyFiltered') : t('library.list.empty')
        }
        emptyDescription={
          hasFilters
            ? t('library.list.emptyFilteredHint')
            : t('library.list.emptyHint')
        }
      />

      <Outlet context={outletContext} />
    </PageContainer>
  );
}
