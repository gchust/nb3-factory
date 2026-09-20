import { useTranslation } from '@nocobase/i18n/client';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';

/** The viewer is loaded on first use, so a page that never previews a PDF does not pay for the parser. */
type PdfjsModule = typeof import('pdfjs-dist');

export interface PdfViewerProps {
  /** Raw document bytes fetched by the caller with the session cookie. */
  readonly data: Uint8Array;
  readonly title: string;
}

/**
 * A self-contained PDF reader: it renders pages to a canvas, so page switching and zoom work even in browsers that
 * do not embed a native PDF plugin. The parent remounts it for a new file, which keeps every effect start-up clean.
 */
export function PdfViewer({ data, title }: PdfViewerProps): ReactElement {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState<string>();
  const [rendered, setRendered] = useState<string>();
  const [pdfjsModule, setPdfjsModule] = useState<PdfjsModule>();
  const renderKey = `${page}:${scale}`;

  useEffect(() => {
    let cancelled = false;
    void import('pdfjs-dist')
      .then((module) => {
        // The worker is emitted as a bundled asset, so the viewer never needs an external service.
        module.GlobalWorkerOptions.workerSrc = workerUrl;
        if (!cancelled) setPdfjsModule(module);
      })
      .catch(() => {
        if (!cancelled) setError('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pdfjsModule) return undefined;
    let cancelled = false;
    // The task must be destroyed on unmount, and `getDocument` takes ownership of the buffer.
    const task = pdfjsModule.getDocument({ data: data.slice() });
    void task.promise
      .then((loaded) => {
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        setPdfDocument(loaded);
        setPageCount(loaded.numPages);
      })
      .catch(() => {
        if (!cancelled) setError('invalid');
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [pdfjsModule, data]);

  useEffect(() => {
    if (!pdfDocument) return undefined;
    let cancelled = false;
    void pdfDocument
      .getPage(page)
      .then((pdfPage) => {
        if (cancelled) return undefined;
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return undefined;
        const viewport = pdfPage.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        return pdfPage
          .render({ canvasContext: context, viewport, canvas })
          .promise.then(() => {
            if (!cancelled) setRendered(renderKey);
          });
      })
      .catch(() => {
        if (!cancelled) setError('render');
      });
    return () => {
      cancelled = true;
    };
  }, [pdfDocument, page, scale, renderKey]);

  if (error) {
    return (
      <div
        className='rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm'
        role='alert'
      >
        {error === 'invalid'
          ? t('repair.files.invalidPdf', {
              defaultValue: 'The PDF file is damaged or unreadable.',
            })
          : t('repair.files.pdfFailed', {
              defaultValue: 'Unable to render this PDF page.',
            })}
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          size='icon'
          variant='outline'
          aria-label={t('repair.files.previousPage', {
            defaultValue: 'Previous page',
          })}
          disabled={page <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          <ChevronLeft aria-hidden='true' />
        </Button>
        <span className='text-sm tabular-nums' data-testid='pdf-page-indicator'>
          {t('repair.files.pageOf', {
            page,
            count: pageCount || 1,
            defaultValue: 'Page {{page}} / {{count}}',
          })}
        </span>
        <Button
          type='button'
          size='icon'
          variant='outline'
          aria-label={t('repair.files.nextPage', { defaultValue: 'Next page' })}
          disabled={pageCount > 0 && page >= pageCount}
          onClick={() =>
            setPage((value) => Math.min(pageCount || value + 1, value + 1))
          }
        >
          <ChevronRight aria-hidden='true' />
        </Button>
        <span className='mx-2 h-4 w-px bg-border' aria-hidden='true' />
        <Button
          type='button'
          size='icon'
          variant='outline'
          aria-label={t('repair.files.zoomOut', { defaultValue: 'Zoom out' })}
          disabled={scale <= 0.5}
          onClick={() => setScale((value) => Math.max(0.5, value - 0.25))}
        >
          <ZoomOut aria-hidden='true' />
        </Button>
        <span className='text-sm tabular-nums' data-testid='pdf-zoom-indicator'>
          {Math.round(scale * 100)}%
        </span>
        <Button
          type='button'
          size='icon'
          variant='outline'
          aria-label={t('repair.files.zoomIn', { defaultValue: 'Zoom in' })}
          disabled={scale >= 3}
          onClick={() => setScale((value) => Math.min(3, value + 0.25))}
        >
          <ZoomIn aria-hidden='true' />
        </Button>
      </div>
      <div className='max-h-[65vh] overflow-auto rounded-md border bg-muted/30 p-3'>
        <canvas
          ref={canvasRef}
          className='mx-auto block max-w-full bg-background'
          aria-label={title}
          data-rendering={rendered === renderKey ? 'false' : 'true'}
        />
      </div>
    </div>
  );
}
