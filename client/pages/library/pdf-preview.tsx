import { useTranslation } from '@nocobase/i18n/client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { fileContentUrl, type MaterialFileDto } from './api.js';
import { Alert } from './components.js';
import { clampPage } from './pdf-pages.js';

/** The viewer renders pages at most this wide relative to the natural page size. */
const MAX_SCALE = 2;

/**
 * PDF.js touches `DOMMatrix` and other browser globals the moment it is evaluated, so it is loaded
 * on demand: importing this module must stay safe everywhere the library page is imported, and the
 * renderer only ships when someone actually previews a PDF. The worker URL is a plain asset string.
 */
async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

export interface PdfPreviewProps {
  readonly file: MaterialFileDto;
}

/**
 * Renders a PDF in the page itself: the bytes are fetched with the session cookie, each page is
 * painted onto a canvas by PDF.js and the reader switches pages in place. The document is never
 * navigated to the file URL, so the preview stays inside the application and page turning works
 * even where the browser's PDF plugin is not available.
 */
export function PdfPreview({ file }: PdfPreviewProps): ReactElement {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    // The parent remounts this viewer with `key={file.id}`, so the initial state below is already
    // the state for this file; nothing has to be reset synchronously when the effect runs.
    void (async () => {
      try {
        // The content endpoint is authorized per request, so the session cookie must travel with it.
        const response = await fetch(fileContentUrl(file.id), {
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = new Uint8Array(await response.arrayBuffer());
        const pdfjs = await loadPdfjs();
        const pdf = await pdfjs.getDocument({
          data,
          isEvalSupported: false,
          verbosity: 0,
        }).promise;
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        loaded = pdf;
        setDocument(pdf);
        setPageCount(pdf.numPages);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (loaded) void loaded.destroy();
    };
  }, [file.id]);

  useEffect(() => {
    if (!document) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let task: ReturnType<PDFPageProxy['render']> | null = null;
    void (async () => {
      try {
        const pdfPage = await document.getPage(page);
        if (cancelled) return;
        const available = canvas.parentElement?.clientWidth ?? 0;
        const natural = pdfPage.getViewport({ scale: 1 });
        const scale =
          available > 0
            ? Math.min(
                MAX_SCALE,
                Math.max(0.5, (available - 16) / natural.width),
              )
            : 1;
        const viewport = pdfPage.getViewport({ scale });
        const ratio =
          typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
        canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        task = pdfPage.render({
          canvas,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        // PDF.js refuses a canvas that another render still owns, so a superseded page is
        // cancelled before the next one starts. `task.promise` rejects in that case; the catch
        // below swallows it because `cancelled` is already true.
        if (cancelled) task.cancel();
        await task.promise;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [document, page]);

  if (failed) {
    return <Alert tone='error'>{t('library.previewFailed')}</Alert>;
  }

  if (loading || !document) {
    return (
      <div className='flex items-center gap-2 py-8 text-sm text-muted-foreground'>
        <Spinner />
        {t('library.previewLoading')}
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-center justify-center gap-2'>
        <Button
          disabled={page <= 1}
          onClick={() =>
            setPage((current) => clampPage(current - 1, pageCount))
          }
          size='sm'
          type='button'
          variant='outline'
        >
          <ChevronLeft />
          {t('library.pdfPreviousPage')}
        </Button>
        <span
          aria-live='polite'
          className='min-w-28 text-center text-sm text-muted-foreground'
          data-testid='pdf-page-indicator'
        >
          {t('library.pdfPageOf', { page, total: pageCount })}
        </span>
        <Button
          disabled={page >= pageCount}
          onClick={() =>
            setPage((current) => clampPage(current + 1, pageCount))
          }
          size='sm'
          type='button'
          variant='outline'
        >
          {t('library.pdfNextPage')}
          <ChevronRight />
        </Button>
      </div>
      <div className='max-h-[70vh] overflow-auto rounded-md border border-border bg-muted/30 p-2'>
        <canvas
          aria-label={file.filename}
          className='mx-auto block'
          ref={canvasRef}
          role='img'
        />
      </div>
    </div>
  );
}
