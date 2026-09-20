import { useTranslation } from '@nocobase/i18n/client';
import { Download } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';

export interface PdfPreviewProps {
  /** Credentialed blob URL of the PDF bytes, or undefined while they load. */
  readonly url?: string;
  readonly filename: string;
  readonly onDownload?: () => void;
}

interface RenderablePage {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvas: HTMLCanvasElement; viewport: unknown }): {
    promise: Promise<void>;
  };
}

interface LoadedPdf {
  readonly numPages: number;
  getPage(page: number): Promise<RenderablePage>;
  destroy(): Promise<void>;
}

/**
 * Renders a PDF inside the page.
 *
 * The browser's built-in PDF viewer is not used: embedding `application/pdf`
 * delegates to a plugin that can be missing or crash a headless renderer,
 * turning the page blank. pdf.js draws each page onto a canvas instead, so the
 * content is visible everywhere and the page never navigates away. Pages are
 * laid out vertically; if rendering fails, the preview says so and offers a
 * download rather than showing an empty frame or a blank page.
 */
export function PdfPreview(inputProps: PdfPreviewProps): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-file');
  const { url, filename, onDownload } = inputProps;
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState<number>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!url) return undefined;
    const container = containerRef.current;
    let cancelled = false;
    let pdf: LoadedPdf | undefined;
    container?.replaceChildren();
    void (async () => {
      try {
        const [{ getDocument, GlobalWorkerOptions }, workerModule] =
          await Promise.all([
            import('pdfjs-dist'),
            import('../../lib/pdf-worker-url.js'),
          ]);
        if (cancelled) return;
        GlobalWorkerOptions.workerSrc = workerModule.default;
        pdf = (await getDocument({ url }).promise) as LoadedPdf;
        if (cancelled) return;
        setError(undefined);
        setPageCount(pdf.numPages);
        const target = containerRef.current;
        if (!target) return;
        const width = target.clientWidth > 0 ? target.clientWidth : 800;
        const ratio = Math.min(
          typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
          2,
        );
        for (let index = 1; index <= pdf.numPages; index += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(index);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({
            scale: (width / base.width) * ratio,
          });
          const canvas = window.document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          canvas.className =
            'mx-auto block h-auto w-full rounded-md border border-border bg-background';
          canvas.dataset.page = String(index);
          canvas.setAttribute(
            'aria-label',
            `${filename} — ${index} / ${pdf.numPages}`,
          );
          await page.render({ canvas, viewport }).promise;
          if (cancelled) return;
          const figure = window.document.createElement('figure');
          figure.className = 'space-y-1';
          const caption = window.document.createElement('figcaption');
          caption.className = 'text-center text-xs text-muted-foreground';
          caption.textContent = `${index} / ${pdf.numPages}`;
          figure.append(canvas, caption);
          target.append(figure);
        }
      } catch {
        if (!cancelled) setError('failed');
      }
    })();
    return () => {
      cancelled = true;
      void pdf?.destroy();
    };
  }, [url, filename]);

  if (error) {
    return (
      <div className='flex flex-col items-center gap-3 py-8' role='alert'>
        <p>
          {t('files.previewUnavailable', {
            defaultValue: 'Preview is unavailable for this file type.',
          })}
        </p>
        {onDownload ? (
          <Button type='button' onClick={onDownload}>
            <Download aria-hidden='true' />
            {t('files.downloadFile', { defaultValue: 'Download file' })}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      <p className='text-xs text-muted-foreground' role='status'>
        {pageCount === undefined
          ? t('files.loadingPreview', { defaultValue: 'Loading preview...' })
          : t('files.pageCount', {
              defaultValue: '{{count}} page(s)',
              count: pageCount,
            })}
      </p>
      <div
        className='max-h-[70vh] space-y-3 overflow-auto rounded-md bg-muted/30 p-2'
        ref={containerRef}
      />
    </div>
  );
}
