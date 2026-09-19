import { useTranslation } from '@nocobase/i18n/client';
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';

import { downloadAttachment } from './file-utils.js';
import type { FileAttachment } from './types.js';

/**
 * Renders a stored PDF page by page inside the page itself.
 *
 * The browser's built-in viewer cannot be relied on here: it loads in a
 * separate frame whose accessibility tree the application cannot control, and
 * a browser without the viewer leaves an empty frame. Drawing the selected
 * page to a canvas keeps the content in the document and gives the interface
 * its own page navigation.
 */

type PdfModule = typeof import('pdfjs-dist');
type PdfDocument = Awaited<ReturnType<PdfModule['getDocument']>['promise']>;
type PdfRenderTask = { readonly promise: Promise<void>; cancel: () => void };

let pdfModulePromise: Promise<PdfModule> | undefined;
let workerReady = false;

async function loadPdfjs(): Promise<PdfModule> {
  pdfModulePromise ??= (async () => {
    const [module, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?worker'),
    ]);
    if (!workerReady) {
      module.GlobalWorkerOptions.workerPort = new worker.default();
      workerReady = true;
    }
    return module;
  })();
  return pdfModulePromise;
}

interface PdfPreviewProps {
  readonly file: FileAttachment;
  readonly onBusyChange?: (busy: boolean) => void;
}

export function PdfPreview({
  file,
  onBusyChange,
}: PdfPreviewProps): ReactElement {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<PdfDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(() => Boolean(file.contentUrl));
  const [error, setError] = useState<string | undefined>(() =>
    file.contentUrl ? undefined : t('training.files.missingUrl'),
  );

  useEffect(() => {
    if (!file.contentUrl) return undefined;
    const url = file.contentUrl;
    const controller = new AbortController();
    let cancelled = false;
    onBusyChange?.(true);
    void (async () => {
      try {
        const response = await fetch(url, {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = new Uint8Array(await response.arrayBuffer());
        const pdfjs = await loadPdfjs();
        const document = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          await document.destroy();
          return;
        }
        documentRef.current = document;
        setPageCount(document.numPages);
        setPage(1);
        setError(undefined);
        setLoading(false);
      } catch (cause: unknown) {
        if (cancelled || controller.signal.aborted) return;
        setLoading(false);
        setError(
          t('training.files.previewFailed', {
            reason: cause instanceof Error ? cause.message : '',
          }),
        );
      } finally {
        if (!cancelled) onBusyChange?.(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      onBusyChange?.(false);
      const document = documentRef.current;
      documentRef.current = null;
      if (document) void document.destroy();
    };
  }, [file.contentUrl, file.id, onBusyChange, t]);

  useEffect(() => {
    const document = documentRef.current;
    const canvas = canvasRef.current;
    if (!document || !canvas || error) return undefined;
    let cancelled = false;
    let renderTask: PdfRenderTask | undefined;
    void (async () => {
      try {
        const pdfPage = await document.getPage(page);
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale });
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas unavailable');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const task = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
        }) as unknown as PdfRenderTask;
        renderTask = task;
        await task.promise;
        if (!cancelled) setLoading(false);
      } catch (cause: unknown) {
        if (cancelled) return;
        setLoading(false);
        setError(
          t('training.files.previewFailed', {
            reason: cause instanceof Error ? cause.message : '',
          }),
        );
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [page, scale, pageCount, error, t]);

  const changePage = (next: number): void => {
    setLoading(true);
    setPage(next);
  };

  if (error) {
    return (
      <div
        className='flex flex-col items-center gap-3 py-10 text-center'
        role='alert'
      >
        <p className='text-sm text-destructive'>{error}</p>
        <Button
          type='button'
          size='sm'
          onClick={() => downloadAttachment(file)}
        >
          {t('training.files.download')}
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-center justify-center gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={page <= 1}
          onClick={() => changePage(Math.max(1, page - 1))}
        >
          <ChevronLeft className='size-4' aria-hidden />
          {t('training.files.previousPage')}
        </Button>
        <span className='text-xs text-muted-foreground' role='status'>
          {pageCount
            ? t('training.files.pageOf', { page, total: pageCount })
            : t('training.files.loading')}
        </span>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={page >= pageCount}
          onClick={() => changePage(Math.min(pageCount, page + 1))}
        >
          {t('training.files.nextPage')}
          <ChevronRight className='size-4' aria-hidden />
        </Button>
        <Button
          type='button'
          variant='outline'
          size='icon-sm'
          aria-label={t('training.files.zoomOut')}
          onClick={() => setScale((value) => Math.max(0.5, value - 0.25))}
        >
          <Minus aria-hidden />
        </Button>
        <span className='w-12 text-center text-xs text-muted-foreground'>
          {Math.round(scale * 100)}%
        </span>
        <Button
          type='button'
          variant='outline'
          size='icon-sm'
          aria-label={t('training.files.zoomIn')}
          onClick={() => setScale((value) => Math.min(3, value + 0.25))}
        >
          <Plus aria-hidden />
        </Button>
      </div>
      <div className='relative max-h-[65vh] overflow-auto rounded-md border border-border bg-muted/30 p-2'>
        {loading ? (
          <div
            className='absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground'
            role='status'
          >
            <Loader2 className='size-4 animate-spin' aria-hidden />
            {t('training.files.loading')}
          </div>
        ) : null}
        <canvas
          ref={canvasRef}
          aria-label={file.filename}
          className='mx-auto block rounded-sm bg-white shadow-sm'
        />
      </div>
    </div>
  );
}

export default PdfPreview;
