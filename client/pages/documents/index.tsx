import { useApiClient, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircle,
  Download,
  Eye,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

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
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  FilePreviewDialog,
  FileThumbnail,
  FileUploadField,
  clientFileRepositoryManagerToken,
  type ClientFileRepository,
  type FileRecord,
  type FileUploadStatus,
} from '@/extensions/nocobase-file-component-ui/index';

const ATTACHMENT_REPOSITORY = 'documentAttachments';
const ACCEPTED_FILE_TYPES = ['image/*', '.docx'] as const;

interface DocumentItem {
  readonly id: string;
  readonly title: string;
  readonly attachmentId: string | null;
  readonly attachment: FileRecord | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface CreateDocumentPayload {
  readonly title: string;
  readonly attachmentId: string | null;
}

/**
 * 资料附件 (#252): the minimal document page. It reads the two seeded
 * documents, creates more, and attaches, previews, downloads or removes one
 * uploaded file per document. The upload itself is the File plugin's client
 * field; this page only stores the association, so the metadata and preview
 * survive a refresh.
 */
export default function DocumentsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const fileManager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => fileManager.repository(ATTACHMENT_REPOSITORY),
    [fileManager],
  );

  const [documents, setDocuments] = useState<readonly DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string>();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentItem>();
  const [previewing, setPreviewing] = useState<DocumentItem>();
  const [removing, setRemoving] = useState<DocumentItem>();
  const [busy, setBusy] = useState(false);

  const fetchDocuments = useCallback(async (): Promise<
    readonly DocumentItem[]
  > => {
    const { data } = await api.request<{ data?: DocumentItem[] }>({
      path: '/documents',
    });
    return Array.isArray(data) ? data : [];
  }, [api]);

  // State is written only from the promise callbacks, so the effect body itself
  // never triggers a synchronous cascading render.
  useEffect(() => {
    let active = true;
    void fetchDocuments()
      .then((items) => {
        if (!active) return;
        setDocuments(items);
        setPageError(undefined);
      })
      .catch((cause: unknown) => {
        if (active)
          setPageError(errorMessage(cause, t('documents.loadFailed')));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchDocuments, t]);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setPageError(undefined);
    try {
      setDocuments(await fetchDocuments());
    } catch (cause) {
      setPageError(errorMessage(cause, t('documents.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [fetchDocuments, t]);

  const openCreate = (): void => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (document: DocumentItem): void => {
    setEditing(document);
    setFormOpen(true);
  };

  const removeAttachment = async (): Promise<void> => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.request({
        path: `/documents/${removing.id}`,
        method: 'PATCH',
        json: { attachmentId: null } satisfies Partial<CreateDocumentPayload>,
      });
      setRemoving(undefined);
      await refresh();
    } catch (cause) {
      setPageError(errorMessage(cause, t('documents.removeFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('documents.title')}
        description={t('documents.description')}
        actions={
          <Button type='button' onClick={openCreate}>
            <Plus aria-hidden='true' />
            {t('documents.new')}
          </Button>
        }
      />

      {pageError ? (
        <Alert variant='destructive'>
          <AlertCircle aria-hidden='true' />
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <p className='text-sm text-muted-foreground' role='status'>
          {t('documents.loading')}
        </p>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className='pt-6'>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <Paperclip aria-hidden='true' />
                </EmptyMedia>
                <EmptyTitle>{t('documents.emptyTitle')}</EmptyTitle>
                <EmptyDescription>
                  {t('documents.emptyDescription')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {documents.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              onEdit={() => openEdit(document)}
              onPreview={() => setPreviewing(document)}
              onDownload={() => downloadFile(document.attachment)}
              onRemove={() => setRemoving(document)}
            />
          ))}
        </div>
      )}

      <DocumentFormDialog
        open={formOpen}
        document={editing}
        repository={repository}
        onOpenChange={setFormOpen}
        onSaved={() => {
          setFormOpen(false);
          void refresh();
        }}
      />

      {previewing?.attachment ? (
        <FilePreviewDialog
          files={[previewing.attachment]}
          open
          onOpenChange={(open) => {
            if (!open) setPreviewing(undefined);
          }}
          onError={(error) => setPageError(error.message)}
        />
      ) : null}

      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('documents.removeAttachmentTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('documents.removeAttachmentDescription', {
                title: removing?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => void removeAttachment()}
            >
              {busy
                ? t('documents.removing')
                : t('documents.removeAttachmentConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

interface DocumentCardProps {
  readonly document: DocumentItem;
  readonly onEdit: () => void;
  readonly onPreview: () => void;
  readonly onDownload: () => void;
  readonly onRemove: () => void;
}

function DocumentCard(inputProps: DocumentCardProps): ReactElement {
  const { t } = useTranslation();
  const { document, onEdit, onPreview, onDownload, onRemove } = inputProps;
  const attachment = document.attachment;

  return (
    <Card>
      <CardHeader>
        <CardTitle className='truncate'>{document.title}</CardTitle>
        <CardAction>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label={t('documents.edit', { title: document.title })}
            onClick={onEdit}
          >
            <Pencil aria-hidden='true' />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {attachment ? (
          <Attachment className='w-full'>
            <AttachmentMedia>
              <FileThumbnail file={attachment} />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle title={attachment.filename}>
                {attachment.filename}
              </AttachmentTitle>
              <AttachmentDescription>
                {describeFile(attachment)}
              </AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction
                type='button'
                aria-label={t('documents.previewFile', {
                  filename: attachment.filename,
                })}
                onClick={onPreview}
              >
                <Eye aria-hidden='true' />
              </AttachmentAction>
              <AttachmentAction
                type='button'
                aria-label={t('documents.downloadFile', {
                  filename: attachment.filename,
                })}
                onClick={onDownload}
              >
                <Download aria-hidden='true' />
              </AttachmentAction>
              <AttachmentAction
                type='button'
                aria-label={t('documents.removeAttachment', {
                  filename: attachment.filename,
                })}
                onClick={onRemove}
              >
                <Trash2 aria-hidden='true' />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('documents.noAttachment')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface DocumentFormDialogProps {
  readonly open: boolean;
  readonly document?: DocumentItem;
  readonly repository: ClientFileRepository;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}

function DocumentFormDialog(inputProps: DocumentFormDialogProps): ReactElement {
  const {
    open,
    document: editing,
    repository,
    onOpenChange,
    onSaved,
  } = inputProps;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DocumentForm
          // Remounting on each open, and on a different document, gives the form
          // fresh initial state instead of a reset effect.
          key={editing?.id ?? 'new'}
          document={editing}
          repository={repository}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

interface DocumentFormProps {
  readonly document?: DocumentItem;
  readonly repository: ClientFileRepository;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

function DocumentForm(inputProps: DocumentFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { document: editing, repository, onClose, onSaved } = inputProps;
  const [title, setTitle] = useState(editing?.title ?? '');
  const [files, setFiles] = useState<readonly FileRecord[]>(
    editing?.attachment ? [editing.attachment] : [],
  );
  const [uploadStatus, setUploadStatus] = useState<FileUploadStatus>('idle');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async (): Promise<void> => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t('documents.titleRequired'));
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const payload: CreateDocumentPayload = {
        title: trimmed,
        attachmentId: files[0]?.id ?? null,
      };
      if (editing) {
        await api.request({
          path: `/documents/${editing.id}`,
          method: 'PATCH',
          json: payload,
        });
      } else {
        await api.request({
          path: '/documents',
          method: 'POST',
          json: payload,
        });
      }
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause, t('documents.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {editing ? t('documents.editTitle') : t('documents.createTitle')}
        </DialogTitle>
        <DialogDescription>{t('documents.formDescription')}</DialogDescription>
      </DialogHeader>
      <div className='space-y-4'>
        <Field>
          <FieldLabel htmlFor='document-title'>
            {t('documents.titleLabel')}
          </FieldLabel>
          <Input
            id='document-title'
            value={title}
            maxLength={200}
            placeholder={t('documents.titlePlaceholder')}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{t('documents.attachmentLabel')}</FieldLabel>
          <FileUploadField
            repository={repository}
            value={files}
            onChange={(next) => setFiles([...next])}
            onStatusChange={setUploadStatus}
            onError={(cause) =>
              setError(errorMessage(cause, t('documents.uploadFailed')))
            }
            accept={ACCEPTED_FILE_TYPES}
            maxFiles={1}
            labels={{
              choose: t('documents.chooseFile'),
              empty: t('documents.noFileChosen'),
              remove: t('documents.removeFile'),
              retry: t('documents.retryUpload'),
            }}
          />
          <p className='text-xs text-muted-foreground'>
            {t('documents.attachmentHint')}
          </p>
        </Field>
        {error ? (
          <Alert variant='destructive'>
            <AlertCircle aria-hidden='true' />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
      <DialogFooter>
        <Button
          type='button'
          variant='outline'
          disabled={saving}
          onClick={onClose}
        >
          {t('actions.cancel')}
        </Button>
        <Button
          type='button'
          disabled={saving || uploadStatus === 'uploading'}
          onClick={() => void submit()}
        >
          {saving ? t('documents.saving') : t('actions.save')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function formatFileSize(size: FileRecord['size']): string {
  const value = typeof size === 'string' ? Number(size) : size;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '';
  }
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function describeFile(file: FileRecord): string {
  const size = formatFileSize(file.size);
  return size ? `${file.mimeType} · ${size}` : file.mimeType;
}

function downloadFile(file: FileRecord | null): void {
  if (!file?.contentUrl) return;
  const link = document.createElement('a');
  link.href = file.contentUrl;
  link.download = file.filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
