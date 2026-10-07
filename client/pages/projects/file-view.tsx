import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  DownloadIcon,
  FileIcon,
  PaperclipIcon,
  UploadCloudIcon,
  XIcon,
} from 'lucide-react';
import { useRef, useState, type ChangeEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

import { deliverableContentUrl, formatBytes } from './format.js';

export interface UploadedFile {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: string;
}

/**
 * Uploads one file through the application's own authenticated route and reports the stored record back. The file
 * plugin's public upload is deliberately not used, so a deliverable's bytes can only be reached through the
 * deliverable's access rule.
 */
export function DeliverableFileUpload({
  value,
  onChange,
  disabled = false,
}: {
  readonly value: UploadedFile | null;
  readonly onChange: (value: UploadedFile | null) => void;
  readonly disabled?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File): Promise<void> {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api.request<{ data: UploadedFile }>({
        path: 'deliverableFiles/upload',
        method: 'POST',
        body: form,
      });
      onChange(result.data);
    } catch (error: unknown) {
      const message =
        error instanceof ApiClientError && error.status === 401
          ? t('status.sessionExpired')
          : t('projects.files.uploadFailed');
      toaster.show({ type: 'error', title: message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onPick(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) void upload(file);
  }

  if (value) {
    return (
      <div className='flex items-center justify-between gap-3 rounded-lg border p-3'>
        <span className='flex min-w-0 items-center gap-2 text-sm'>
          <FileIcon aria-hidden='true' className='size-4 shrink-0' />
          <span className='truncate'>{value.filename}</span>
          {value.size ? (
            <span className='shrink-0 text-muted-foreground'>
              {formatBytes(value.size)}
            </span>
          ) : null}
        </span>
        <Button
          aria-label={t('projects.files.remove')}
          disabled={disabled || uploading}
          size='icon-sm'
          type='button'
          variant='ghost'
          onClick={() => onChange(null)}
        >
          <XIcon />
        </Button>
      </div>
    );
  }

  return (
    <div>
      <input
        className='sr-only'
        disabled={disabled || uploading}
        ref={inputRef}
        type='file'
        onChange={onPick}
      />
      <Button
        disabled={disabled || uploading}
        type='button'
        variant='outline'
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Spinner data-icon='inline-start' />
        ) : (
          <UploadCloudIcon data-icon='inline-start' />
        )}
        {uploading ? t('projects.files.uploading') : t('projects.files.choose')}
      </Button>
    </div>
  );
}

function previewKind(
  mimeType: string | null,
  fileName: string | null,
): 'image' | 'frame' | 'none' {
  const mime = mimeType ?? '';
  const ext = fileName?.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'frame';
  if (
    mime.startsWith('text/') ||
    ['txt', 'md', 'csv', 'json', 'log'].includes(ext)
  ) {
    return 'frame';
  }
  return 'none';
}

/**
 * Preview and download for one deliverable's file. Preview renders images and PDFs (and text) inline; anything else
 * is offered as a download, because the browser cannot display it safely.
 */
export function DeliverableFileActions({
  deliverableId,
  fileName,
  mimeType,
  fileSize,
}: {
  readonly deliverableId: string;
  readonly fileName: string | null;
  readonly mimeType: string | null;
  readonly fileSize: string | null;
}): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!fileName) {
    return (
      <p className='flex items-center gap-2 text-sm text-muted-foreground'>
        <PaperclipIcon aria-hidden='true' className='size-4' />
        {t('projects.files.none')}
      </p>
    );
  }

  const kind = previewKind(mimeType, fileName);
  const url = deliverableContentUrl(deliverableId);
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <span className='flex min-w-0 items-center gap-2 text-sm'>
        <PaperclipIcon aria-hidden='true' className='size-4 shrink-0' />
        <span className='truncate'>{fileName}</span>
        {fileSize ? (
          <span className='shrink-0 text-muted-foreground'>
            {formatBytes(fileSize)}
          </span>
        ) : null}
      </span>
      {kind === 'none' ? null : (
        <Button
          size='sm'
          type='button'
          variant='outline'
          onClick={() => setOpen(true)}
        >
          {t('projects.files.preview')}
        </Button>
      )}
      <Button
        render={
          <a
            download={fileName}
            href={deliverableContentUrl(deliverableId, true)}
          />
        }
        size='sm'
        variant='ghost'
        nativeButton={false}
      >
        <DownloadIcon data-icon='inline-start' />
        {t('projects.files.download')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='flex h-[85vh] max-w-4xl flex-col'>
          <DialogHeader>
            <DialogTitle className='truncate'>{fileName}</DialogTitle>
          </DialogHeader>
          <div className='min-h-0 flex-1 overflow-auto'>
            {kind === 'image' ? (
              <img
                alt={fileName}
                className='mx-auto max-h-full object-contain'
                src={url}
              />
            ) : (
              <iframe
                className='h-full min-h-[60vh] w-full'
                src={url}
                title={fileName}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
