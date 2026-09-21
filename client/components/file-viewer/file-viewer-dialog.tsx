import { useTranslation } from '@nocobase/i18n/client';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileQuestion,
  Loader2,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  fileUrlCredentials,
  resolveFilePreviewKind,
  resolveSafeFileUrl,
  type FilePreviewKind,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';
import type { DeliveryFile } from '@/lib/delivery-api';
import { formatBytes, formatDateTime } from '@/lib/format';

const TEXT_PREVIEW_LIMIT = 20_000;

/** Formats whose bytes are fetched before they can be shown. */
const FETCHED_KINDS: ReadonlySet<FilePreviewKind> = new Set<FilePreviewKind>([
  'image',
  'pdf',
  'text',
  'markdown',
]);

type PreviewErrorCode = 'notPermitted' | 'missing' | 'urlRejected' | 'failed';

interface PreviewSource {
  readonly status: 'loading' | 'ready' | 'error';
  readonly errorCode?: PreviewErrorCode;
  readonly text?: string;
  readonly truncated?: boolean;
  readonly blobUrl?: string;
  readonly pdf?: PDFDocumentProxy;
  readonly pageCount?: number;
}

function previewKind(file: DeliveryFile): FilePreviewKind {
  return resolveFilePreviewKind(file as unknown as FileRecord);
}

