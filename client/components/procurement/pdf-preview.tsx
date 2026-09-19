import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';

export interface PdfPreviewProps {
  readonly data: Uint8Array;
  readonly filename: string;
}

/**
 * Renders a PDF inside the application instead of handing it to the browser's
 * built-in viewer.
 *
 * Embedding a blob URL in an `<object>`/`<iframe>` makes Chromium start its
 * internal `chrome-extension://…` PDF viewer. That viewer is an opaque frame
 * the hosting browser harness cannot follow, and under the restricted factory
 * browser it tears the page down (blank tab, lost session). Drawing the pages
 * onto canvases ourselves keeps the preview inside the app, keeps the session,
 * and works the same in every browser.
 */
export function PdfPreview({ data, filename }: PdfPreviewProps): ReactElement {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(
    'loading',
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let cancelled = false;
    let cancelRender: (() => void) | undefined;
    let pdfDocument: { destroy: () => Promise<void> } | undefined;

    container.replaceChildren();

    const draw = async (): Promise<void> => {
      const pdfjs = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

      const task = pdfjs.getDocument({ data: data.slice() });
      const pdf = await task.promise;
      pdfDocument = pdf;
      if (cancelled) return;

      const width = container.clientWidth || 0;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (cancelled) return;
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const base = page.getViewport({ scale: 1 });
        const scale = width > 0 ? Math.min(2, width / base.width) : 1;
        const viewport = page.getViewport({ scale });

        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.className =
          'mx-auto mb-3 block h-auto w-full max-w-full rounded-sm bg-white shadow-sm';
        canvas.dataset.pageNumber = String(pageNumber);
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${filename} ${pageNumber}`);

        const renderTask = page.render({ canvas, viewport });
        cancelRender = () => renderTask.cancel();
        await renderTask.promise;
        cancelRender = undefined;
        if (cancelled) return;

        container.appendChild(canvas);
        setStatus('ready');
      }
    };

    void draw().catch(() => {
      if (!cancelled) setStatus('failed');
    });

    return () => {
      cancelled = true;
      cancelRender?.();
      void pdfDocument?.destroy();
    };
  }, [data, filename]);

  return (
    <div className='relative space-y-2' data-testid='pdf-preview'>
      {status === 'failed' ? (
        <p className='p-4 text-sm text-destructive' role='alert'>
          {t('procurement.attachment.previewFailed')}
        </p>
      ) : null}
      {status === 'loading' ? <Loading className='py-6' /> : null}
      <div ref={containerRef} />
    </div>
  );
}
