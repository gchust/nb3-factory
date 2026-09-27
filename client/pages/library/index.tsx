import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef, Table as TableInstance } from '@tanstack/react-table';
import {
  FileTextIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  Share2Icon,
  Trash2Icon,
} from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, Outlet, useNavigate } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

import type { DocumentRecord, LibraryOutletContext } from './types.js';

const COMPOSITE = { type: 'composite', id: 'library.documents' } as const;
const SHARING_SETTINGS = 'authorization.sharing-rules';

/** A draft is not published; a confidential document is beyond every reader's floor. */
function StatusBadges({
  document,
}: {
  readonly document: DocumentRecord;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Badge variant={document.published ? 'secondary' : 'outline'}>
        {document.published
          ? t('library.status.published')
          : t('library.status.draft')}
      </Badge>
      {document.confidential ? (
        <Badge variant='destructive'>
          <LockIcon />
          {t('library.status.confidential')}
        </Badge>
      ) : null}
    </div>
  );
}

export default function LibraryPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<DocumentRecord | null>(null);
  const [revision, setRevision] = useState(0);

  const canCreate = useCan({ resource: COMPOSITE, action: 'create' }).can;
  const canEdit = useCan({ resource: COMPOSITE, action: 'edit' }).can;
  const canDelete = useCan({ resource: COMPOSITE, action: 'delete' }).can;
  const canShareSettings = useCan({
    resource: { type: 'settings', id: SHARING_SETTINGS },
    action: 'create',
  }).can;
  const canShare = canShareSettings || canEdit;

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void api
      .request<{ data: DocumentRecord[] }>({
        path: 'library/documents',
        signal: controller.signal,
      })
      .then((response) => {
        if (!active) return;
        setDocuments(response.data);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return;
        setError(
          cause instanceof ApiClientError && cause.status === 403
            ? t('library.error.forbidden')
            : t('library.error.loadFailed'),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, t, revision]);

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return documents;
    return documents.filter((document) =>
      document.title.toLocaleLowerCase().includes(needle),
    );
  }, [documents, search]);

  const confirmDelete = async (): Promise<void> => {
    const target = deleting;
    if (!target) return;
    try {
      await api.request({
        path: `library/documents/${target.id}`,
        method: 'DELETE',
      });
      toast.add({
        type: 'success',
        title: t('library.delete.deleted'),
        description: target.title,
      });
      setDocuments((current) =>
        current.filter((document) => document.id !== target.id),
      );
    } catch (cause: unknown) {
      toast.add({
        type: 'error',
        title: t('library.delete.failed'),
        description:
          cause instanceof ApiClientError && cause.status === 403
            ? t('library.error.forbidden')
            : t('library.error.tryAgain'),
      });
    } finally {
      setDeleting(null);
    }
  };

  const columns = useMemo<ColumnDef<DocumentRecord, unknown>[]>(
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
          <Link
            to={row.original.id}
            className='flex items-center gap-2 font-medium hover:underline'
          >
            <FileTextIcon className='size-4 shrink-0 text-muted-foreground' />
            <span className='truncate'>{row.original.title}</span>
          </Link>
        ),
      },
      {
        id: 'status',
        header: () => t('library.column.status'),
        enableSorting: false,
        cell: ({ row }) => <StatusBadges document={row.original} />,
      },
      {
        id: 'owner',
        accessorFn: (document) => document.ownerName ?? document.ownerId,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('library.column.owner')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {row.original.ownerName ?? row.original.ownerId}
          </span>
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
          <span className='text-muted-foreground tabular-nums'>
            {formatDate(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => (
          <span className='sr-only'>{t('library.column.actions')}</span>
        ),
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div
            className='flex justify-end gap-1'
            onClick={(event) => event.stopPropagation()}
          >
            {canShare ? (
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t('library.action.share')}
                title={t('library.action.share')}
                render={<Link to={`${row.original.id}/share`} />}
              >
                <Share2Icon />
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t('library.action.edit')}
                title={t('library.action.edit')}
                render={<Link to={`${row.original.id}/edit`} />}
              >
                <PencilIcon />
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t('library.action.delete')}
                title={t('library.action.delete')}
                onClick={() => setDeleting(row.original)}
              >
                <Trash2Icon />
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [canDelete, canEdit, canShare, t],
  );

  const toolbar = (table: TableInstance<DocumentRecord>) => (
    <>
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('library.search')}
        className='max-w-xs'
      />
      <DataTableViewOptions
        table={table}
        getColumnLabel={(column) => t(`library.column.${column.id}`)}
      />
    </>
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('library.title')}
        description={t('library.description')}
        actions={
          canCreate ? (
            <Button render={<Link to='new' />}>
              <PlusIcon />
              {t('library.new')}
            </Button>
          ) : null
        }
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.error.title')}</AlertTitle>
          <AlertDescription className='flex items-center justify-between gap-3'>
            {error}
            <Button variant='outline' size='sm' onClick={reload}>
              {t('library.error.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <div className='flex items-center justify-center py-16 text-muted-foreground'>
          <Spinner />
        </div>
      ) : visible.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {documents.length === 0
                ? t('library.empty.title')
                : t('library.empty.noMatch')}
            </EmptyTitle>
            <EmptyDescription>
              {documents.length === 0
                ? t('library.empty.description')
                : t('library.empty.noMatchDescription')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DataTable
          columns={columns}
          data={visible}
          pageSize={10}
          getRowId={(document) => document.id}
          emptyMessage={t('library.empty.noMatch')}
          toolbar={toolbar}
          onRowClick={(row) => {
            void navigate(String(row.original.id));
          }}
        />
      )}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('library.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('library.delete.description', {
                title: deleting?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('library.form.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => void confirmDelete()}
            >
              {t('library.action.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create, edit, detail and sharing are child routes; the list reloads underneath them. */}
      <Outlet context={{ reload } satisfies LibraryOutletContext} />
    </PageContainer>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}
