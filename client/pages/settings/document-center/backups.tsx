import { useApiClient, useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  DatabaseBackupIcon,
  HistoryIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet } from 'react-router';

import { DataTable } from '@/components/data-table';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  createBackup,
  deleteBackup,
  documentCenterErrorKey,
  formatDateTime,
  listBackups,
  type Backup,
} from '@/lib/document-center';

/** The backups administration page: the snapshots that can restore every document. */
export default function DocumentCenterBackupsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const toaster = useToaster();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly rows?: readonly Backup[];
    readonly error?: unknown;
  }>();
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Backup | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    listBackups(api, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, rows });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const rows = result?.rows;
  const error = result?.error;

  async function create(): Promise<void> {
    setCreating(true);
    try {
      await createBackup(api);
      toaster.show({
        type: 'success',
        title: t('documentsAdmin.backups.created'),
      });
      reload();
    } catch (failure) {
      toaster.show({
        type: 'error',
        title: t(`documents.error.${documentCenterErrorKey(failure)}`),
      });
    } finally {
      setCreating(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    const backup = pendingDelete;
    setPendingDelete(null);
    if (!backup) return;
    setBusy(true);
    try {
      await deleteBackup(api, backup.id);
      toaster.show({
        type: 'success',
        title: t('documentsAdmin.backups.deleted'),
      });
      reload();
    } catch (failure) {
      toaster.show({
        type: 'error',
        title: t(`documents.error.${documentCenterErrorKey(failure)}`),
      });
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<ColumnDef<Backup>[]>(
    () => [
      {
        id: 'title',
        accessorKey: 'title',
        enableHiding: false,
        header: t('documentsAdmin.backups.column.title'),
        cell: ({ row }) => (
          <span className='font-medium text-foreground'>
            {row.original.title}
          </span>
        ),
      },
      {
        id: 'documentCount',
        accessorKey: 'documentCount',
        enableSorting: false,
        header: t('documentsAdmin.backups.column.documentCount'),
        cell: ({ row }) =>
          t('documentsAdmin.backups.documentCount', {
            count: row.original.documentCount,
          }),
      },
      {
        id: 'versionCount',
        accessorKey: 'versionCount',
        enableSorting: false,
        header: t('documentsAdmin.backups.column.versionCount'),
        cell: ({ row }) =>
          t('documentsAdmin.backups.versionCount', {
            count: row.original.versionCount,
          }),
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        enableHiding: false,
        header: t('documentsAdmin.backups.column.createdAt'),
        cell: ({ row }) => formatDateTime(row.original.createdAt, locale),
      },
      {
        id: 'actions',
        enableHiding: false,
        enableSorting: false,
        header: () => (
          <span className='sr-only'>{t('documents.column.actions')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
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
                <DropdownMenuItem
                  render={<Link to={`${row.original.id}/restore`} />}
                >
                  <HistoryIcon />
                  {t('documentsAdmin.backups.restore')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() => setPendingDelete(row.original)}
                >
                  <Trash2Icon />
                  {t('actions.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [locale, t],
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
        {[0, 1, 2].map((index) => (
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
              <EmptyTitle>{t('documentsAdmin.backups.empty')}</EmptyTitle>
              <EmptyDescription>
                {t('documentsAdmin.backups.emptyDescription')}
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
        title={t('navigation.documentCenterBackups')}
        description={t('documentsAdmin.backups.description')}
        actions={
          <Button
            disabled={creating}
            onClick={() => {
              void create();
            }}
          >
            {creating ? <Spinner /> : <DatabaseBackupIcon />}
            {t('documentsAdmin.backups.create')}
          </Button>
        }
      />
      {content}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('documentsAdmin.backups.deleteConfirm.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('documentsAdmin.backups.deleteConfirm.description', {
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
              {busy ? <Spinner /> : null}
              {t('actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Outlet context={{ reload }} />
    </PageContainer>
  );
}
