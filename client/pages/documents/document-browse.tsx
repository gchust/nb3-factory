import { useApiClient, useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { BookOpenIcon, DownloadIcon, EyeIcon, SearchIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Alert, AlertTitle } from '@/components/ui/alert';
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
import { useUrlSearch } from '@/hooks/use-url-search';
import {
  DOCUMENT_CATEGORIES,
  categoryLabelKey,
  documentCenterErrorKey,
  downloadDocumentFile,
  formatDateTime,
  getDocument,
  listDocuments,
  type DocumentCategory,
  type DocumentSummary,
} from '@/lib/document-center';

/** The endpoint caps a page at 100 records; this list sorts and pages in the browser. */
const PAGE_SIZE = 100;

function isDocumentCategory(value: string | null): value is DocumentCategory {
  return DOCUMENT_CATEGORIES.some((category) => category === value);
}

export function DocumentBrowse(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const toaster = useToaster();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  const { searchParams, search, text, inputProps, updateParams, clear } =
    useUrlSearch();
  const categoryParam = searchParams.get('category');
  const category = isDocumentCategory(categoryParam)
    ? categoryParam
    : undefined;

  function changeCategory(value: string | null): void {
    updateParams((params) => {
      if (value && value !== 'all') params.set('category', value);
      else params.delete('category');
    });
  }

  const hasFilters = text.trim() !== '' || category !== undefined;

  function clearFilters(): void {
    clear((params) => params.delete('category'));
    searchRef.current?.focus();
  }

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([search, category ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: DocumentSummary[];
    readonly filtered?: boolean;
    readonly total?: number;
    readonly error?: unknown;
  }>();
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([search, category ?? null, reloadCount]);
    listDocuments(
      api,
      { q: search || undefined, category, pageSize: PAGE_SIZE },
      controller.signal,
    ).then(
      (list) => {
        if (!controller.signal.aborted) {
          setResult({
            key,
            rows: [...list.data],
            total: list.meta.total,
            filtered: search !== '' || category !== undefined,
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
  }, [api, search, category, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const rowsFiltered = result?.filtered ?? false;
  const capped = (result?.total ?? 0) > (rows?.length ?? 0);

  const download = useCallback(
    async (document: DocumentSummary): Promise<void> => {
      setDownloadingId(document.id);
      try {
        const detail = await getDocument(api, document.id);
        downloadDocumentFile({ title: detail.title, content: detail.content });
      } catch (failure) {
        toaster.show({
          type: 'error',
          title: t(`documents.error.${documentCenterErrorKey(failure)}`),
        });
      } finally {
        setDownloadingId(null);
      }
    },
    [api, t, toaster],
  );

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
          <Link
            className='font-medium text-foreground hover:underline'
            to={{ pathname: String(row.original.id), search: location.search }}
          >
            {row.original.title}
          </Link>
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
        header: t('documents.column.actions'),
        cell: ({ row }) => (
          <div className='flex items-center justify-end gap-2'>
            <Button
              variant='ghost'
              size='sm'
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
              {t('documents.action.preview')}
            </Button>
            <Button
              variant='ghost'
              size='sm'
              disabled={downloadingId === row.original.id}
              onClick={() => {
                void download(row.original);
              }}
            >
              {downloadingId === row.original.id ? (
                <Spinner />
              ) : (
                <DownloadIcon />
              )}
              {t('documents.action.download')}
            </Button>
          </div>
        ),
      },
    ],
    [download, downloadingId, locale, location.search, t],
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
          onClick={() => {
            reload();
            searchRef.current?.focus();
          }}
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
  } else if (rows.length === 0 && !rowsFiltered) {
    content = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <BookOpenIcon />
          </EmptyMedia>
          <EmptyTitle>{t('documents.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('documents.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
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
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>{t('documents.noResults.title')}</EmptyTitle>
              <EmptyDescription>
                {t('documents.noResults.description')}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant='outline' size='sm' onClick={clearFilters}>
                {t('documents.action.clearFilters')}
              </Button>
            </EmptyContent>
          </Empty>
        }
      />
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <InputGroup className='max-w-sm min-w-56 flex-1'>
          <InputGroupAddon>
            <SearchIcon className='size-4 text-muted-foreground' />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
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
            <SelectValue placeholder={t('documents.filter.allCategories')} />
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
        {hasFilters ? (
          <Button variant='ghost' size='sm' onClick={clearFilters}>
            {t('documents.action.clearFilters')}
          </Button>
        ) : null}
        {loading && rows !== undefined ? <Spinner /> : null}
      </div>
      {capped ? (
        <p className='text-sm text-muted-foreground'>
          {t('documents.capNotice', { count: rows?.length ?? 0 })}
        </p>
      ) : null}
      {content}
    </div>
  );
}
