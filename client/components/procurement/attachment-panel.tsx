import { useApiClient, useService } from '@nocobase/app-client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Trash2,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loading } from '@/components/loading';
import {
  attachFiles,
  errorCode,
  listAttachments,
  removeAttachment,
  type Attachment,
  type AttachmentCategory,
  type AttachmentList,
  type AttachmentTargetType,
} from './api.js';
import {
  MAX_FILES_PER_UPLOAD,
  validateAttachmentSelection,
} from './attachment-limits.js';
import { formatBytes, formatDateTime } from './format.js';
import { isHttpError, uploadFiles } from './upload.js';
import { PdfPreview } from './pdf-preview.js';
import { ErrorBanner } from './ui.js';

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'json', 'log', 'xml']);

export interface AttachmentPanelProps {
  readonly targetType: AttachmentTargetType;
  readonly targetId: number;
  readonly category: AttachmentCategory;
  readonly title: string;
  readonly description?: string;
  /**
   * Changes whenever the owning document's mutability may have changed (for an
   * order, its status). A new value makes the panel re-read the server's
   * `canWrite` so the controls follow the document's current state instead of
   * whatever it was when the panel first mounted.
   */
  readonly revision?: string | number;
  /**
   * The owning document is read-only right now. Applied synchronously, before
   * the refreshed `canWrite` arrives, so a document that just left an editable
   * state never keeps a writable-looking control on screen.
   */
  readonly readOnly?: boolean;
}

