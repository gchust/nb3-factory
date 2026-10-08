import { useCan } from '@nocobase/app-plugin-authorization/client';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { DocumentDeleteDialog } from './document-delete-dialog.js';
import {
  DOCUMENTS_RESOURCE,
  type Document,
  type DocumentList,
  type DocumentsOutletContext,
} from './types.js';

/** The endpoint caps one page at 200; the table paginates the batch in the browser. */
const PAGE_SIZE = 200;

export default function DocumentsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();

  // Whether an action is available at all. Per-record ownership is enforced by
  // the server, which scopes every action to the caller's own documents.
  const { can: canCreate } = useCan({
    resource: { type: 'composite', id: DOCUMENTS_RESOURCE },
    action: 'create',
  });
  const { can: canEdit } = useCan({
    resource: { type: 'composite', id: DOCUMENTS_RESOURCE },
    action: 'edit',
  });
  const { can: canDelete } = useCan({
    resource: { type: 'composite', id: DOCUMENTS_RESOURCE },
    action: 'delete',
  });

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = String(reloadCount);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly documents?: readonly Document[];
    readonly total?: number;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort when the component unmounts or a reload supersedes this request, so an
    // old result never overwrites a new one.
    const controller = new AbortController();
    const key = String(reloadCount);
    api
      .request<DocumentList>({
        path: 'documents',
        query: { limit: PAGE_SIZE },
        signal: controller.signal,
      })
      .then(
        ({ data, meta }) => {
          if (!controller.signal.aborted) {
            setResult({ key, documents: data, total: meta.total });
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const documents = result?.documents;

  const [deletion, setDeletion] = useState<{
    readonly open: boolean;
    readonly document: Document | null;
  }>({ open: false, document: null });

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const columns = useMemo<ColumnDef<Document>[]>(() => {
    const list: ColumnDef<Document>[] = [
      {
        accessorKey: 'title',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('library.fields.title')}
          />
        ),
        cell: ({ row }) => (
          <Link
            to={{ pathname: String(row.original.id), search: location.search }}
            className='font-medium hover:underline'
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('library.fields.code')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'ownerName',
        header: t('library.fields.owner'),
        cell: ({ row }) =>
          row.original.ownerName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'published',
        header: t('library.fields.published'),
        cell: ({ row }) =>
          t(row.original.published ? 'library.flag.yes' : 'library.flag.no'),
      },
      {
        accessorKey: 'confidential',
        header: t('library.fields.confidential'),
        cell: ({ row }) => (
          <span
            className={
              row.original.confidential
                ? 'font-medium text-destructive'
                : 'text-muted-foreground'
            }
          >
            {t(
              row.original.confidential
                ? 'library.flag.yes'
                : 'library.flag.no',
            )}
          </span>
        ),
      },
      {
        accessorKey: 'updatedAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('library.fields.updatedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {row.original.updatedAt
              ? dateFormat.format(new Date(row.original.updatedAt))
              : '—'}
          </span>
        ),
      },
    ];

    if (canEdit || canDelete) {
      list.push({
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('library.actions.label')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('library.actions.more', {
                      title: row.original.title,
                    })}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                {canEdit ? (
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      render={
                        <Link
                          to={{
                            pathname: `${encodeURIComponent(
                              String(row.original.id),
                            )}/edit`,
                            search: location.search,
                          }}
                        />
                      }
                    >
                      <PencilIcon />
                      {t('library.actions.edit')}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                ) : null}
                {canDelete ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        variant='destructive'
                        onClick={() =>
                          setDeletion({ open: true, document: row.original })
                        }
                      >
                        <Trash2Icon />
                        {t('library.actions.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      });
    }

    return list;
  }, [canDelete, canEdit, dateFormat, location.search, t]);

  const outletContext = useMemo<DocumentsOutletContext>(
    () => ({ reload, afterDelete: reload }),
    [reload],
  );

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = <SessionExpiredAlert />;
  } else if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('library.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('library.error.forbidden')
            : t('library.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (documents === undefined) {
    content = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='overflow-hidden rounded-lg border'
      >
        {Array.from({ length: 4 }, (_, index) => (
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
  } else {
    content = (
      <DataTable
        columns={columns}
        data={[...documents]}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('library.title')}
        description={t('library.description')}
        actions={
          canCreate ? (
            <Button
              nativeButton={false}
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
            >
              <PlusIcon data-icon='inline-start' />
              {t('library.create.action')}
            </Button>
          ) : undefined
        }
      />
      {loading && documents !== undefined ? (
        <Spinner className='text-muted-foreground' />
      ) : null}
      {content}

      <DocumentDeleteDialog
        open={deletion.open}
        onOpenChange={(open) =>
          setDeletion((current) => ({ ...current, open }))
        }
        document={deletion.document}
        onDeleted={() => {
          setDeletion((current) => ({ ...current, open: false }));
          reload();
        }}
      />

      {/* The create dialog, the detail drawer and the edit dialog render here. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
