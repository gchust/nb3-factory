import { useTranslation } from '@nocobase/i18n/client';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from 'pdfjs-dist';

import { Button } from '@/components/ui/button';

import type { ExpenseFileView } from '../api.js';
import { downloadFile, fileUrlCredentials } from './file-utils.js';

// Vite emits the worker as a standalone asset and hands back its URL, so the
// pdf.js worker is served from the same origin in development and production
// instead of relying on a bundler-inlined copy.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type PdfStatus = 'loading' | 'ready' | 'error';

/**
 * Renders a PDF inside the page with pdf.js instead of embedding it in an
 * iframe. Embedding depends on the browser shipping a built-in PDF viewer,
 * which automation and hardened browsers often do not have; the result is an
 * empty frame. Drawing to a canvas always shows the real pages, and the page
 * controls give the required page-by-page reading.
 */
export function PdfPreview({
  file,
  url,
  onFailure,
}: {
  readonly file: ExpenseFileView;
  readonly url: string;
  readonly onFailure: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PdfStatus>('loading');
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<PDFDocumentProxy | undefined>(undefined);
  const renderTaskRef = useRef<RenderTask | undefined>(undefined);
  // The parent passes a fresh callback each render; keep it in a ref so the
  // document-loading effect only depends on the file URL.
  const failureRef = useRef(onFailure);
  useEffect(() => {
    failureRef.current = onFailure;
  }, [onFailure]);

  const fail = useCallback((): void => {
    setStatus('error');
    failureRef.current();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const response = await fetch(url, {
          credentials: fileUrlCredentials(url),
        });
        if (!response.ok) throw new Error('pdf fetch failed');
        const data = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        loadingTask = pdfjs.getDocument({ data });
        const loaded = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        documentRef.current = loaded;
        setPages(loaded.numPages);
        setPage(1);
        setStatus('ready');
      } catch {
        if (!cancelled) fail();
      }
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      documentRef.current = undefined;
      // Destroying the loading task also disposes the loaded document and its
      // worker, so the viewer releases everything when the dialog closes.
      void loadingTask?.destroy();
    };
  }, [url, fail]);

  useEffect(() => {
    const pdfDocument = documentRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (status !== 'ready' || !pdfDocument || !canvas) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const pdfPage = await pdfDocument.getPage(page);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const available = container?.clientWidth || 720;
        const fit = Math.min(2, Math.max(0.4, available / base.width));
        const viewport = pdfPage.getViewport({ scale: fit * zoom });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
        canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderTaskRef.current?.cancel();
        const task = pdfPage.render({
          canvas,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch (error) {
        // Cancelling a render while changing page or zoom rejects the previous
        // task; that is expected and must not turn into a failure notice.
        if (cancelled) return;
        if (
          (error as { name?: string } | undefined)?.name ===
          'RenderingCancelledException'
        ) {
          return;
        }
        fail();
      }
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [fail, page, status, zoom]);

  if (status === 'error') {
    return (
      <div
        className='flex flex-col items-center gap-3 py-10 text-center'
        data-slot='pdf-preview'
      >
        <p className='max-w-md text-sm text-muted-foreground'>
          {t('expenses.files.previewFailed')}
        </p>
        <Button onClick={() => downloadFile(url, file.filename)} type='button'>
          <Download aria-hidden='true' />
          {t('expenses.files.download')}
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-2' data-slot='pdf-preview'>
      <div className='flex flex-wrap items-center justify-center gap-2'>
        <Button
          aria-label={t('expenses.files.zoomOut')}
          onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
          size='icon'
          type='button'
          variant='ghost'
        >
          <Minus aria-hidden='true' />
        </Button>
        <span className='w-14 text-center text-sm tabular-nums'>
          {Math.round(zoom * 100)}%
        </span>
        <Button
          aria-label={t('expenses.files.zoomIn')}
          onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
          size='icon'
          type='button'
          variant='ghost'
        >
          <Plus aria-hidden='true' />
        </Button>
        <Button
          aria-label={t('expenses.files.zoomReset')}
          onClick={() => setZoom(1)}
          size='icon'
          type='button'
          variant='ghost'
        >
          <RotateCcw aria-hidden='true' />
        </Button>
        <span className='mx-1 h-5 w-px bg-border' aria-hidden='true' />
        <Button
          aria-label={t('expenses.files.previousPage')}
          disabled={status !== 'ready' || page <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
          size='icon'
          type='button'
          variant='ghost'
        >
          <ChevronLeft aria-hidden='true' />
        </Button>
        <span
          className='min-w-16 text-center text-sm tabular-nums'
          data-slot='pdf-page-indicator'
        >
          {status === 'ready'
            ? t('expenses.files.pageIndicator', { page, pages })
            : t('expenses.files.loading')}
        </span>
        <Button
          aria-label={t('expenses.files.nextPage')}
          disabled={status !== 'ready' || page >= pages}
          onClick={() => setPage((value) => Math.min(pages, value + 1))}
          size='icon'
          type='button'
          variant='ghost'
        >
          <ChevronRight aria-hidden='true' />
        </Button>
      </div>
      <div
        className='flex max-h-[65vh] items-start justify-center overflow-auto rounded-md border border-border bg-muted/30 p-2'
        ref={containerRef}
      >
        {status === 'ready' ? (
          <canvas
            aria-label={file.filename}
            className='shadow-sm'
            ref={canvasRef}
            role='img'
          />
        ) : (
          <p
            className='py-8 text-center text-sm text-muted-foreground'
            role='status'
          >
            {t('expenses.files.loading')}
          </p>
        )}
      </div>
      <p className='text-xs text-muted-foreground'>
        {t('expenses.files.pdfHint')}
      </p>
    </div>
  );
}
