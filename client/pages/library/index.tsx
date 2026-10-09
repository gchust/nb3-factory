import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  FileTextIcon,
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
  useRef,
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { DocumentDeleteDialog } from './document-delete-dialog.js';
import { DocumentFlags } from './document-flags.js';
import type {
  LibraryDocument,
  LibraryDocumentList,
  LibraryEditOutletContext,
  LibraryOutletContext,
} from './types.js';

const PAGE_SIZE = 100;

export default function LibraryDocumentsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const newButtonRef = useRef<HTMLButtonElement>(null);

  // Load the list. An effect must not call setState synchronously: store the
  // result only in the request callbacks, and derive "loading" from whether
  // the result belongs to the current request.
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: LibraryDocument[];
    readonly canCreate?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    api
      .request<LibraryDocumentList>({
        path: 'library/documents',
        query: { page: 1, pageSize: PAGE_SIZE },
        signal: controller.signal,
      })
      .then(
        ({ data, meta }) => {
          if (!controller.signal.aborted) {
            setResult({ key, rows: data, canCreate: meta.canCreate });
          }
        },
        (error: unknown) => {
          // Keep the previous batch on failure: after "Retry", show the old
          // data and a small Spinner, not the skeleton.
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== String(reloadCount);
  const error = loading ? undefined : result?.error;
  // While reloading, rows is still the previous batch.
  const rows = result?.rows;
  const canCreate = result?.canCreate ?? false;

  // After a record is deleted, its row disappears once the list refreshes:
  // wait for the refresh to finish, then move focus to a stable control.
  const focusNewAfterReloadRef = useRef(false);
  useEffect(() => {
    if (loading || !focusNewAfterReloadRef.current) return;
    focusNewAfterReloadRef.current = false;
    newButtonRef.current?.focus();
  }, [loading]);

  // Keep the context passed to child routes stable; otherwise effects in child
  // routes that depend on it run again and again. The list opens the create
  // dialog, the drawer and a row's edit dialog, so it passes what each reads.
  const outletContext = useMemo<
    LibraryOutletContext & LibraryEditOutletContext
  >(
    () => ({
      reload,
      afterDelete: () => {
        focusNewAfterReloadRef.current = true;
        reload();
      },
      onSaved: () => reload(),
      onNotFound: reload,
    }),
    [reload],
  );

  // The delete confirmation dialog uses component state. Store the open state
  // and the target separately: closing changes only open, so the title stays
  // the same during the exit animation.
  const [deletion, setDeletion] = useState<{
    readonly open: boolean;
    readonly document: LibraryDocument | null;
  }>({ open: false, document: null });

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const columns = useMemo<ColumnDef<LibraryDocument>[]>(
    () => [
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
          // The title links to the detail child route and keeps the current
          // query parameters.
          <Link
            to={{ pathname: row.original.id, search: location.search }}
            className='font-medium hover:underline'
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'published',
        header: t('library.fields.visibility'),
        cell: ({ row }) => (
          <DocumentFlags
            published={row.original.published}
            confidential={row.original.confidential}
          />
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
            {dateFormat.format(new Date(row.original.updatedAt))}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('library.actions.label')}</span>
        ),
        cell: ({ row }) => {
          const { canEdit, canDelete } = row.original;
          // A caller with neither permission sees no menu at all: the server
          // would refuse both actions, so offering them would be a dead end.
          if (!canEdit && !canDelete) {
            return null;
          }
          return (
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
                      {/* Edit is the list's own child route, edit/:documentId:
                          the menu item is a link, and the dialog opens alone
                          over the list instead of stacked on the drawer. */}
                      <DropdownMenuItem
                        render={
                          <Link
                            to={{
                              pathname: `edit/${encodeURIComponent(row.original.id)}`,
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
                  {canEdit && canDelete ? <DropdownMenuSeparator /> : null}
                  {canDelete ? (
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
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [dateFormat, location.search, t],
  );

  // Check in the order "failed → first load → empty → data".
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
  } else if (rows === undefined) {
    content = <TableSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0) {
    content = (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <FileTextIcon />
          </EmptyMedia>
          <EmptyTitle>{t('library.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('library.empty.description')}</EmptyDescription>
        </EmptyHeader>
        {canCreate ? (
          <EmptyContent>
            <Button
              variant='outline'
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
              nativeButton={false}
            >
              <PlusIcon data-icon='inline-start' />
              {t('library.create.action')}
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
        getRowId={(row) => row.id}
        showSelectedCount={false}
        emptyMessage={t('library.empty.noResults')}
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
              ref={newButtonRef}
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
              nativeButton={false}
            >
              <PlusIcon data-icon='inline-start' />
              {t('library.create.action')}
            </Button>
          ) : undefined
        }
      />
      {/* Reloading keeps the old data and shows only a small Spinner. */}
      {loading && rows !== undefined ? (
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
        deletedFocusRef={newButtonRef}
      />

      {/* The create dialog, the detail drawer and a row's edit dialog render
          here and get the list's refresh functions from context. */}
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
          <Skeleton className='h-5 w-20 rounded-full' />
          <Skeleton className='h-4 w-24' />
          <Skeleton className='ml-auto h-4 w-28' />
        </div>
      ))}
    </div>
  );
}
