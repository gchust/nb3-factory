import { useApiClient, useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  FilePlus2Icon,
  HistoryIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
  EmptyDescription,
  EmptyHeader,
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
import { useUrlSearch } from '@/hooks/use-url-search';
import {
  DOCUMENT_CATEGORIES,
  categoryLabelKey,
  deleteDocument,
  documentCenterErrorKey,
  formatDateTime,
  listDocuments,
  restoreDocument,
  statusLabelKey,
  visibilityLabelKey,
  type DocumentCategory,
  type DocumentDeletedFilter,
  type DocumentSummary,
} from '@/lib/document-center';

const PAGE_SIZE = 100;
const DELETED_FILTERS: readonly DocumentDeletedFilter[] = [
  'exclude',
  'include',
  'only',
];

function isCategory(value: string | null): value is DocumentCategory {
  return DOCUMENT_CATEGORIES.some((item) => item === value);
}

function isDeletedFilter(value: string | null): value is DocumentDeletedFilter {
  return DELETED_FILTERS.some((item) => item === value);
}

/**
 * The administration console's document list: every document, published or
 * draft, visible or deleted. Create, edit and version history are child routes
 * shown over this list.
 */
export default function DocumentCenterDocumentsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const toaster = useToaster();

  const { searchParams, search, text, inputProps, updateParams, clear } =
    useUrlSearch();
  const categoryParam = searchParams.get('category');
  const category = isCategory(categoryParam) ? categoryParam : undefined;
  const deletedParam = searchParams.get('deleted');
  const deleted = isDeletedFilter(deletedParam)
    ? deletedParam
    : ('exclude' as DocumentDeletedFilter);

  function changeCategory(value: string | null): void {
    updateParams((params) => {
      if (value && value !== 'all') params.set('category', value);
      else params.delete('category');
    });
  }

  function changeDeleted(value: string | null): void {
    updateParams((params) => {
      if (value && value !== 'exclude') params.set('deleted', value);
      else params.delete('deleted');
    });
  }

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([
    search,
    category ?? null,
    deleted,
    reloadCount,
  ]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: readonly DocumentSummary[];
    readonly total?: number;
    readonly error?: unknown;
  }>();
  const [pendingDelete, setPendingDelete] = useState<DocumentSummary | null>(
    null,
  );
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([
      search,
      category ?? null,
      deleted,
      reloadCount,
    ]);
    listDocuments(
      api,
      { q: search || undefined, category, deleted, pageSize: PAGE_SIZE },
      controller.signal,
    ).then(
      (list) => {
        if (!controller.signal.aborted) {
          setResult({ key, rows: [...list.data], total: list.meta.total });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult((previous) => ({ ...previous, key, error }));
        }
      },
    );
    return () => controller.abort();
  }, [api, search, category, deleted, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const capped = (result?.total ?? 0) > (rows?.length ?? 0);

  const restore = useCallback(
    async (document: DocumentSummary): Promise<void> => {
      setBusyId(document.id);
      try {
        await restoreDocument(api, document.id);
        toaster.show({ type: 'success', title: t('documentsAdmin.restored') });
        reload();
      } catch (failure) {
        toaster.show({
          type: 'error',
          title: t(`documents.error.${documentCenterErrorKey(failure)}`),
        });
      } finally {
        setBusyId(null);
      }
    },
    [api, reload, t, toaster],
  );

  async function confirmDelete(): Promise<void> {
    const document = pendingDelete;
    setPendingDelete(null);
    if (!document) return;
    setBusyId(document.id);
    try {
      await deleteDocument(api, document.id);
      toaster.show({ type: 'success', title: t('documentsAdmin.deleted') });
      reload();
    } catch (failure) {
      toaster.show({
        type: 'error',
        title: t(`documents.error.${documentCenterErrorKey(failure)}`),
      });
    } finally {
      setBusyId(null);
    }
  }

  const columns = useMemo<ColumnDef<DocumentSummary>[]>(
    () => [
      {
        id: 'title',
        accessorKey: 'title',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('documents.column.title')}
          />
        ),
        cell: ({ row }) => (
          <div className='space-y-0.5'>
            <span className='font-medium text-foreground'>
              {row.original.title}
            </span>
            {row.original.code ? (
              <span className='block text-xs text-muted-foreground'>
                {row.original.code}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'category',
        accessorKey: 'category',
        enableHiding: false,
        enableSorting: false,
        header: t('documents.column.category'),
        cell: ({ row }) => (
          <Badge variant='secondary'>
            {t(categoryLabelKey(row.original.category))}
          </Badge>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        enableHiding: false,
        enableSorting: false,
        header: t('documentsAdmin.column.status'),
        cell: ({ row }) =>
          row.original.deletedAt ? (
            <Badge variant='destructive'>
              {t('documentsAdmin.status.deleted')}
            </Badge>
          ) : (
            <Badge
              variant={
                row.original.status === 'published' ? 'default' : 'outline'
              }
            >
              {t(statusLabelKey(row.original.status))}
            </Badge>
          ),
      },
      {
        id: 'visibility',
        accessorKey: 'visibility',
        enableHiding: false,
        enableSorting: false,
        header: t('documentsAdmin.column.visibility'),
        cell: ({ row }) =>
          row.original.visibility === 'all'
            ? t(visibilityLabelKey('all'))
            : t('documentsAdmin.visibility.departmentsCount', {
                count: row.original.departmentIds.length,
              }),
      },
      {
        id: 'version',
        accessorKey: 'version',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('documents.column.version')}
          />
        ),
        cell: ({ row }) =>
          t('documents.versionValue', { version: row.original.version }),
      },
      {
        id: 'updatedAt',
        accessorKey: 'updatedAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('documents.column.updatedAt')}
          />
        ),
        cell: ({ row }) => formatDateTime(row.original.updatedAt, locale),
      },
      {
        id: 'actions',
        enableHiding: false,
        enableSorting: false,
        header: () => (
          <span className='sr-only'>{t('documents.column.actions')}</span>
        ),
        cell: ({ row }) => {
          const document = row.original;
          const busy = busyId === document.id;
          return (
            <div className='flex justify-end'>
              {busy ? <Spinner /> : null}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label={t('documents.column.actions')}
                    />
                  }
                >
                  <MoreHorizontalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  {document.deletedAt ? (
                    <DropdownMenuItem
                      onClick={() => {
                        void restore(document);
                      }}
                    >
                      <RotateCcwIcon />
                      {t('documentsAdmin.action.restore')}
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem
                        render={<Link to={`${document.id}/edit`} />}
                      >
                        <PencilIcon />
                        {t('actions.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        render={<Link to={`${document.id}/versions`} />}
                      >
                        <HistoryIcon />
                        {t('documentsAdmin.action.versions')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant='destructive'
                        onClick={() => setPendingDelete(document)}
                      >
                        <Trash2Icon />
                        {t('actions.delete')}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [busyId, locale, restore, t],
  );

  let content: ReactElement;
  if (error) {
    content = (
      <Alert variant='destructive'>
        <AlertTitle>
          {t(`documents.error.${documentCenterErrorKey(error)}`)}
        </AlertTitle>
        <Button
          variant='outline'
          size='sm'
          className='mt-2'
          onClick={() => reload()}
        >
          {t('documents.action.retry')}
        </Button>
      </Alert>
    );
  } else if (rows === undefined) {
    content = (
      <div className='space-y-2' role='status' aria-label={t('status.loading')}>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className='h-12 w-full' />
        ))}
      </div>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={[...rows]}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
        emptyMessage={
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t('documentsAdmin.empty.title')}</EmptyTitle>
              <EmptyDescription>
                {t('documentsAdmin.empty.description')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('navigation.documentCenterDocuments')}
        description={t('documentsAdmin.documents.description')}
        actions={
          <Button render={<Link to='new' />}>
            <FilePlus2Icon />
            {t('documentsAdmin.action.newDocument')}
          </Button>
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <InputGroup className='max-w-sm min-w-56 flex-1'>
          <InputGroupAddon>
            <SearchIcon className='size-4 text-muted-foreground' />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={t('documents.search.label')}
            placeholder={t('documents.search.placeholder')}
            {...inputProps}
          />
        </InputGroup>
        <Select
          value={category ?? 'all'}
          onValueChange={(value) => changeCategory(String(value))}
        >
          <SelectTrigger
            aria-label={t('documents.filter.category')}
            className='w-44'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>
              {t('documents.filter.allCategories')}
            </SelectItem>
            {DOCUMENT_CATEGORIES.map((item) => (
              <SelectItem key={item} value={item}>
                {t(categoryLabelKey(item))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={deleted}
          onValueChange={(value) => changeDeleted(String(value))}
        >
          <SelectTrigger
            aria-label={t('documentsAdmin.filter.deleted')}
            className='w-48'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DELETED_FILTERS.map((item) => (
              <SelectItem key={item} value={item}>
                {t(`documentsAdmin.filter.deleted.${item}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {text !== '' || category !== undefined || deleted !== 'exclude' ? (
          <Button
            variant='ghost'
            size='sm'
            onClick={() =>
              clear((params) => {
                params.delete('category');
                params.delete('deleted');
              })
            }
          >
            {t('documents.action.clearFilters')}
          </Button>
        ) : null}
        {loading && rows !== undefined ? <Spinner /> : null}
      </div>
      {capped ? (
        <p className='mt-4 text-sm text-muted-foreground'>
          {t('documentsAdmin.capNotice', { count: rows?.length ?? 0 })}
        </p>
      ) : null}
      <div className='mt-4'>{content}</div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('documentsAdmin.deleteConfirm.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('documentsAdmin.deleteConfirm.description', {
                title: pendingDelete?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => {
                void confirmDelete();
              }}
            >
              {t('actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Outlet context={{ reload }} />
    </PageContainer>
  );
}
