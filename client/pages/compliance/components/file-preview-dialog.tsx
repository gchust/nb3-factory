import { useTranslation } from '@nocobase/i18n/client';
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
// Vite emits the worker as an asset and hands back its URL.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileWarningIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  RotateCwIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import {
  downloadFile,
  fetchFileResponse,
  formatBytes,
  normalizeError,
  type ComplianceFile,
  type NormalizedError,
} from '../api.js';
import {
  isOfficeDocument,
  isPdf,
  isPreviewableImage,
  isTextLike,
} from '../labels.js';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PreviewKind = 'image' | 'pdf' | 'text' | 'unsupported';
type LoadState = 'loading' | 'ready' | 'unsupported' | 'error';

function classify(file: ComplianceFile): PreviewKind {
  if (isPreviewableImage(file.mimeType, file.ext)) return 'image';
  if (isPdf(file.mimeType, file.ext)) return 'pdf';
  if (isTextLike(file.mimeType, file.ext)) return 'text';
  if (isOfficeDocument(file.mimeType, file.ext)) return 'unsupported';
  return 'unsupported';
}

async function readErrorPayload(response: Response): Promise<NormalizedError> {
  let code = '';
  let message = response.statusText;
  try {
    const payload = (await response.json()) as {
      code?: unknown;
      message?: unknown;
    };
    if (typeof payload.code === 'string') code = payload.code;
    if (typeof payload.message === 'string') message = payload.message;
  } catch {
    // Non-JSON error bodies are fine; the status alone is enough to explain failure.
  }
  return { status: response.status, code, message };
}

export interface FilePreviewDialogProps {
  readonly files: readonly ComplianceFile[];
  readonly index: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onIndexChange: (index: number) => void;
}

