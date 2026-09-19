import { useTranslation } from '@nocobase/i18n/client';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState, type ReactElement } from 'react';

/**
 * An `<iframe src="….pdf">` relies on the browser shipping a built-in PDF
 * viewer. Headless Chromium (and therefore the factory's browser acceptance
 * run) has none, so the frame stays blank and the reviewer cannot read the
 * document at all. Rendering the pages ourselves with pdf.js works in every
 * browser and keeps the file inside the page, so the dialog never navigates
 * away and the surrounding application state survives the preview.
 */
export interface PdfPreviewProps {
  readonly url: string;
  readonly filename: string;
}

/** Rendering every page of a large PDF would freeze the dialog; the first pages are enough to identify a document. */
const MAX_PDF_PAGES = 30;
const RENDER_SCALE = 1.5;

export function PdfPreview({ url, filename }: PdfPreviewProps): ReactElement {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    container?.replaceChildren();
    let destroy: (() => Promise<void>) | undefined;

    async function renderPdf(): Promise<void> {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        const loadingTask = pdfjs.getDocument({ url, withCredentials: true });
        destroy = () => loadingTask.destroy();
        const pdfDocument = await loadingTask.promise;
        if (cancelled) return;
        const pageCount = Math.min(pdfDocument.numPages, MAX_PDF_PAGES);
        setTruncated(pdfDocument.numPages > MAX_PDF_PAGES);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
          const page = await pdfDocument.getPage(pageNo);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: RENDER_SCALE * ratio });
          const canvas = window.document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('canvas is unavailable');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = 'mx-auto block h-auto w-full bg-white';
          container?.appendChild(canvas);
          await page.render({ canvas, canvasContext: context, viewport })
            .promise;
        }
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    void renderPdf();
    return () => {
      cancelled = true;
      void destroy?.();
    };
  }, [url]);

  return (
    <div className='max-h-[60vh] overflow-auto p-2'>
      {/* The canvases are appended here by pdf.js, so React must not own children. */}
      <div className='space-y-2' ref={containerRef} />
      {status === 'loading' ? (
        <p className='p-4 text-center text-sm text-muted-foreground'>
          {t('delivery.file.pdfLoading')}
        </p>
      ) : null}
      {status === 'error' ? (
        <p className='p-4 text-center text-sm text-destructive'>
          {t('delivery.file.previewFailed')}
        </p>
      ) : null}
      {truncated ? (
        <p className='p-2 text-center text-xs text-muted-foreground'>
          {t('delivery.file.pdfTruncated', { count: MAX_PDF_PAGES })}
        </p>
      ) : null}
      <span className='sr-only'>{filename}</span>
    </div>
  );
}
