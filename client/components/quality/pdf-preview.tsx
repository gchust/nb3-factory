import { useTranslation } from '@nocobase/i18n/client';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
// Vite emits the worker as its own asset and hands back the base-aware URL.
// Rendering here means the preview shows real pages without relying on the
// browser's built-in PDF viewer, which is unavailable in some environments and
// otherwise takes the page over instead of previewing it in place.
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';

import { attachmentUrl, clampPage } from './lib';
import { ErrorBlock, LoadingBlock } from './parts';

export interface PdfPreviewProps {
  readonly fileId: string;
  readonly filename: string;
}

type PreviewState = 'loading' | 'ready' | 'error';

/**
 * Renders a PDF attachment in place: the selected page is drawn onto a canvas
 * and page controls move between pages, so "preview" shows real content and can
 * be paged without leaving the record or opening a new tab.
 *
 * The parent keys this component by file id, so a different file mounts a fresh
 * instance instead of resetting state from an effect.
 */
export function PdfPreview({
  fileId,
  filename,
}: PdfPreviewProps): ReactElement {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const renderRef = useRef<RenderTask | null>(null);
  const [state, setState] = useState<PreviewState>('loading');
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // pdf.js is loaded on demand so records without PDFs, and the application
    // entry itself, never pay for the renderer.
    void (async () => {
      try {
        const [pdfjs, response] = await Promise.all([
          import('pdfjs-dist'),
          fetch(attachmentUrl(fileId), {
            credentials: 'include',
            signal: controller.signal,
          }),
        ]);
        if (cancelled) return;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = new Uint8Array(await response.arrayBuffer());
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        const document = await pdfjs.getDocument({
          data,
          isEvalSupported: false,
          useSystemFonts: true,
        }).promise;
        if (cancelled) {
          void document.destroy();
          return;
        }
        documentRef.current = document;
        setPageCount(document.numPages);
        setState('ready');
      } catch (cause: unknown) {
        if (cause instanceof DOMException && cause.name === 'AbortError')
          return;
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      renderRef.current?.cancel();
      renderRef.current = null;
      const document = documentRef.current;
      documentRef.current = null;
      if (document) void document.destroy();
    };
  }, [fileId]);

  useEffect(() => {
    const document = documentRef.current;
    const canvas = canvasRef.current;
    if (state !== 'ready' || !document || !canvas) return undefined;
    let cancelled = false;

    document
      .getPage(clampPage(page, document.numPages))
      .then((pdfPage) => {
        if (cancelled) return undefined;
        const viewport = pdfPage.getViewport({ scale: zoom });
        const context = canvas.getContext('2d');
        if (!context) return undefined;
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderRef.current?.cancel();
        const task = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
          transform:
            pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        renderRef.current = task;
        return task.promise;
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (
          cause instanceof Error &&
          cause.name === 'RenderingCancelledException'
        )
          return;
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [state, page, zoom]);

  if (state === 'error') {
    return <ErrorBlock message={t('quality.attachments.previewFailed')} />;
  }
  if (state === 'loading') {
    return <LoadingBlock label={t('status.loading')} />;
  }

  const canGoPrevious = page > 1;
  const canGoNext = page < pageCount;

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-center gap-1'>
        <Button
          type='button'
          variant='outline'
          size='xs'
          aria-label={t('quality.attachments.pdfPrevious')}
          disabled={!canGoPrevious}
          onClick={() =>
            setPage((current) => clampPage(current - 1, pageCount))
          }
        >
          <ChevronLeft aria-hidden='true' />
          {t('quality.attachments.pdfPrevious')}
        </Button>
        <span
          aria-live='polite'
          className='rounded-md border border-border px-2 py-1 text-xs text-muted-foreground'
        >
          {t('quality.attachments.pdfPage', { page, total: pageCount })}
        </span>
        <Button
          type='button'
          variant='outline'
          size='xs'
          aria-label={t('quality.attachments.pdfNext')}
          disabled={!canGoNext}
          onClick={() =>
            setPage((current) => clampPage(current + 1, pageCount))
          }
        >
          {t('quality.attachments.pdfNext')}
          <ChevronRight aria-hidden='true' />
        </Button>
        <Button
          type='button'
          variant='outline'
          size='xs'
          aria-label={t('quality.attachments.zoomOut')}
          onClick={() => setZoom((current) => Math.max(0.5, current - 0.25))}
        >
          <Minus aria-hidden='true' />
        </Button>
        <span className='rounded-md border border-border px-2 py-1 text-xs text-muted-foreground'>
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type='button'
          variant='outline'
          size='xs'
          aria-label={t('quality.attachments.zoomIn')}
          onClick={() => setZoom((current) => Math.min(3, current + 0.25))}
        >
          <Plus aria-hidden='true' />
        </Button>
      </div>
      <div className='max-h-[60vh] overflow-auto rounded-md bg-background p-2'>
        <canvas
          ref={canvasRef}
          aria-label={filename}
          className='mx-auto block'
        />
      </div>
    </div>
  );
}