export function AttachmentPanel({
  targetType,
  targetId,
  category,
  title,
  description,
  revision,
  readOnly = false,
}: AttachmentPanelProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('procurementFiles'),
    [manager],
  );
  const [data, setData] = useState<AttachmentList | undefined>();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Attachment | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAttachments(api, targetType, targetId)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('procurement.attachment.loadFailed'));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // `revision` forces a re-read when the owning document's state changed.
  }, [api, targetType, targetId, t, revision]);

  const refresh = useCallback(async () => {
    try {
      setData(await listAttachments(api, targetType, targetId));
    } catch {
      setError(t('procurement.attachment.loadFailed'));
    }
  }, [api, targetType, targetId, t]);

  // The list endpoint returns every attachment of the target; a panel owns one
  // category (`license`/`qualification`, `quotation`/`contract`, ...) and must
  // render only its own files so users can tell which document is which.
  const attachments = (data?.items ?? []).filter(
    (attachment) => attachment.category === category,
  );
  // The server is authoritative, but a document that just became read-only must
  // not keep offering actions until the refreshed list arrives.
  const canWrite = (data?.canWrite ?? false) && !readOnly;
  const writable = canWrite && !uploading;

  const onFilesSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length === 0) return;
    setError(null);

    const invalid = validateAttachmentSelection(files);
    if (invalid) {
      setError(
        invalid.reason === 'tooMany'
          ? t('procurement.attachment.tooMany', { limit: invalid.limit })
          : t('procurement.attachment.tooLarge', {
              name: invalid.name,
              size: formatBytes(invalid.limit),
            }),
      );
      return;
    }

    setUploading(true);
    try {
      const { records } = await uploadFiles(repository, files);
      const fileIds = records.map((record) => String(record.id));
      await attachFiles(api, { targetType, targetId, category, fileIds });
      await refresh();
    } catch (cause) {
      setError(attachmentError(t, cause));
      await refresh();
    } finally {
      setUploading(false);
    }
  };

  const confirmRemove = async (): Promise<void> => {
    if (!pendingRemove) return;
    const target = pendingRemove;
    setPendingRemove(null);
    try {
      await removeAttachment(api, target.id);
      await refresh();
    } catch (cause) {
      setError(attachmentError(t, cause));
      await refresh();
    }
  };

  return (
    <section className='space-y-3 rounded-lg border border-border p-4'>
      <header className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0'>
          <h3 className='flex items-center gap-2 text-sm font-medium'>
            <Paperclip aria-hidden='true' className='size-4' />
            {title}
          </h3>
          {description ? (
            <p className='mt-1 text-xs text-muted-foreground'>{description}</p>
          ) : null}
        </div>
        <div className='shrink-0'>
          <input
            accept='image/*,application/pdf,.txt,.md,.csv,.json,.log,.xml,.doc,.docx,.xls,.xlsx,.ppt,.pptx'
            aria-label={t('procurement.attachment.selectFiles')}
            className='block w-full max-w-72 cursor-pointer text-xs file:mr-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50'
            disabled={!writable}
            multiple
            onChange={(event) => {
              void onFilesSelected(event);
            }}
            type='file'
          />
        </div>
      </header>

      <p className='text-xs text-muted-foreground'>
        {t('procurement.attachment.limits')}
      </p>

      {uploading ? (
        <p className='text-xs text-muted-foreground' role='status'>
          {t('procurement.attachment.uploading')}
        </p>
      ) : null}
      <ErrorBanner message={error} />

      {!loading && data && !canWrite ? (
        <p className='text-xs text-muted-foreground'>
          {t('procurement.attachment.readOnly')}
        </p>
      ) : null}

      {loading ? (
        <div className='py-4'>
          <Loading />
        </div>
      ) : attachments.length === 0 ? (
        <p className='text-xs text-muted-foreground'>
          {t('procurement.attachment.empty')}
        </p>
      ) : (
        <ul className='space-y-2'>
          {attachments.map((attachment) => (
            <li
              className='flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between'
              key={attachment.id}
            >
              <div className='flex min-w-0 items-start gap-2'>
                <FileKindIcon mimeType={attachment.mimeType} />
                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium'>
                    {attachment.filename}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {formatBytes(attachment.size)} ·{' '}
                    {attachment.uploadedByName ??
                      t('procurement.attachment.unknownUploader')}{' '}
                    · {formatDateTime(attachment.createdAt)}
                  </p>
                </div>
              </div>
              <div className='flex shrink-0 items-center gap-1'>
                {isPreviewable(attachment) ? (
                  <Button
                    onClick={() => setPreview(attachment)}
                    size='xs'
                    type='button'
                    variant='ghost'
                  >
                    <Eye aria-hidden='true' />
                    {t('procurement.attachment.view')}
                  </Button>
                ) : null}
                <a
                  className={buttonVariants({ size: 'xs', variant: 'ghost' })}
                  download={attachment.filename}
                  href={attachment.contentUrl}
                >
                  <Download aria-hidden='true' />
                  {t('procurement.attachment.download')}
                </a>
                {canWrite && attachment.canWrite ? (
                  <Button
                    onClick={() => setPendingRemove(attachment)}
                    size='xs'
                    type='button'
                    variant='ghost'
                  >
                    <Trash2 aria-hidden='true' />
                    {t('procurement.attachment.remove')}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {preview ? (
        <FilePreviewDialog
          attachment={preview}
          key={preview.id}
          onClose={() => setPreview(null)}
        />
      ) : null}

      <Dialog
        onOpenChange={(next) => {
          if (!next) setPendingRemove(null);
        }}
        open={pendingRemove !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('procurement.attachment.removeTitle')}</DialogTitle>
            <DialogDescription>
              {t('procurement.attachment.removeDescription', {
                name: pendingRemove?.filename ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setPendingRemove(null)}
              type='button'
              variant='outline'
            >
              {t('actions.cancel')}
            </Button>
            <Button
              onClick={() => {
                void confirmRemove();
              }}
              type='button'
              variant='destructive'
            >
              {t('procurement.attachment.remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function FileKindIcon({ mimeType }: { mimeType: string }): ReactElement {
  const isImage = mimeType.startsWith('image/');
  return (
    <span className='mt-0.5 text-muted-foreground'>
      {isImage ? (
        <ImageIcon aria-hidden='true' className='size-4' />
      ) : (
        <FileText aria-hidden='true' className='size-4' />
      )}
    </span>
  );
}

type PreviewKind = 'image' | 'pdf' | 'text' | 'unsupported';

function previewKind(attachment: Attachment): PreviewKind {
  const mime = attachment.mimeType.toLowerCase();
  const ext = attachment.ext.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'text';
  return 'unsupported';
}

function isPreviewable(attachment: Attachment): boolean {
  return previewKind(attachment) !== 'unsupported';
}

function FilePreviewDialog({
  attachment,
  onClose,
}: {
  attachment: Attachment;
  onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const kind = previewKind(attachment);
  const [content, setContent] = useState<{
    data?: Uint8Array;
    text?: string;
    failed?: boolean;
  }>({});

  useEffect(() => {
    if (kind !== 'pdf' && kind !== 'text') return;
    const controller = new AbortController();
    fetch(attachment.contentUrl, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        if (kind === 'pdf') {
          // The bytes are handed to the in-app renderer; a blob URL would send
          // the page through Chromium's external PDF viewer.
          setContent({ data: new Uint8Array(await response.arrayBuffer()) });
        } else {
          setContent({ text: await response.text() });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setContent({ failed: true });
      });
    return () => {
      controller.abort();
    };
  }, [kind, attachment.contentUrl]);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle className='truncate'>{attachment.filename}</DialogTitle>
          <DialogDescription>
            {formatBytes(attachment.size)} · {attachment.mimeType}
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[70vh] overflow-auto rounded-lg border border-border bg-muted/30 p-2'>
          {kind === 'image' ? (
            <img
              alt={attachment.filename}
              className='mx-auto max-h-[65vh] w-auto'
              src={attachment.contentUrl}
            />
          ) : null}
          {kind === 'pdf' && content.data ? (
            <PdfPreview data={content.data} filename={attachment.filename} />
          ) : null}
          {kind === 'text' && content.text !== undefined ? (
            <pre className='font-mono text-xs whitespace-pre-wrap'>
              {content.text}
            </pre>
          ) : null}
          {kind === 'unsupported' ? (
            <p className='p-4 text-sm text-muted-foreground'>
              {t('procurement.attachment.previewUnsupported')}
            </p>
          ) : null}
          {content.failed ? (
            <p className='p-4 text-sm text-destructive' role='alert'>
              {t('procurement.attachment.previewFailed')}
            </p>
          ) : null}
          {!content.failed &&
          kind !== 'image' &&
          kind !== 'unsupported' &&
          content.data === undefined &&
          content.text === undefined ? (
            <Loading />
          ) : null}
        </div>
        <DialogFooter>
          <a
            className={buttonVariants({ variant: 'outline' })}
            download={attachment.filename}
            href={attachment.contentUrl}
          >
            <Download aria-hidden='true' />
            {t('procurement.attachment.download')}
          </a>
          <Button onClick={onClose} type='button' variant='outline'>
            {t('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function attachmentError(
  t: (key: string, options?: Record<string, unknown>) => string,
  error: unknown,
): string {
  const code = errorCode(error);
  if (code === 'TOO_MANY_FILES') {
    return t('procurement.attachment.tooMany', { limit: MAX_FILES_PER_UPLOAD });
  }
  if (code === 'BODY_TOO_LARGE') {
    return t('procurement.attachment.bodyTooLarge');
  }
  if (code === 'FORBIDDEN' || code === 'UNAUTHORIZED') {
    return t('procurement.attachment.forbidden');
  }
  if (code === 'FILE_NOT_FOUND') {
    return t('procurement.attachment.fileMissing');
  }
  if (!isHttpError(error)) {
    // The request never reached the server (or its answer was lost), so the
    // caller needs to know it is safe to try again rather than that a file was
    // rejected.
    return t('procurement.attachment.networkFailed');
  }
  return t('procurement.attachment.uploadFailed');
}
