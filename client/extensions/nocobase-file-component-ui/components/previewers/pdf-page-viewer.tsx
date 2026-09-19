import { useTranslation } from '@nocobase/i18n/client';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

import type { FileRecord } from '../../types.js';
import { Button } from '@/components/ui/button';
import { fileUrlCredentials } from '../../lib/file-url';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const DEFAULT_ZOOM = 1.25;

type PdfState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly url: string }
  | {
      readonly status: 'ready';
      readonly url: string;
      readonly document: PDFDocumentProxy;
      readonly numPages: number;
    };

export interface PdfPageViewerProps {
  readonly file: FileRecord;
  /** Same-origin URL (usually a `blob:`) the PDF bytes can be read from. */
  readonly url: string;
  readonly onDownload?: () => void;
}

/**
 * Renders a PDF inside the application with its own canvas and paging controls.
 *
 * The browser's built-in PDF viewer is not used: in embedded and headless
 * contexts it can take the document over and replace the application page, so
 * the acceptance requirement "page through a multi-page PDF online" cannot be
 * guaranteed with it. Drawing the pages ourselves keeps the preview inside the
 * dialog, keeps the session, and works for any page count.
 */
export function PdfPageViewer({
  file,
  url,
  onDownload,
}: PdfPageViewerProps): ReactElement {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<PdfState>({ status: 'loading' });
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | undefined;
    void (async () => {
      try {
        const { pdfjs } = await import('../../lib/pdfjs.js');
        const response = await fetch(url, {
          credentials: fileUrlCredentials(url),
        });
        if (!response.ok)
          throw new Error(`The PDF could not be read (${response.status}).`);
        const data = await response.arrayBuffer();
        loaded = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          void loaded.destroy();
          loaded = undefined;
          return;
        }
        setPageNumber(1);
        setState({
          status: 'ready',
          url,
          document: loaded,
          numPages: loaded.numPages,
        });
      } catch {
        if (!cancelled) setState({ status: 'error', url });
      }
    })();
    return () => {
      cancelled = true;
      if (loaded) void loaded.destroy();
    };
  }, [url]);

  const current =
    state.status === 'ready' && state.url === url ? state.document : null;
  const failed = state.status === 'error' && state.url === url;
  const loading = !failed && !current;
  const numPages =
    state.status === 'ready' && state.url === url ? state.numPages : 0;

  useEffect(() => {
    if (!current) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    let task: RenderTask | undefined;
    void (async () => {
      try {
        const page = await current.getPage(pageNumber);
        if (cancelled) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: zoom * ratio });
        const target = canvasRef.current;
        if (!target) return;
        target.width = Math.max(1, Math.floor(viewport.width));
        target.height = Math.max(1, Math.floor(viewport.height));
        target.style.width = `${Math.max(1, Math.floor(viewport.width / ratio))}px`;
        target.style.height = `${Math.max(1, Math.floor(viewport.height / ratio))}px`;
        task = page.render({ canvas: target, viewport });
        await task.promise;
      } catch (cause: unknown) {
        if (cancelled) return;
        if (
          cause instanceof Error &&
          cause.name === 'RenderingCancelledException'
        )
          return;
        setState({ status: 'error', url });
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [current, pageNumber, zoom, url]);

  if (failed)
    return (
      <div className='flex flex-col items-center gap-3 py-8' role='alert'>
        <p>
          {t('files.pdfLoadFailed', {
            defaultValue:
              'The PDF could not be displayed in the app. You can download it instead.',
          })}
        </p>
        {onDownload ? (
          <Button type='button' onClick={onDownload}>
            {t('files.pdfDownload', { defaultValue: 'Download the PDF' })}
          </Button>
        ) : null}
      </div>
    );

  return (
    <div className='flex min-h-0 flex-col gap-2'>
      <div className='flex items-center justify-center gap-2'>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          disabled={loading || pageNumber <= 1}
          aria-label={t('files.pdfPreviousPage', {
            defaultValue: 'Previous page',
          })}
          onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
        >
          <ChevronLeft aria-hidden='true' />
        </Button>
        <span
          className='min-w-24 text-center text-sm text-muted-foreground'
          role='status'
          aria-live='polite'
        >
          {loading
            ? t('files.pdfLoading', { defaultValue: 'Loading PDF…' })
            : t('files.pdfPageOf', {
                defaultValue: 'Page {{page}} of {{total}}',
                page: pageNumber,
                total: numPages,
              })}
        </span>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          disabled={loading || pageNumber >= numPages}
          aria-label={t('files.pdfNextPage', { defaultValue: 'Next page' })}
          onClick={() =>
            setPageNumber((value) => Math.min(numPages, value + 1))
          }
        >
          <ChevronRight aria-hidden='true' />
        </Button>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          disabled={loading || zoom <= MIN_ZOOM}
          aria-label={t('files.pdfZoomOut', { defaultValue: 'Zoom out' })}
          onClick={() =>
            setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))
          }
        >
          <ZoomOut aria-hidden='true' />
        </Button>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          disabled={loading || zoom >= MAX_ZOOM}
          aria-label={t('files.pdfZoomIn', { defaultValue: 'Zoom in' })}
          onClick={() =>
            setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))
          }
        >
          <ZoomIn aria-hidden='true' />
        </Button>
      </div>
      <div className='max-h-[70vh] overflow-auto rounded-md bg-muted/30 p-2'>
        <canvas
          ref={canvasRef}
          className='mx-auto block'
          aria-label={file.filename}
          role='img'
          hidden={loading}
        />
      </div>
    </div>
  );
}

export default PdfPageViewer;
