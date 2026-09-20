import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatBytes, type Attachment } from '@/lib/repair-api';

import { resolvePreviewKind, truncateText } from './file-kind';
import { PdfViewer } from './pdf-viewer';

export interface FilePreviewDialogProps {
  readonly files: readonly Attachment[];
  readonly initialIndex?: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const EMPTY_BYTES = new Uint8Array();

type LoadState =
  | {
      readonly status: 'ready';
      readonly bytes: Uint8Array;
      readonly text?: string;
      readonly truncated: boolean;
      readonly objectUrl?: string;
    }
  | { readonly status: 'error'; readonly httpStatus: number };

function downloadUrl(contentUrl: string | undefined): string | undefined {
  if (!contentUrl) return undefined;
  return `${contentUrl}${contentUrl.includes('?') ? '&' : '?'}download=1`;
}

/**
 * Renders an attachment inline.
 *
 * The bytes are fetched with the session cookie; images become an object URL that is revoked when the dialog closes
 * or another file is shown, so a previous file's content can never remain on screen. The mount is owned by the list
 * that opened it, which is why `initialIndex` only needs to be read once.
 */
export function FilePreviewDialog({
  files,
  initialIndex = 0,
  open,
  onOpenChange,
}: FilePreviewDialogProps): ReactElement | null {
  const { t } = useTranslation();
  const [index, setIndex] = useState(initialIndex);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    readonly key: string;
    readonly state: LoadState;
  }>();
  const [view, setView] = useState<{
    readonly fileId?: string;
    readonly zoom: number;
    readonly rotation: number;
  }>({ zoom: 1, rotation: 0 });

  const file = files[Math.min(index, Math.max(0, files.length - 1))];
  const kind = file ? resolvePreviewKind(file) : 'unsupported';
  const loadKey = `${file?.fileId ?? ''}|${kind}|${attempt}`;
  const state: LoadState | undefined =
    kind === 'unsupported'
      ? { status: 'ready', bytes: EMPTY_BYTES, truncated: false }
      : loaded?.key === loadKey
        ? loaded.state
        : undefined;

