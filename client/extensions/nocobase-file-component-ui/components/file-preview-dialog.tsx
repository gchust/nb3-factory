import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import type {
  FilePreviewDialogProps,
  FileRecord,
  FileUiLabels,
} from '../types';
import {
  resolveFilePreviewKind,
  type FilePreviewKind,
} from '../lib/file-preview';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { fileUrlCredentials, resolveSafeFileUrl } from '../lib/file-url';
import { FilePreviewContent } from './previewers/file-preview-content';

export function FilePreviewDialog({
  files,
  initialIndex = 0,
  open,
  onOpenChange,
  download: allowDownload = true,
  labels,
  onError,
}: FilePreviewDialogProps): ReactElement | null {
  if (!open || !files.length) return null;
  const normalizedIndex = Math.max(0, Math.min(initialIndex, files.length - 1));
  return (
    <OpenFilePreviewDialog
      key={`${normalizedIndex}:${files.map((file) => file.id).join(':')}`}
      files={files}
      initialIndex={normalizedIndex}
      onOpenChange={onOpenChange}
      download={allowDownload}
      labels={labels}
      onError={onError}
    />
  );
}

interface OpenFilePreviewDialogProps {
  readonly files: readonly FileRecord[];
  readonly initialIndex: number;
  readonly onOpenChange: (open: boolean) => void;
  readonly download: boolean;
  readonly labels?: FileUiLabels;
  readonly onError?: (error: Error) => void;
}

function OpenFilePreviewDialog({
  files,
  initialIndex,
  onOpenChange,
  download: allowDownload,
  labels,
  onError,
}: OpenFilePreviewDialogProps): ReactElement {
  const [index, setIndex] = useState(initialIndex);
  const file = files[index];
  if (!file) throw new Error('A preview file is required.');
  const downloadLabel = labels?.download ?? 'Download';
  const previousLabel = labels?.previous ?? 'Previous file';
  const nextLabel = labels?.next ?? 'Next file';
  const urlNotAllowedLabel =
    labels?.urlNotAllowed ?? 'File URL is not allowed.';
  const downloadFailedLabel = labels?.loadFailed ?? 'File download failed.';
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className='flex max-h-[calc(100vh-2rem)] max-w-4xl flex-col overflow-auto'
        showCloseButton
      >
        <div className='flex items-center justify-between gap-3 pr-10'>
          <div className='min-w-0'>
            <DialogTitle className='truncate'>{file.filename}</DialogTitle>
            <p className='text-sm text-muted-foreground'>{file.mimeType}</p>
          </div>
          <div className='flex gap-1'>
            {files.length > 1 ? (
              <>
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  aria-label={previousLabel}
                  onClick={() =>
                    setIndex(
                      (value) => (value - 1 + files.length) % files.length,
                    )
                  }
                >
                  <ChevronLeft aria-hidden='true' />
                </Button>
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  aria-label={nextLabel}
                  onClick={() =>
                    setIndex((value) => (value + 1) % files.length)
                  }
                >
                  <ChevronRight aria-hidden='true' />
                </Button>
              </>
            ) : null}
            {allowDownload ? (
              <Button
                type='button'
                size='icon'
                variant='ghost'
                aria-label={`${downloadLabel}: ${file.filename}`}
                onClick={() =>
                  void downloadFile(file, urlNotAllowedLabel).catch(
                    (error: unknown) =>
                      reportDownloadError(onError, error, downloadFailedLabel),
                  )
                }
              >
                <Download aria-hidden='true' />
              </Button>
            ) : null}
          </div>
        </div>
        <PreviewBody
          key={`${file.id}:${String(file.updatedAt)}:${file.contentUrl}`}
          file={file}
          labels={labels}
          onDownload={
            allowDownload
              ? () =>
                  void downloadFile(file, urlNotAllowedLabel).catch(
                    (error: unknown) =>
                      reportDownloadError(onError, error, downloadFailedLabel),
                  )
              : undefined
          }
        />
      </DialogContent>
    </Dialog>
  );
}

async function downloadFile(
  file: FileRecord,
  urlNotAllowedLabel: string,
): Promise<void> {
  const raw = file.contentUrl;
  const url = raw ? resolveSafeFileUrl(raw) : undefined;
  if (!url) throw new Error(urlNotAllowedLabel);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.rel = 'noopener';
  link.click();
}

function reportDownloadError(
  onError: ((error: Error) => void) | undefined,
  error: unknown,
  downloadFailedLabel: string,
): void {
  onError?.(error instanceof Error ? error : new Error(downloadFailedLabel));
}

function PreviewBody({
  file,
  labels,
  onDownload,
}: {
  file: FileRecord;
  labels?: FileUiLabels;
  onDownload?: () => void;
}): ReactElement {
  const sourceUrl = resolveSafeFileUrl(file.contentUrl ?? '');
  const [text, setText] = useState<string>();
  const [blobUrl, setBlobUrl] = useState<string>();
  const [error, setError] = useState<string | undefined>(() =>
    !sourceUrl
      ? (labels?.urlNotAllowed ?? 'File URL is missing or not allowed.')
      : undefined,
  );
  const kind: FilePreviewKind = useMemo(
    () => resolveFilePreviewKind(file),
    [file],
  );
  // The content route downloads PDFs as attachments; a local blob can be embedded.
  useEffect(() => {
    if (!sourceUrl || kind !== 'pdf') return undefined;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void fetch(sourceUrl, {
      credentials: fileUrlCredentials(sourceUrl),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            labels?.loadFailed ?? 'Unable to load the PDF preview.',
          );
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : (labels?.loadFailed ?? 'Unable to load the PDF preview.'),
          );
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sourceUrl, kind, labels?.loadFailed]);
  const url = kind === 'pdf' ? blobUrl : sourceUrl;
  useEffect(() => {
    if (!url || !['text', 'markdown'].includes(kind)) return undefined;
    const controller = new AbortController();
    void fetch(url, {
      credentials: fileUrlCredentials(url),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(
            labels?.loadFailed ??
              `Preview request failed (${response.status}).`,
          );
        return response.text();
      })
      .then(setText)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError'))
          setError(
            cause instanceof Error
              ? cause.message
              : (labels?.loadFailed ?? 'Unable to load the file preview.'),
          );
      });
    return () => controller.abort();
  }, [file, kind, url, labels]);
  return (
    <FilePreviewContent
      file={file}
      kind={kind}
      url={url}
      text={text}
      error={error}
      labels={labels}
      onDownload={onDownload}
    />
  );
}
