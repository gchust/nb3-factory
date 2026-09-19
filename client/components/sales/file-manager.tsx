import { useTranslation } from '@nocobase/i18n/client';
import {
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  canPreview,
  contentUrl,
  errorMessage,
  fileProblem,
  formatDateTime,
  formatSize,
  isImage,
  isText,
  useLoad,
  useSalesApi,
  type FileCategory,
  type SalesFile,
} from '@/lib/sales';

import { EmptyState, ErrorNotice } from './ui.js';

export interface FileManagerProps {
  readonly category: FileCategory;
  readonly customerId?: string;
  readonly opportunityId?: string;
  readonly followUpId?: string;
}

/**
 * Sales documents and follow-up attachments.
 *
 * A file only appears once the server has stored it and confirmed the
 * association, so a failed upload never looks saved. The same component serves
 * opportunities and follow-ups but is scoped by its association, which is what
 * keeps one record's files out of another's list.
 */
export function FileManager({
  category,
  customerId,
  opportunityId,
  followUpId,
}: FileManagerProps): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<string>();
  const [preview, setPreview] = useState<SalesFile>();

  const query: Record<string, string> = {};
  if (customerId) query.customerId = customerId;
  if (opportunityId) query.opportunityId = opportunityId;
  if (followUpId) query.followUpId = followUpId;

  const state = useLoad(
    `${customerId ?? ''}:${opportunityId ?? ''}:${followUpId ?? ''}`,
    () => api.files(query).then((response) => response.data),
  );
  const files = state.data ?? [];

  const onPick = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length === 0) return;
    setError(undefined);

    if (picked.length > MAX_FILES) {
      setError(t('sales.files.tooMany', { count: MAX_FILES }));
      return;
    }
    for (const file of picked) {
      const problem = fileProblem(file);
      if (problem === 'tooLarge') {
        setError(t('sales.files.tooLarge', { name: file.name, size: 5 }));
        return;
      }
      if (problem === 'unsupported') {
        setError(t('sales.files.unsupported', { name: file.name }));
        return;
      }
    }

    setBusy(true);
    try {
      await api.uploadFiles(
        {
          category,
          ...(customerId ? { customerId } : {}),
          ...(opportunityId ? { opportunityId } : {}),
          ...(followUpId ? { followUpId } : {}),
        },
        picked,
      );
      state.reload();
    } catch (cause: unknown) {
      setError(errorMessage(cause) || t('sales.files.uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (file: SalesFile): Promise<void> => {
    setError(undefined);
    try {
      await api.deleteFile(file.id);
      setPendingDelete(undefined);
      state.reload();
    } catch (cause: unknown) {
      setError(errorMessage(cause) || t('sales.files.deleteFailed'));
    }
  };

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className='animate-spin' /> : <Upload />}
          {busy ? t('sales.files.uploading') : t('sales.files.upload')}
        </Button>
        <span className='text-xs text-muted-foreground'>
          {t('sales.files.rules', {
            count: MAX_FILES,
            size: MAX_FILE_BYTES / (1024 * 1024),
          })}
        </span>
        <input
          ref={inputRef}
          type='file'
          multiple
          className='hidden'
          onChange={(event) => void onPick(event)}
        />
      </div>

      <ErrorNotice message={error} />
      {state.error ? <ErrorNotice message={state.error} /> : null}

      {files.length === 0 ? (
        <EmptyState>{t('sales.files.empty')}</EmptyState>
      ) : (
        <ul className='divide-y divide-border rounded-lg border border-border'>
          {files.map((file) => (
            <li
              key={file.id}
              className='flex flex-wrap items-center gap-3 px-3 py-2'
            >
              <span className='text-muted-foreground'>
                {isImage(file) ? (
                  <ImageIcon className='size-4' />
                ) : (
                  <FileText className='size-4' />
                )}
              </span>
              <div className='min-w-0 flex-1'>
                <div
                  className='truncate text-sm font-medium'
                  title={file.filename}
                >
                  {file.filename}
                </div>
                <div className='text-xs text-muted-foreground'>
                  {formatSize(file.size)} · {file.uploadedByName ?? '—'} ·{' '}
                  {formatDateTime(file.createdAt)}
                </div>
              </div>
              <div className='flex items-center gap-1'>
                {canPreview(file) ? (
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    title={t('sales.files.preview')}
                    onClick={() => setPreview(file)}
                  >
                    <Eye />
                    <span className='sr-only'>{t('sales.files.preview')}</span>
                  </Button>
                ) : null}
                <a
                  href={contentUrl(file, true)}
                  className='inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                  title={t('sales.files.download')}
                  download
                >
                  <Download className='size-3.5' />
                  <span className='sr-only'>{t('sales.files.download')}</span>
                </a>
                {pendingDelete === file.id ? (
                  <>
                    <Button
                      type='button'
                      variant='destructive'
                      size='xs'
                      onClick={() => void onDelete(file)}
                    >
                      {t('sales.files.confirmDelete')}
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='xs'
                      onClick={() => setPendingDelete(undefined)}
                    >
                      {t('actions.cancel')}
                    </Button>
                  </>
                ) : (
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    title={t('sales.files.delete')}
                    onClick={() => setPendingDelete(file.id)}
                  >
                    <Trash2 />
                    <span className='sr-only'>{t('sales.files.delete')}</span>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <FilePreview
        key={preview?.id ?? 'none'}
        file={preview}
        onClose={() => setPreview(undefined)}
      />
    </div>
  );
}

function FilePreview({
  file,
  onClose,
}: {
  readonly file?: SalesFile;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [text, setText] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!file || !isText(file)) return;
    const controller = new AbortController();
    fetch(contentUrl(file), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) =>
        response.ok ? response.text() : Promise.reject(new Error('load')),
      )
      .then((value) => {
        if (!controller.signal.aborted) setText(value.slice(0, 20000));
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [file]);

  return (
    <Dialog
      open={file !== undefined}
      onOpenChange={(open) => (open ? undefined : onClose())}
    >
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle className='truncate'>{file?.filename}</DialogTitle>
        </DialogHeader>
        <div className='max-h-[70svh] min-h-40 overflow-auto rounded-lg border border-border bg-muted/30'>
          {!file ? null : failed ? (
            <p className='p-6 text-sm text-muted-foreground'>
              {t('sales.files.previewFailed')}
            </p>
          ) : isImage(file) ? (
            <img
              src={contentUrl(file)}
              alt={file.filename}
              className='mx-auto max-h-[70svh] object-contain'
            />
          ) : file.mimeType === 'application/pdf' ||
            file.ext.toLowerCase() === 'pdf' ? (
            <iframe
              src={contentUrl(file)}
              title={file.filename}
              className='h-[70svh] w-full'
            />
          ) : (
            <pre className='p-4 text-xs whitespace-pre-wrap'>
              {text ?? t('sales.files.loadingPreview')}
            </pre>
          )}
        </div>
        <div className='flex justify-end'>
          {file ? (
            <a
              href={contentUrl(file, true)}
              className='text-sm text-primary underline-offset-4 hover:underline'
              download
            >
              {t('sales.files.download')}
            </a>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FileManager;