export function FilePreviewDialog({
  files,
  index,
  open,
  onOpenChange,
  onIndexChange,
}: FilePreviewDialogProps): ReactElement {
  const { t } = useTranslation();
  const file = files[index];

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<NormalizedError>();
  const [objectUrl, setObjectUrl] = useState<string>();
  const [text, setText] = useState<string>();
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [notice, setNotice] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const kind = file ? classify(file) : 'unsupported';
  const fileId = file?.id;

  // Load a fresh representation whenever the selected file or a manual retry changes.
  useEffect(() => {
    if (!open || !fileId) return undefined;
    let cancelled = false;

    const load = async (): Promise<void> => {
      setLoadState('loading');
      setError(undefined);
      setText(undefined);
      setPdfDoc(undefined);
      setPage(1);
      setNumPages(1);
      setZoom(1);
      setRotation(0);
      setNotice(undefined);
      setObjectUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return undefined;
      });

      if (kind === 'unsupported') {
        setLoadState('unsupported');
        return;
      }

      try {
        const response = await fetchFileResponse(fileId);
        if (!response.ok) {
          const normalized = await readErrorPayload(response);
          if (!cancelled) {
            setError(normalized);
            setLoadState('error');
          }
          return;
        }
        if (kind === 'image') {
          const blob = await response.blob();
          if (cancelled) return;
          setObjectUrl(URL.createObjectURL(blob));
          setLoadState('ready');
          return;
        }
        if (kind === 'pdf') {
          const data = new Uint8Array(await response.arrayBuffer());
          const doc = await getDocument({ data }).promise;
          if (cancelled) {
            void doc.destroy();
            return;
          }
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setLoadState('ready');
          return;
        }
        // Text and CSV are decoded explicitly as UTF-8 so Chinese content renders correctly.
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        setText(new TextDecoder('utf-8').decode(buffer));
        setLoadState('ready');
      } catch (cause) {
        if (!cancelled) {
          setError(normalizeError(cause));
          setLoadState('error');
        }
      }
    };

    // Defer to a microtask so the effect body itself does not synchronously update state.
    queueMicrotask(() => void load());

    return () => {
      cancelled = true;
    };
  }, [open, fileId, kind, reloadKey]);

  // Release the image object URL when the dialog closes or unmounts.
  useEffect(() => {
    if (open) return undefined;
    return () => {
      setObjectUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return undefined;
      });
    };
  }, [open]);

  // Render the selected PDF page onto the canvas.
  useEffect(() => {
    if (!pdfDoc || loadState !== 'ready') return undefined;
    let cancelled = false;
    let renderTask: { cancel(): void } | undefined;
    void (async () => {
      const pdfPage = await pdfDoc.getPage(page);
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const viewport = pdfPage.getViewport({ scale: 1.4 * zoom, rotation });
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      renderTask = pdfPage.render({ canvas, canvasContext: context, viewport });
      await (renderTask as unknown as { promise: Promise<void> }).promise;
    })().catch((cause: unknown) => {
      if (cancelled) return;
      setNotice(normalizeError(cause).message);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDoc, page, zoom, rotation, loadState]);

  async function handleDownload(): Promise<void> {
    if (!file) return;
    setNotice(undefined);
    try {
      await downloadFile(file);
    } catch (cause) {
      setNotice(normalizeError(cause).message);
    }
  }

  const canGoPrevious = index > 0;
  const canGoNext = index >= 0 && index < files.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] gap-3 sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle className='truncate pr-8'>
            {file?.filename ??
              t('compliance.preview.title', { defaultValue: 'File preview' })}
          </DialogTitle>
          {file ? (
            <DialogDescription
              data-testid='compliance-preview-meta'
              className='flex flex-wrap gap-x-3 gap-y-1'
            >
              <span>{file.ext.toUpperCase()}</span>
              <span>{formatBytes(file.size)}</span>
              {file.uploadedByName ? <span>{file.uploadedByName}</span> : null}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div
          data-testid='compliance-preview-body'
          className='flex min-h-[320px] flex-col items-center justify-center overflow-auto rounded-lg bg-muted/40 p-3'
        >
          {loadState === 'loading' ? (
            <div
              className='flex flex-col items-center gap-2 text-muted-foreground'
              role='status'
            >
              <Spinner className='size-6' />
              <span>
                {t('compliance.preview.loading', {
                  defaultValue: 'Loading preview…',
                })}
              </span>
            </div>
          ) : null}

          {loadState === 'error' && error ? (
            <div
              className='flex flex-col items-center gap-3 text-center'
              role='alert'
            >
              <AlertTriangleIcon className='size-8 text-destructive' />
              <p className='text-sm'>
                {t(errorKey(error), { defaultValue: error.message })}
              </p>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setReloadKey((v) => v + 1)}
              >
                <RefreshCwIcon />
                {t('compliance.preview.retry', { defaultValue: 'Retry' })}
              </Button>
            </div>
          ) : null}

          {loadState === 'unsupported' ? (
            <div
              className='flex flex-col items-center gap-3 text-center'
              role='status'
            >
              <FileWarningIcon className='size-8 text-muted-foreground' />
              <p className='text-sm text-muted-foreground'>
                {t('compliance.preview.unsupported', {
                  defaultValue:
                    'This file type cannot be previewed online. Download it to view the full document.',
                })}
              </p>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void handleDownload()}
              >
                <DownloadIcon />
                {t('compliance.files.download', { defaultValue: 'Download' })}
              </Button>
            </div>
          ) : null}

          {loadState === 'ready' && kind === 'image' && objectUrl ? (
            <div className='flex w-full justify-center overflow-auto'>
              <img
                src={objectUrl}
                alt={file?.filename ?? ''}
                data-testid='compliance-preview-image'
                className='max-h-[60vh] max-w-full origin-center object-contain transition-transform'
                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
              />
            </div>
          ) : null}

          {loadState === 'ready' && kind === 'pdf' ? (
            <canvas
              ref={canvasRef}
              data-testid='compliance-preview-pdf-canvas'
              className='max-w-full rounded bg-white shadow-sm'
            />
          ) : null}

          {loadState === 'ready' && kind === 'text' ? (
            <pre
              data-testid='compliance-preview-text'
              className='max-h-[60vh] w-full overflow-auto whitespace-pre-wrap break-words rounded bg-background p-3 text-left text-sm'
            >
              {text}
            </pre>
          ) : null}
        </div>

        {notice ? (
          <p className='text-sm text-destructive' role='alert'>
            {notice}
          </p>
        ) : null}

        <DialogFooter className='sm:items-center sm:justify-between'>
          <div className='flex flex-wrap items-center gap-1'>
            <Button
              variant='outline'
              size='icon-sm'
              aria-label={t('compliance.preview.previous', {
                defaultValue: 'Previous file',
              })}
              disabled={!canGoPrevious}
              onClick={() => onIndexChange(index - 1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant='outline'
              size='icon-sm'
              aria-label={t('compliance.preview.next', {
                defaultValue: 'Next file',
              })}
              disabled={!canGoNext}
              onClick={() => onIndexChange(index + 1)}
            >
              <ChevronRightIcon />
            </Button>

            {kind === 'image' ? (
              <>
                <Button
                  variant='outline'
                  size='icon-sm'
                  aria-label={t('compliance.preview.zoomOut', {
                    defaultValue: 'Zoom out',
                  })}
                  onClick={() =>
                    setZoom((v) =>
                      Math.max(0.25, Number((v - 0.25).toFixed(2))),
                    )
                  }
                >
                  <ZoomOutIcon />
                </Button>
                <span className='w-12 text-center text-xs'>
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant='outline'
                  size='icon-sm'
                  aria-label={t('compliance.preview.zoomIn', {
                    defaultValue: 'Zoom in',
                  })}
                  onClick={() =>
                    setZoom((v) => Math.min(4, Number((v + 0.25).toFixed(2))))
                  }
                >
                  <ZoomInIcon />
                </Button>
                <Button
                  variant='outline'
                  size='icon-sm'
                  aria-label={t('compliance.preview.rotateLeft', {
                    defaultValue: 'Rotate left',
                  })}
                  onClick={() => setRotation((v) => (v + 270) % 360)}
                >
                  <RotateCcwIcon />
                </Button>
                <Button
                  variant='outline'
                  size='icon-sm'
                  aria-label={t('compliance.preview.rotateRight', {
                    defaultValue: 'Rotate right',
                  })}
                  onClick={() => setRotation((v) => (v + 90) % 360)}
                >
                  <RotateCwIcon />
                </Button>
              </>
            ) : null}

            {kind === 'pdf' && loadState === 'ready' ? (
              <>
                <Button
                  variant='outline'
                  size='icon-sm'
                  aria-label={t('compliance.preview.previousPage', {
                    defaultValue: 'Previous page',
                  })}
                  disabled={page <= 1}
                  onClick={() => setPage((v) => Math.max(1, v - 1))}
                >
                  <ChevronLeftIcon />
                </Button>
                <span
                  data-testid='compliance-preview-page'
                  className='w-16 text-center text-xs'
                >
                  {page} / {numPages}
                </span>
                <Button
                  variant='outline'
                  size='icon-sm'
                  aria-label={t('compliance.preview.nextPage', {
                    defaultValue: 'Next page',
                  })}
                  disabled={page >= numPages}
                  onClick={() => setPage((v) => Math.min(numPages, v + 1))}
                >
                  <ChevronRightIcon />
                </Button>
                <Button
                  variant='outline'
                  size='icon-sm'
                  aria-label={t('compliance.preview.zoomOut', {
                    defaultValue: 'Zoom out',
                  })}
                  onClick={() =>
                    setZoom((v) => Math.max(0.5, Number((v - 0.25).toFixed(2))))
                  }
                >
                  <ZoomOutIcon />
                </Button>
                <span className='w-12 text-center text-xs'>
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant='outline'
                  size='icon-sm'
                  aria-label={t('compliance.preview.zoomIn', {
                    defaultValue: 'Zoom in',
                  })}
                  onClick={() =>
                    setZoom((v) => Math.min(3, Number((v + 0.25).toFixed(2))))
                  }
                >
                  <ZoomInIcon />
                </Button>
              </>
            ) : null}
          </div>

          <Button
            variant='outline'
            size='sm'
            data-testid='compliance-preview-download'
            onClick={() => void handleDownload()}
          >
            <DownloadIcon />
            {t('compliance.files.download', { defaultValue: 'Download' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function errorKey(error: NormalizedError): string {
  if (error.status === 401) return 'compliance.preview.unauthenticated';
  if (error.status === 403) return 'compliance.preview.forbidden';
  if (error.status === 404) return 'compliance.preview.notFound';
  return 'compliance.preview.failed';
}
