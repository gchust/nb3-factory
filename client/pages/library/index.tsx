import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { KeyRoundIcon, MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
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
import { Badge } from '@/components/ui/badge';
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
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';

import { deleteDocument, fetchDocuments } from './api.js';
import { DocumentDetailSheet } from './document-detail-sheet.js';
import { DocumentFormDialog } from './document-form-dialog.js';
import { libraryErrorKey } from './errors.js';
import { SharePanel } from './share-panel.js';
import type { LibraryDocument, LibraryDocumentList } from './types.js';

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function StatusBadges({
  document,
}: {
  readonly document: LibraryDocument;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-wrap gap-1.5'>
      <Badge variant={document.published ? 'default' : 'outline'}>
        {document.published
          ? t('library.status.published')
          : t('library.status.draft')}
      </Badge>
      {document.confidential ? (
        <Badge variant='destructive'>{t('library.status.confidential')}</Badge>
      ) : null}
    </div>
  );
}

/**
 * The internal document library.
 *
 * The list is the server's answer for the signed-in account, not the whole
 * table: a reader sees published, non-confidential documents, plus anything an
 * administrator has temporarily opened; an author sees their own drafts as
 * well. Each row carries the server's `canEdit` and `canDelete` decisions, so
 * "may read" never silently becomes "may write".
 */
export default function LibraryPage(): ReactElement {
  const api = useApiClient();
  const toaster = useToaster();
  const { t } = useTranslation();
  const [list, setList] = useState<LibraryDocumentList | null>(null);
  const [failed, setFailed] = useState(false);
  const [detail, setDetail] = useState<LibraryDocument | null>(null);
  const [form, setForm] = useState<{ document: LibraryDocument | null } | null>(
    null,
  );
  // Bumped each time the form opens. It keys the dialog so a fresh instance
  // mounts with the selected document instead of an effect resetting the
  // fields, while closing keeps the mounted dialog for its exit animation.
  const [formKey, setFormKey] = useState(0);
  const [confirming, setConfirming] = useState<LibraryDocument | null>(null);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const openForm = (document: LibraryDocument | null): void => {
    setForm({ document });
    setFormKey((key) => key + 1);
  };

  const reload = useCallback(
    (): Promise<void> =>
      fetchDocuments(api).then(
        (data) => {
          setList(data);
          setFailed(false);
        },
        (error: unknown) => {
          setFailed(true);
          toaster.show({
            type: 'error',
            title: t(libraryErrorKey(error, 'library.loadFailed')),
          });
        },
      ),
    [api, toaster, t],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const confirmDelete = async (): Promise<void> => {
    if (!confirming) return;
    setDeleting(true);
    try {
      await deleteDocument(api, confirming.id);
      setConfirming(null);
      await reload();
      toaster.show({ type: 'success', title: t('library.delete.done') });
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t(libraryErrorKey(error, 'library.actionFailed')),
      });
    } finally {
      setDeleting(false);
    }
  };

  const canShare = list?.canShare ?? false;
  const documents = list?.items ?? [];

  const columns = useMemo<ColumnDef<LibraryDocument, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('library.columns.title')}
          />
        ),
        cell: ({ row }) => (
          <button
            type='button'
            className='text-left font-medium hover:underline'
            onClick={() => setDetail(row.original)}
          >
            {row.original.title}
          </button>
        ),
      },
      {
        id: 'owner',
        accessorFn: (document) => document.ownerName ?? document.ownerId,
        header: t('library.columns.owner'),
        cell: ({ row }) => row.original.ownerName ?? row.original.ownerId,
      },
      {
        id: 'status',
        header: t('library.columns.status'),
        cell: ({ row }) => <StatusBadges document={row.original} />,
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('library.columns.updatedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {formatTime(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => (
          <span className='sr-only'>{t('library.columns.actions')}</span>
        ),
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const document = row.original;
          const showMenu = document.canEdit || document.canDelete || canShare;
          if (!showMenu) return null;
          return (
            <div className='flex justify-end'>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label={t('library.columns.actionsFor', {
                        title: document.title,
                      })}
                    />
                  }
                >
                  <MoreHorizontalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuGroup>
                    {document.canEdit ? (
                      <DropdownMenuItem onClick={() => openForm(document)}>
                        {t('library.actions.edit')}
                      </DropdownMenuItem>
                    ) : null}
                    {canShare ? (
                      <DropdownMenuItem onClick={() => setSharing(true)}>
                        <KeyRoundIcon />
                        {t('library.actions.share')}
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuGroup>
                  {document.canDelete ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant='destructive'
                        onClick={() => setConfirming(document)}
                      >
                        {t('library.actions.delete')}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [canShare, t],
  );

  let body: ReactNode;
  if (list === null) {
    body = failed ? (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('library.loadFailed')}</EmptyTitle>
          <EmptyDescription>
            {t('library.loadFailedDescription')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : (
      <div className='space-y-2'>
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    );
  } else if (!list.canRead) {
    body = (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('library.noReadAccess')}</EmptyTitle>
          <EmptyDescription>
            {t('library.noReadAccessDescription')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    body = (
      <DataTable
        columns={columns}
        data={documents}
        getRowId={(document) => String(document.id)}
        emptyMessage={
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t('library.empty.title')}</EmptyTitle>
              <EmptyDescription>
                {t('library.empty.description')}
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
        title={t('library.title')}
        description={t('library.description')}
        actions={
          <>
            {canShare ? (
              <Button variant='outline' onClick={() => setSharing(true)}>
                <KeyRoundIcon data-icon='inline-start' />
                {t('library.actions.share')}
              </Button>
            ) : null}
            {list?.canCreate ? (
              <Button onClick={() => openForm(null)}>
                <PlusIcon data-icon='inline-start' />
                {t('library.actions.new')}
              </Button>
            ) : null}
          </>
        }
      />
      {body}
      <DocumentDetailSheet
        document={detail}
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />
      <DocumentFormDialog
        key={formKey}
        document={form?.document ?? null}
        open={form !== null}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
        onSaved={() => void reload()}
      />
      <SharePanel
        open={sharing}
        onOpenChange={setSharing}
        documents={documents}
      />
      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('library.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('library.delete.description', {
                title: confirming?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('library.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {t('library.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
