import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { fileContentUrl } from './api.js';

export interface PdfPreviewProps {
  readonly fileId: string;
  readonly filename: string;
}

type PreviewState = 'loading' | 'ready' | 'error';

/**
 * Renders PDF pages into canvas elements with PDF.js instead of embedding the
 * file in an `<iframe>`.
 *
 * The browser's built-in PDF viewer is not available everywhere it matters —
 * notably in headless Chromium used for automated verification, where an
 * `<iframe src=...pdf>` or a direct navigation resolves to a blank page. Drawing
 * the pages ourselves keeps "view" working regardless of the viewer plugin.
 */
export function PdfPreview(props: PdfPreviewProps): ReactElement {
  const { t } = useTranslation();
  const { fileId, filename } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PreviewState>('loading');

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;

    async function render(): Promise<void> {
      try {
        const [pdfjs, worker] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

        const response = await fetch(fileContentUrl(fileId), {
          credentials: 'include',
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.arrayBuffer();
        if (cancelled) return;

        const task = pdfjs.getDocument({ data });
        destroy = () => {
          void task.destroy();
        };
        const pdf = await task.promise;
        const container = containerRef.current;
        if (cancelled || !container) return;
        container.replaceChildren();

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className =
            'mx-auto mb-3 block h-auto w-full max-w-full rounded border bg-white';
          container.appendChild(canvas);
          const context = canvas.getContext('2d');
          if (!context) continue;
          await page.render({ canvas, canvasContext: context, viewport })
            .promise;
        }
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    }

    void render();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [fileId]);

  return (
    <div className='space-y-2'>
      {state === 'loading' ? (
        <p className='text-sm text-muted-foreground'>
          {t('inspection.files.previewLoading')}
        </p>
      ) : null}
      {state === 'error' ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('inspection.files.previewFailed')}
        </p>
      ) : null}
      <div ref={containerRef} aria-label={filename} data-testid='pdf-preview' />
    </div>
  );
}