function downloadFile(file: DeliveryFile): void {
  const url = resolveSafeFileUrl(file.contentUrl);
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

function errorCodeForStatus(status: number): PreviewErrorCode {
  if (status === 401 || status === 403) return 'notPermitted';
  if (status === 404) return 'missing';
  return 'failed';
}

function errorMessage(
  code: PreviewErrorCode | undefined,
  t: (key: string) => string,
): string {
  switch (code) {
    case 'notPermitted':
      return t('delivery.files.notPermitted');
    case 'missing':
      return t('delivery.files.missing');
    case 'urlRejected':
      return t('delivery.files.urlRejected');
    default:
      return t('delivery.files.failed');
  }
}

export interface FileViewerDialogProps {
  readonly files: readonly DeliveryFile[];
  readonly initialIndex?: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Business-record file preview.
 *
 * It reads the same authenticated content URLs as the rest of the application,
 * so a file the signed-in user may not read fails here exactly as it fails over
 * HTTP. Every format has an explicit state — loading, ready, or a retryable
 * error — and an unsupported format says so rather than showing an empty frame.
 *
 * The inner viewer is keyed by the selection so opening another file remounts it
 * with fresh state instead of syncing in an effect; nothing from the previous
 * file survives, including its bytes.
 */
export function FileViewerDialog({
  files,
  initialIndex = 0,
  open,
  onOpenChange,
}: FileViewerDialogProps): ReactElement | null {
  if (!open || !files.length) return null;
  const bounded = Math.max(0, Math.min(initialIndex, files.length - 1));
  return (
    <OpenViewer
      key={`${bounded}:${files.map((file) => file.id).join(':')}`}
      files={files}
      initialIndex={bounded}
      onOpenChange={onOpenChange}
    />
  );
}

interface OpenViewerProps {
  readonly files: readonly DeliveryFile[];
  readonly initialIndex: number;
  readonly onOpenChange: (open: boolean) => void;
}

function OpenViewer({
  files,
  initialIndex,
  onOpenChange,
}: OpenViewerProps): ReactElement {
  const { t } = useTranslation();
  const [index, setIndex] = useState(initialIndex);
  const [reloadToken, setReloadToken] = useState(0);
  const file = files[index];
  if (!file) return <span />;
  const kind = previewKind(file);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[calc(100vh-2rem)] max-w-[min(1100px,calc(100%-2rem))] flex-col'>
        <DialogHeader>
          <DialogTitle className='truncate pr-8'>{file.filename}</DialogTitle>
          <DialogDescription>
            {file.mimeType} · {formatBytes(file.size)} ·{' '}
            {file.uploadedByName || '—'} · {formatDateTime(file.createdAt)}
          </DialogDescription>
        </DialogHeader>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={files.length < 2}
            onClick={() =>
              setIndex((value) => (value - 1 + files.length) % files.length)
            }
          >
            <ChevronLeft aria-hidden='true' /> {t('delivery.files.previous')}
          </Button>
          <span className='text-sm text-muted-foreground'>
            {t('delivery.files.position', {
              current: index + 1,
              total: files.length,
            })}
          </span>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={files.length < 2}
            onClick={() => setIndex((value) => (value + 1) % files.length)}
          >
            {t('delivery.files.next')} <ChevronRight aria-hidden='true' />
          </Button>
          <span className='flex-1' />
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => downloadFile(file)}
          >
            <Download aria-hidden='true' /> {t('delivery.files.download')}
          </Button>
        </div>
        <Separator />
        <div className='min-h-0 flex-1 overflow-auto'>
          <PreviewBody
            key={`${file.id}:${reloadToken}`}
            file={file}
            kind={kind}
            onRetry={() => setReloadToken((value) => value + 1)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({
  file,
  kind,
  onRetry,
}: {
  readonly file: DeliveryFile;
  readonly kind: FilePreviewKind;
  readonly onRetry: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const source = usePreviewSource(file, kind);

  if (kind === 'unsupported' || kind === 'office' || kind === 'ooxml') {
    return (
      <div className='flex flex-col items-center gap-3 py-10 text-center'>
        <FileQuestion
          className='size-10 text-muted-foreground'
          aria-hidden='true'
        />
        <p className='font-medium'>{t('delivery.files.unsupportedTitle')}</p>
        <p className='max-w-md text-sm text-muted-foreground'>
          {t('delivery.files.unsupportedDescription', { name: file.filename })}
        </p>
        <Button
          type='button'
          variant='outline'
          onClick={() => downloadFile(file)}
        >
          <Download aria-hidden='true' /> {t('delivery.files.download')}
        </Button>
      </div>
    );
  }

  if (source.status === 'loading') {
    return (
      <div className='flex items-center justify-center gap-2 py-10 text-muted-foreground'>
        <Loader2 className='size-5 animate-spin' aria-hidden='true' />
        {t('delivery.files.loading')}
      </div>
    );
  }

  if (source.status === 'error') {
    return (
      <div className='flex flex-col items-center gap-3 py-10 text-center'>
        <AlertTriangle className='size-8 text-destructive' aria-hidden='true' />
        <p className='font-medium'>{t('delivery.files.failed')}</p>
        <p className='max-w-md text-sm text-muted-foreground'>
          {errorMessage(source.errorCode, t)}
        </p>
        <div className='flex gap-2'>
          <Button type='button' onClick={onRetry}>
            {t('delivery.files.retry')}
          </Button>
          <Button
            type='button'
            variant='outline'
            onClick={() => downloadFile(file)}
          >
            <Download aria-hidden='true' /> {t('delivery.files.download')}
          </Button>
        </div>
      </div>
    );
  }

  if (kind === 'image' && source.blobUrl) {
    return <ImagePreview url={source.blobUrl} alt={file.filename} />;
  }
  if (kind === 'pdf' && source.pdf) {
    return (
      <PdfPreview document={source.pdf} pageCount={source.pageCount ?? 1} />
    );
  }
  if ((kind === 'text' || kind === 'markdown') && source.text !== undefined) {
    return (
      <div className='space-y-2'>
        {source.truncated ? (
          <p className='rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground'>
            {t('delivery.files.truncated', { limit: TEXT_PREVIEW_LIMIT })}
          </p>
        ) : null}
        <pre
          className='max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm'
          data-preview-format={file.ext.toLowerCase()}
        >
          {source.text}
        </pre>
      </div>
    );
  }
  return (
    <div className='flex flex-col items-center gap-3 py-10 text-center'>
      <FileQuestion
        className='size-10 text-muted-foreground'
        aria-hidden='true'
      />
      <p className='font-medium'>{t('delivery.files.unsupportedTitle')}</p>
    </div>
  );
}

/**
 * Fetch the file once per selection. The effect owns every resource it creates
 * — abort controllers, object URLs and the pdf.js document — and releases them
 * on unmount, so switching files or closing the dialog never leaves the previous
 * file's bytes or viewer alive.
 */
function usePreviewSource(
  file: DeliveryFile,
  kind: FilePreviewKind,
): PreviewSource {
  const [source, setSource] = useState<PreviewSource>(() => {
    if (!resolveSafeFileUrl(file.contentUrl)) {
      return { status: 'error', errorCode: 'urlRejected' };
    }
    // Formats without a fetched body start ready; the rest wait for the effect.
    return FETCHED_KINDS.has(kind)
      ? { status: 'loading' }
      : { status: 'ready' };
  });

  useEffect(() => {
    const sourceUrl = resolveSafeFileUrl(file.contentUrl);
    // The initial state already reported an unusable URL, and formats without a
    // fetched body have nothing to load.
    if (!sourceUrl || !FETCHED_KINDS.has(kind)) return undefined;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    let pdf: PDFDocumentProxy | undefined;

    if (kind === 'image') {
      void fetch(sourceUrl, {
        credentials: fileUrlCredentials(sourceUrl),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(String(errorCodeForStatus(response.status)));
          return response.blob();
        })
        .then((blob) => {
          if (controller.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob);
          setSource({ status: 'ready', blobUrl: objectUrl });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSource({ status: 'error', errorCode: codeOf(error) });
        });
      return () => {
        controller.abort();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    if (kind === 'text' || kind === 'markdown') {
      void fetch(sourceUrl, {
        credentials: fileUrlCredentials(sourceUrl),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(String(errorCodeForStatus(response.status)));
          return response.text();
        })
        .then((text) => {
          if (controller.signal.aborted) return;
          // Rendered as text, never as markup: file content cannot become script.
          const truncated = text.length > TEXT_PREVIEW_LIMIT;
          setSource({
            status: 'ready',
            text: truncated ? text.slice(0, TEXT_PREVIEW_LIMIT) : text,
            truncated,
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSource({ status: 'error', errorCode: codeOf(error) });
        });
      return () => controller.abort();
    }

    if (kind === 'pdf') {
      void (async () => {
        try {
          const pdfjs = await loadPdfjs();
          const loaded = await pdfjs.getDocument({
            url: sourceUrl,
            withCredentials: fileUrlCredentials(sourceUrl) === 'same-origin',
          }).promise;
          if (controller.signal.aborted) {
            void loaded.destroy();
            return;
          }
          pdf = loaded;
          setSource({
            status: 'ready',
            pdf: loaded,
            pageCount: loaded.numPages,
          });
        } catch (error: unknown) {
          if (controller.signal.aborted) return;
          setSource({ status: 'error', errorCode: codeOf(error) });
        }
      })();
      return () => {
        controller.abort();
        void pdf?.destroy();
      };
    }

    return () => controller.abort();
  }, [file.id, file.contentUrl, kind]);

  return source;
}

function codeOf(error: unknown): PreviewErrorCode {
  const value = error instanceof Error ? error.message : '';
  if (
    value === 'notPermitted' ||
    value === 'missing' ||
    value === 'urlRejected'
  ) {
    return value;
  }
  return 'failed';
}

function ImagePreview({
  url,
  alt,
}: {
  url: string;
  alt: string;
}): ReactElement {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  return (
    <div className='space-y-2'>
      <div className='flex items-center gap-2'>
        <Button
          type='button'
          size='sm'
          variant='outline'
          aria-label={t('delivery.files.zoomOut')}
          onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))}
        >
          <ZoomOut aria-hidden='true' />
        </Button>
        <span className='w-16 text-center text-sm text-muted-foreground'>
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type='button'
          size='sm'
          variant='outline'
          aria-label={t('delivery.files.zoomIn')}
          onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
        >
          <ZoomIn aria-hidden='true' />
        </Button>
        <Button
          type='button'
          size='sm'
          variant='outline'
          aria-label={t('delivery.files.rotateLeft')}
          onClick={() => setRotation((value) => (value + 270) % 360)}
        >
          <RotateCcw aria-hidden='true' />
        </Button>
        <Button
          type='button'
          size='sm'
          variant='outline'
          aria-label={t('delivery.files.rotateRight')}
          onClick={() => setRotation((value) => (value + 90) % 360)}
        >
          <RotateCw aria-hidden='true' />
        </Button>
        <Button
          type='button'
          size='sm'
          variant='ghost'
          onClick={() => {
            setZoom(1);
            setRotation(0);
          }}
        >
          {t('delivery.files.reset')}
        </Button>
      </div>
      <div className='max-h-[60vh] overflow-auto rounded-md bg-muted/40 p-2'>
        <img
          src={url}
          alt={alt}
          data-preview-rotation={rotation}
          className='mx-auto transition-transform'
          style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
        />
      </div>
    </div>
  );
}

function PdfPreview({
  document,
  pageCount,
}: {
  readonly document: PDFDocumentProxy;
  readonly pageCount: number;
}): ReactElement {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const clamped = Math.max(1, Math.min(page, pageCount));

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={clamped <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          <ChevronLeft aria-hidden='true' /> {t('delivery.files.previousPage')}
        </Button>
        <span className='text-sm text-muted-foreground' data-pdf-page>
          {t('delivery.files.pageOf', { current: clamped, total: pageCount })}
        </span>
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={clamped >= pageCount}
          onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
        >
          {t('delivery.files.nextPage')} <ChevronRight aria-hidden='true' />
        </Button>
        <span className='flex-1' />
        <Button
          type='button'
          size='sm'
          variant='outline'
          aria-label={t('delivery.files.zoomOut')}
          onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
        >
          <ZoomOut aria-hidden='true' />
        </Button>
        <span className='w-16 text-center text-sm text-muted-foreground'>
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type='button'
          size='sm'
          variant='outline'
          aria-label={t('delivery.files.zoomIn')}
          onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
        >
          <ZoomIn aria-hidden='true' />
        </Button>
      </div>
      <div className='max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/40 p-2 text-center'>
        <PdfPage
          key={`${clamped}:${zoom}`}
          document={document}
          page={clamped}
          zoom={zoom}
        />
      </div>
    </div>
  );
}

/**
 * Renders one PDF page to a canvas. Remounted for every page and zoom level, so
 * its "still rendering" state is part of its initial state rather than a
 * synchronous update from the effect.
 */
function PdfPage({
  document,
  page,
  zoom,
}: {
  readonly document: PDFDocumentProxy;
  readonly page: number;
  readonly zoom: number;
}): ReactElement {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await document.getPage(page);
        const viewport = loaded.getViewport({ scale: 1.3 * zoom });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas is unavailable.');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await loaded.render({ canvas, canvasContext: context, viewport })
          .promise;
        if (!cancelled) setDone(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [document, page, zoom]);

  const rendering = !done && !failed;
  return (
    <>
      {rendering ? (
        <div className='flex items-center justify-center gap-2 py-10 text-muted-foreground'>
          <Loader2 className='size-5 animate-spin' aria-hidden='true' />
          {t('delivery.files.loading')}
        </div>
      ) : null}
      {failed ? (
        <p className='py-10 text-sm text-muted-foreground'>
          {t('delivery.files.pageFailed')}
        </p>
      ) : null}
      <canvas
        ref={canvasRef}
        data-pdf-canvas
        className={rendering || failed ? 'hidden' : 'mx-auto max-w-full'}
        aria-label={t('delivery.files.pdfPageAlt', { page })}
      />
    </>
  );
}
