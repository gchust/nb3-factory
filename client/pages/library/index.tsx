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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
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

import { LibraryDocumentDeleteDialog } from './library-document-delete-dialog.js';
import { fetchLibraryDocuments } from './library-api.js';
import { LibraryDocumentBadges } from './status-badges.js';
import type { LibraryDocument, LibraryListOutletContext } from './types.js';
import { useLibraryPermissions } from './use-library-permissions.js';

/** `/library`: the document list, the create dialog and the detail drawer all mount here. */
export default function LibraryPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const { canCreate, canDelete, canEdit } = useLibraryPermissions();

  const [refreshKey, setRefreshKey] = useState(0);
  const requestKey = String(refreshKey);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly documents?: LibraryDocument[];
    readonly error?: unknown;
  }>();

  const reload = useCallback(() => setRefreshKey((key) => key + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const key = String(refreshKey);
    fetchLibraryDocuments(api, controller.signal).then(
      (list) => {
        if (!controller.signal.aborted)
          setResult({ key, documents: list.data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, refreshKey]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const documents = loading ? undefined : result?.documents;

  // After a delete in the drawer, its row and the link that opened it disappear once the list refreshes: wait for the
  // reload, then move focus to the "New" button (guideline A6). A row-menu delete moves focus back to the menu trigger.
  const rowMenuRef = useRef<HTMLButtonElement>(null);
  const focusAfterReloadRef = useRef<'new' | 'list' | null>(null);
  useEffect(() => {
    if (loading || focusAfterReloadRef.current === null) return;
    const target = focusAfterReloadRef.current;
    focusAfterReloadRef.current = null;
    if (target === 'new') newButtonRef.current?.focus();
    else rowMenuRef.current?.focus();
  }, [loading]);
  const newButtonRef = useRef<HTMLButtonElement>(null);

  const outletContext = useMemo<LibraryListOutletContext>(
    () => ({
      reload,
      afterDelete: () => {
        focusAfterReloadRef.current = 'new';
        reload();
      },
      onSaved: reload,
      onNotFound: reload,
    }),
    [reload],
  );

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

  const columns = useMemo<ColumnDef<LibraryDocument>[]>(() => {
    const base: ColumnDef<LibraryDocument>[] = [
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
            className='font-medium hover:underline'
            to={{ pathname: row.original.id, search: location.search }}
          >
            {row.original.title}
          </Link>
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
        id: 'status',
        header: t('library.fields.status'),
        cell: ({ row }) => (
          <LibraryDocumentBadges
            confidential={row.original.confidential}
            published={row.original.published}
          />
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
    ];
    if (canEdit || canDelete) {
      base.push({
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
                    aria-label={t('library.actions.more', {
                      name: row.original.title,
                    })}
                    ref={rowMenuRef}
                    size='icon-sm'
                    variant='ghost'
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
        ),
      });
    }
    return base;
  }, [canDelete, canEdit, dateFormat, location.search, t]);

  let content: ReactElement;
  if (error) {
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
            <Button onClick={reload} size='sm' variant='outline'>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (documents === undefined) {
    content = <TableSkeleton label={t('status.loading')} />;
  } else if (documents.length === 0) {
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
              nativeButton={false}
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
              variant='outline'
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
        data={documents}
        emptyMessage={t('library.empty.noResults')}
        getRowId={(row) => row.id}
        showSelectedCount={false}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          canCreate ? (
            <Button
              nativeButton={false}
              ref={newButtonRef}
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
            >
              <PlusIcon data-icon='inline-start' />
              {t('library.create.action')}
            </Button>
          ) : undefined
        }
        description={t('library.description')}
        title={t('library.title')}
      />
      {content}

      <LibraryDocumentDeleteDialog
        deletedFocusRef={rowMenuRef}
        document={deletion.document}
        onDeleted={() => {
          setDeletion((current) => ({ ...current, open: false }));
          reload();
        }}
        onOpenChange={(open) =>
          setDeletion((current) => ({ ...current, open }))
        }
        open={deletion.open}
      />

      {/* The create dialog, the detail drawer and a row's edit dialog render here with the list's refresh callbacks. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function TableSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div
      aria-label={label}
      className='overflow-hidden rounded-lg border'
      role='status'
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          className='flex items-center gap-4 border-b px-4 py-3 last:border-b-0'
          key={index}
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
