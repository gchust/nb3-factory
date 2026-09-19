import { useTranslation } from '@nocobase/i18n/client';
import { Download, Eye, Paperclip, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { fileContentUrl, fileDownloadUrl } from './api.js';
import {
  formatDateTime,
  formatFileSize,
  isImage,
  isPdf,
  isPreviewableText,
} from './format.js';
import { PdfPreview } from './pdf-preview.js';
import type { Attachment } from './types.js';

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export interface FilePanelProps {
  readonly files: readonly Attachment[];
  readonly editable: boolean;
  readonly disabledReason?: string;
  readonly onUpload?: (files: readonly File[], note: string) => Promise<void>;
  readonly onRemove?: (attachment: Attachment) => Promise<void>;
}

export function FilePanel(props: FilePanelProps): ReactElement {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Attachment>();

  const { files, editable, disabledReason, onUpload, onRemove } = props;

  async function handleFiles(selected: FileList | null): Promise<void> {
    if (!selected || selected.length === 0) return;
    const list = Array.from(selected);
    setError('');
    if (list.length > MAX_FILES) {
      setError(t('inspection.files.tooMany'));
      return;
    }
    const tooLarge = list.find((file) => file.size > MAX_FILE_SIZE);
    if (tooLarge) {
      setError(t('inspection.files.tooLarge', { name: tooLarge.name }));
      return;
    }
    if (!onUpload) return;
    setBusy(true);
    try {
      await onUpload(list, note.trim());
      setNote('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (cause) {
      setError(errorMessage(cause, t('inspection.files.uploadFailed')));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(attachment: Attachment): Promise<void> {
    if (!onRemove) return;
    setError('');
    setBusy(true);
    try {
      await onRemove(attachment);
    } catch (cause) {
      setError(errorMessage(cause, t('inspection.files.removeFailed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className='space-y-3'>
      {files.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('inspection.files.empty')}
        </p>
      ) : (
        <ul className='divide-y rounded-lg border'>
          {files.map((file) => (
            <li
              key={file.id}
              className='flex flex-wrap items-center gap-2 px-3 py-2 text-sm'
            >
              <Paperclip className='size-4 shrink-0 text-muted-foreground' />
              <span className='min-w-0 flex-1 truncate' title={file.filename}>
                {file.filename}
              </span>
              <span className='text-xs text-muted-foreground'>
                {formatFileSize(file.size)}
              </span>
              <span className='text-xs text-muted-foreground'>
                {file.uploadedByName ?? file.uploadedById}
              </span>
              <span className='text-xs text-muted-foreground'>
                {formatDateTime(file.createdAt)}
              </span>
              <span className='flex items-center gap-1'>
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  onClick={() => setPreview(file)}
                >
                  <Eye className='size-4' />
                  {t('inspection.files.view')}
                </Button>
                <a
                  href={fileDownloadUrl(file.fileId)}
                  className='inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm hover:bg-muted'
                >
                  <Download className='size-4' />
                  {t('inspection.files.download')}
                </a>
                {editable && onRemove ? (
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    disabled={busy}
                    onClick={() => void handleRemove(file)}
                  >
                    <Trash2 className='size-4' />
                    {t('inspection.files.remove')}
                  </Button>
                ) : null}
              </span>
              {file.note ? (
                <span className='w-full break-words text-xs text-muted-foreground'>
                  {file.note}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editable && onUpload ? (
        <div className='space-y-2 rounded-lg border border-dashed p-3'>
          <div className='flex flex-wrap items-end gap-2'>
            <div className='min-w-48 flex-1 space-y-1'>
              <Label htmlFor='file-note'>{t('inspection.files.note')}</Label>
              <Input
                id='file-note'
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t('inspection.files.notePlaceholder')}
              />
            </div>
            <input
              ref={inputRef}
              hidden
              type='file'
              multiple
              onChange={(event) => void handleFiles(event.target.files)}
            />
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className='size-4' />
              {t('inspection.files.select')}
            </Button>
          </div>
          <p className='text-xs text-muted-foreground'>
            {t('inspection.files.limits')}
          </p>
        </div>
      ) : null}

      {!editable && disabledReason ? (
        <p className='text-xs text-muted-foreground'>{disabledReason}</p>
      ) : null}

      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}

      <FilePreviewDialog
        attachment={preview}
        open={preview !== undefined}
        onOpenChange={(open) => {
          if (!open) setPreview(undefined);
        }}
      />
    </section>
  );
}

export function FilePreviewDialog(props: {
  readonly attachment: Attachment | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const { attachment, open, onOpenChange } = props;
  const [textState, setTextState] = useState<{
    fileId: string;
    text?: string;
    error?: string;
  }>();

  useEffect(() => {
    if (!attachment) return;
    if (!isPreviewableText(attachment.mimeType, attachment.ext)) return;
    const controller = new AbortController();
    void fetch(fileContentUrl(attachment.fileId), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setTextState({ fileId: attachment.fileId, text: value });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setTextState({
            fileId: attachment.fileId,
            error: t('inspection.files.previewFailed'),
          });
        }
      });
    return () => {
      controller.abort();
    };
  }, [attachment, t]);

  const ready = textState?.fileId === attachment?.fileId;
  const text = ready ? (textState?.text ?? '') : '';
  const textError = ready ? (textState?.error ?? '') : '';

  const url = attachment ? fileContentUrl(attachment.fileId) : '';
  const image = attachment
    ? isImage(attachment.mimeType, attachment.ext)
    : false;
  const pdf = attachment ? isPdf(attachment.mimeType, attachment.ext) : false;
  const pdfFileId = attachment?.fileId ?? '';
  const textFile = attachment
    ? isPreviewableText(attachment.mimeType, attachment.ext)
    : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{attachment?.filename}</DialogTitle>
          <DialogDescription>
            {attachment
              ? `${formatFileSize(attachment.size)} · ${attachment.uploadedByName ?? ''} · ${formatDateTime(attachment.createdAt)}`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[65vh] overflow-auto'>
          {image ? (
            <img
              src={url}
              alt={attachment?.filename ?? ''}
              className='mx-auto max-h-[60vh] object-contain'
            />
          ) : pdf ? (
            <PdfPreview
              key={pdfFileId}
              fileId={pdfFileId}
              filename={attachment?.filename ?? ''}
            />
          ) : textFile ? (
            textError ? (
              <p className='text-sm text-destructive'>{textError}</p>
            ) : (
              <pre className='max-w-full overflow-x-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap'>
                {text}
              </pre>
            )
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('inspection.files.noPreview')}
            </p>
          )}
        </div>
        <div className='flex justify-end'>
          <a
            href={attachment ? fileDownloadUrl(attachment.fileId) : '#'}
            className='inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted'
          >
            <Download className='size-4' />
            {t('inspection.files.download')}
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message) return cause.message;
  if (typeof cause === 'object' && cause !== null) {
    const payload = cause as {
      message?: unknown;
      payload?: { message?: unknown };
    };
    if (typeof payload.message === 'string') return payload.message;
    if (typeof payload.payload?.message === 'string') {
      return payload.payload.message;
    }
  }
  return fallback;
}