  useEffect(() => {
    if (!open || !file || kind === 'unsupported') return undefined;
    const controller = new AbortController();
    let createdUrl: string | undefined;
    void (async () => {
      const response = await fetch(file.contentUrl ?? '', {
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setLoaded({
          key: loadKey,
          state: { status: 'error', httpStatus: response.status },
        });
        return;
      }
      if (kind === 'text') {
        const value = await response.text();
        if (controller.signal.aborted) return;
        const { text, truncated } = truncateText(value);
        setLoaded({
          key: loadKey,
          state: { status: 'ready', bytes: EMPTY_BYTES, text, truncated },
        });
        return;
      }
      const buffer = await response.arrayBuffer();
      if (controller.signal.aborted) return;
      if (kind === 'image' && file.mimeType.startsWith('image/')) {
        createdUrl = URL.createObjectURL(
          new Blob([buffer], { type: file.mimeType }),
        );
        setLoaded({
          key: loadKey,
          state: {
            status: 'ready',
            bytes: new Uint8Array(buffer),
            truncated: false,
            objectUrl: createdUrl,
          },
        });
        return;
      }
      setLoaded({
        key: loadKey,
        state: {
          status: 'ready',
          bytes: new Uint8Array(buffer),
          truncated: false,
        },
      });
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoaded({ key: loadKey, state: { status: 'error', httpStatus: 0 } });
    });
    return () => {
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, file, kind, loadKey]);

  if (!open || !file) return null;

  const sameFile = view.fileId === file.fileId;
  const zoom = sameFile ? view.zoom : 1;
  const rotation = sameFile ? view.rotation : 0;
  const updateView = (
    patch: Partial<{ zoom: number; rotation: number }>,
  ): void =>
    setView({
      fileId: file.fileId,
      zoom: patch.zoom ?? (sameFile ? view.zoom : 1),
      rotation: patch.rotation ?? (sameFile ? view.rotation : 0),
    });
  const download = downloadUrl(file.contentUrl);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className='flex max-h-[calc(100vh-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-auto sm:max-w-4xl'
        showCloseButton
      >
        <div className='flex flex-wrap items-start justify-between gap-3 pr-10'>
          <div className='min-w-0'>
            <DialogTitle className='truncate'>{file.filename}</DialogTitle>
            <p className='text-sm text-muted-foreground'>
              {file.mimeType} · {formatBytes(file.size)}
              {file.uploadedByName ? ` · ${file.uploadedByName}` : ''}
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-1'>
            {files.length > 1 ? (
              <>
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  aria-label={t('repair.files.previousFile', {
                    defaultValue: 'Previous file',
                  })}
                  onClick={() =>
                    setIndex(
                      (value) => (value - 1 + files.length) % files.length,
                    )
                  }
                >
                  <ChevronLeft aria-hidden='true' />
                </Button>
                <span className='text-sm tabular-nums text-muted-foreground'>
                  {index + 1} / {files.length}
                </span>
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  aria-label={t('repair.files.nextFile', {
                    defaultValue: 'Next file',
                  })}
                  onClick={() =>
                    setIndex((value) => (value + 1) % files.length)
                  }
                >
                  <ChevronRight aria-hidden='true' />
                </Button>
              </>
            ) : null}
            {download ? (
              <a
                className='inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm hover:bg-accent'
                href={download}
                rel='noopener'
                download={file.filename}
              >
                <Download aria-hidden='true' className='size-4' />
                {t('repair.files.download', { defaultValue: 'Download' })}
              </a>
            ) : null}
          </div>
        </div>

        {!state ? (
          <div
            className='py-10 text-center text-sm text-muted-foreground'
            role='status'
          >
            {t('repair.files.loading', { defaultValue: 'Loading preview…' })}
          </div>
        ) : null}

        {state?.status === 'error' ? (
          <div className='flex flex-col items-center gap-3 py-10' role='alert'>
            <AlertTriangle
              aria-hidden='true'
              className='size-6 text-destructive'
            />
            <p className='text-sm'>
              {state.httpStatus === 403
                ? t('repair.files.noPermission', {
                    defaultValue: 'You are not allowed to read this file.',
                  })
                : state.httpStatus === 404
                  ? t('repair.files.notFound', {
                      defaultValue: 'The file no longer exists.',
                    })
                  : t('repair.files.loadFailed', {
                      defaultValue: 'The preview could not be loaded.',
                    })}
            </p>
            <Button
              type='button'
              variant='outline'
              onClick={() => setAttempt((value) => value + 1)}
            >
              <RotateCcw aria-hidden='true' />
              {t('repair.files.retry', { defaultValue: 'Retry' })}
            </Button>
          </div>
        ) : null}

        {state?.status === 'ready' && kind === 'image' ? (
          <div className='space-y-3'>
            <div className='flex items-center gap-1'>
              <Button
                type='button'
                size='icon'
                variant='outline'
                aria-label={t('repair.files.zoomOut', {
                  defaultValue: 'Zoom out',
                })}
                disabled={zoom <= 0.25}
                onClick={() =>
                  updateView({ zoom: Math.max(0.25, zoom - 0.25) })
                }
              >
                <ZoomOut aria-hidden='true' />
              </Button>
              <span className='text-sm tabular-nums' data-testid='image-zoom'>
                {Math.round(zoom * 100)}%
              </span>
              <Button
                type='button'
                size='icon'
                variant='outline'
                aria-label={t('repair.files.zoomIn', {
                  defaultValue: 'Zoom in',
                })}
                disabled={zoom >= 4}
                onClick={() => updateView({ zoom: Math.min(4, zoom + 0.25) })}
              >
                <ZoomIn aria-hidden='true' />
              </Button>
              <span className='mx-2 h-4 w-px bg-border' aria-hidden='true' />
              <Button
                type='button'
                size='icon'
                variant='outline'
                aria-label={t('repair.files.rotateLeft', {
                  defaultValue: 'Rotate left',
                })}
                onClick={() => updateView({ rotation: rotation - 90 })}
              >
                <RotateCcw aria-hidden='true' />
              </Button>
              <Button
                type='button'
                size='icon'
                variant='outline'
                aria-label={t('repair.files.rotateRight', {
                  defaultValue: 'Rotate right',
                })}
                onClick={() => updateView({ rotation: rotation + 90 })}
              >
                <RotateCw aria-hidden='true' />
              </Button>
            </div>
            <div className='flex max-h-[65vh] items-center justify-center overflow-auto rounded-md border bg-muted/30 p-3'>
              {state.objectUrl ? (
                <img
                  src={state.objectUrl}
                  alt={file.filename}
                  className='origin-center transition-transform'
                  style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {state?.status === 'ready' && kind === 'pdf' ? (
          <PdfViewer
            key={file.fileId}
            data={state.bytes}
            title={file.filename}
          />
        ) : null}

        {state?.status === 'ready' && kind === 'text' ? (
          <div className='space-y-2'>
            <pre className='max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm'>
              {state.text}
            </pre>
            {state.truncated ? (
              <p className='text-sm text-muted-foreground' role='status'>
                {t('repair.files.truncated', {
                  defaultValue:
                    'Showing the first 20,000 characters. Download the file to read all of it.',
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        {kind === 'unsupported' ? (
          <div className='flex flex-col items-center gap-3 py-10' role='status'>
            <AlertTriangle
              aria-hidden='true'
              className='size-6 text-muted-foreground'
            />
            <p className='text-sm'>
              {t('repair.files.unsupported', {
                defaultValue: 'This file type cannot be previewed online.',
              })}
            </p>
            {download ? (
              <a
                className='inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent'
                href={download}
                rel='noopener'
                download={file.filename}
              >
                <Download aria-hidden='true' className='size-4' />
                {t('repair.files.download', { defaultValue: 'Download' })}
              </a>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
