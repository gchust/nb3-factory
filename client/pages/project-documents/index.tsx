import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  EyeIcon,
  FileStackIcon,
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
  useState,
} from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileList,
  FileThumbnail,
} from '@/extensions/nocobase-file-component-ui';

import { createProjectDocumentApi, type ProjectDocument } from './document-api';
import { DocumentForm, type DocumentFormSubmission } from './document-form';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Project documents — the list of the signed-in user's own titled records and
 * the attachments each one carries.
 *
 * The list, the detail panel and the form all talk to `/api/project-documents`,
 * which scopes every read and write to the session user. Nothing here filters
 * by owner: a document that is not yours is not in the response at all, and a
 * guessed attachment URL answers 404 rather than somebody else's bytes.
 */
export default function ProjectDocumentsPage(): ReactElement {
  const api = useApiClient();
  const toaster = useToaster();
  const { t, i18n } = useTranslation();

  const documentApi = useMemo(() => createProjectDocumentApi(api), [api]);
  const repository = useMemo(() => documentApi.attachments(), [documentApi]);

  const [documents, setDocuments] = useState<readonly ProjectDocument[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [editor, setEditor] = useState<ProjectDocument | null>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [detail, setDetail] = useState<ProjectDocument | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectDocument | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback((): void => {
    setLoadState('loading');
    setReloadToken((token) => token + 1);
  }, []);

  // The initial load and every reload after a save or delete run through this
  // effect, so the state updates arrive from the request's callbacks rather
  // than synchronously from the effect body.
  useEffect(() => {
    let active = true;
    void documentApi.list().then(
      (records) => {
        if (!active) return;
        setDocuments(records);
        setLoadState('ready');
      },
      () => {
        if (!active) return;
        setLoadState('error');
      },
    );
    return () => {
      active = false;
    };
  }, [documentApi, reloadToken]);

  const reportError = useCallback(
    (title: string, error: unknown): void => {
      toaster.show({
        type: 'error',
        title,
        description:
          error instanceof Error
            ? error.message
            : t('projectDocuments.error.unknown'),
      });
    },
    [t, toaster],
  );

  const openCreate = useCallback((): void => {
    setEditor(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((document: ProjectDocument): void => {
    setEditor(document);
    setEditorOpen(true);
  }, []);

  const handleSubmit = useCallback(
    async ({ title, files }: DocumentFormSubmission): Promise<void> => {
      setSaving(true);
      try {
        const input = { title, fileIds: files.map((file) => file.id) };
        const saved = editor
          ? await documentApi.update(editor.id, input)
          : await documentApi.create(input);
        setEditorOpen(false);
        setEditor(undefined);
        setDetail((current) => (current?.id === saved.id ? saved : current));
        toaster.show({
          type: 'success',
          title: t('projectDocuments.saved'),
        });
        reload();
      } catch (error) {
        // The dialog stays open, so the uploaded attachments survive the failed
        // save and adding a title is enough to try again.
        reportError(t('projectDocuments.saveFailed'), error);
      } finally {
        setSaving(false);
      }
    },
    [documentApi, editor, reload, reportError, t, toaster],
  );

  const handleUploadError = useCallback(
    (error: Error): void => {
      reportError(t('projectDocuments.uploadFailed'), error);
    },
    [reportError, t],
  );

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await documentApi.remove(pendingDelete.id);
      setDetail((current) =>
        current?.id === pendingDelete.id ? null : current,
      );
      setPendingDelete(null);
      toaster.show({
        type: 'success',
        title: t('projectDocuments.deleted'),
      });
      reload();
    } catch (error) {
      reportError(t('projectDocuments.deleteFailed'), error);
    } finally {
      setDeleting(false);
    }
  }, [documentApi, pendingDelete, reload, reportError, t, toaster]);

  const formatDate = useCallback(
    (value: string): string =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value)),
    [i18n.language],
  );

  const columns = useMemo<ColumnDef<ProjectDocument>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('projectDocuments.column.title')}
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
        id: 'attachments',
        header: t('projectDocuments.column.attachments'),
        cell: ({ row }) => <AttachmentPreview files={row.original.files} />,
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('projectDocuments.column.updatedAt')}
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
          <span className='sr-only'>
            {t('projectDocuments.column.actions')}
          </span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type='button'
                    size='icon'
                    variant='ghost'
                    aria-label={t('projectDocuments.actions.open')}
                  />
                }
              >
                <MoreHorizontalIcon aria-hidden='true' />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => setDetail(row.original)}>
                    <EyeIcon aria-hidden='true' />
                    {t('projectDocuments.actions.view')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openEdit(row.original)}>
                    <PencilIcon aria-hidden='true' />
                    {t('projectDocuments.actions.edit')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant='destructive'
                    onClick={() => setPendingDelete(row.original)}
                  >
                    <Trash2Icon aria-hidden='true' />
                    {t('projectDocuments.actions.delete')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [formatDate, openEdit, t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('projectDocuments.title')}
        description={t('projectDocuments.description')}
        actions={
          <Button type='button' onClick={openCreate}>
            <PlusIcon data-icon='inline-start' aria-hidden='true' />
            {t('projectDocuments.new')}
          </Button>
        }
      />

      {loadState === 'error' ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('projectDocuments.loadFailed')}</AlertTitle>
          <AlertDescription>
            <Button type='button' variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : loadState === 'loading' ? (
        <div className='space-y-2'>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className='h-14 w-full' />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <FileStackIcon aria-hidden='true' />
            </EmptyMedia>
            <EmptyTitle>{t('projectDocuments.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {t('projectDocuments.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type='button' onClick={openCreate}>
              <PlusIcon data-icon='inline-start' aria-hidden='true' />
              {t('projectDocuments.new')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <DataTable
          columns={columns}
          data={[...documents]}
          getRowId={(row) => row.id}
        />
      )}

      {editorOpen ? (
        <DocumentForm
          repository={repository}
          title={editor?.title}
          files={editor?.files}
          saving={saving}
          onOpenChange={(open) => {
            setEditorOpen(open);
            if (!open) setEditor(undefined);
          }}
          onSubmit={(submission) => void handleSubmit(submission)}
          onUploadError={handleUploadError}
        />
      ) : null}

      <Sheet
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <SheetContent className='flex flex-col sm:max-w-lg'>
          {detail ? (
            <>
              <SheetHeader>
                <SheetTitle>{detail.title}</SheetTitle>
                <SheetDescription>
                  {t('projectDocuments.detail.created', {
                    date: formatDate(detail.createdAt),
                  })}
                </SheetDescription>
              </SheetHeader>
              <div className='min-h-0 flex-1 overflow-y-auto px-4'>
                <FileList files={detail.files} onError={handleUploadError} />
              </div>
              <div className='mt-4 flex justify-end gap-2 border-t p-4'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => openEdit(detail)}
                >
                  <PencilIcon data-icon='inline-start' aria-hidden='true' />
                  {t('projectDocuments.actions.edit')}
                </Button>
                <Button
                  type='button'
                  variant='destructive'
                  onClick={() => setPendingDelete(detail)}
                >
                  <Trash2Icon data-icon='inline-start' aria-hidden='true' />
                  {t('projectDocuments.actions.delete')}
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('projectDocuments.deleteConfirm.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('projectDocuments.deleteConfirm.description', {
                title: pendingDelete?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {t('projectDocuments.actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

/** The attachments of one row, as a few thumbnails and a count. Opens nothing; the detail panel does that. */
function AttachmentPreview({
  files,
}: {
  readonly files: ProjectDocument['files'];
}): ReactElement {
  const { t } = useTranslation();
  if (!files.length) {
    return (
      <span className='text-muted-foreground'>
        {t('projectDocuments.noAttachments')}
      </span>
    );
  }
  return (
    <div className='flex items-center gap-2'>
      <div className='flex items-center gap-1'>
        {files.slice(0, 3).map((file) => (
          <span
            key={file.id}
            className='size-8 overflow-hidden rounded-md border'
          >
            <FileThumbnail file={file} />
          </span>
        ))}
      </div>
      <Badge variant='secondary'>
        {t('projectDocuments.attachmentCount', { count: files.length })}
      </Badge>
    </div>
  );
}
