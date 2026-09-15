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
                  aria-label='Previous file'
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
                  aria-label='Next file'
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
                  void downloadFile(file).catch((error: unknown) =>
                    reportDownloadError(onError, error),
                  )
                }
              >
                <Download aria-hidden='true' />
              </Button>
            ) : null}
          </div>
        </div>
        <PreviewBody
          key={[file.id, String(file.updatedAt), file.contentUrl ?? ''].join(
            ':',
          )}
          file={file}
          onDownload={
            allowDownload
              ? () =>
                  void downloadFile(file).catch((error: unknown) =>
                    reportDownloadError(onError, error),
                  )
              : undefined
          }
        />
      </DialogContent>
    </Dialog>
  );
}

async function downloadFile(file: FileRecord): Promise<void> {
  const raw = file.contentUrl;
  const url = raw ? resolveSafeFileUrl(raw) : undefined;
  if (!url) throw new Error('File URL is not allowed.');
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.rel = 'noopener';
  link.click();
}

function reportDownloadError(
  onError: ((error: Error) => void) | undefined,
  error: unknown,
): void {
  onError?.(
    error instanceof Error ? error : new Error('File download failed.'),
  );
}

function PreviewBody({
  file,
  onDownload,
}: {
  file: FileRecord;
  onDownload?: () => void;
}): ReactElement {
  const sourceUrl = resolveSafeFileUrl(file.contentUrl ?? '');
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string | undefined>(() =>
    !sourceUrl ? 'File URL is missing or not allowed.' : undefined,
  );
  const kind: FilePreviewKind = useMemo(
    () => resolveFilePreviewKind(file),
    [file],
  );
  // Only the text-like kinds are read here. An image, audio or video element points straight at
  // the URL, and a PDF fetches its own bytes to draw them with PDF.js.
  useEffect(() => {
    if (!sourceUrl || !['text', 'markdown'].includes(kind)) return undefined;
    const controller = new AbortController();
    void fetch(sourceUrl, {
      credentials: fileUrlCredentials(sourceUrl),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Preview request failed (${response.status}).`);
        return response.text();
      })
      .then(setText)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError'))
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load the file preview.',
          );
      });
    return () => controller.abort();
  }, [sourceUrl, kind]);
  return (
    <FilePreviewContent
      file={file}
      kind={kind}
      url={sourceUrl}
      text={text}
      error={error}
      onDownload={onDownload}
    />
  );
}
