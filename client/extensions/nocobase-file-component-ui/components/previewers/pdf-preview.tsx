import { Loader2 } from 'lucide-react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { fileUrlCredentials } from '../../lib/file-url';

// A PDF cannot be handed to a frame here: the browser that runs this application has no PDF
// viewer plugin, and any frame pointed at PDF bytes (blob, data or http) takes the whole tab to
// about:blank instead of rendering. PDF.js draws the pages onto canvases in this document, which
// works with or without a plugin.
GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PAGES = 30;
const PAGE_WIDTH = 760;

export interface PdfPreviewProps {
  readonly url: string;
  readonly filename: string;
}

export function PdfPreview({ url, filename }: PdfPreviewProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [total, setTotal] = useState<number>();
  const [rendered, setRendered] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(url, {
          credentials: fileUrlCredentials(url),
        });
        if (!response.ok)
          throw new Error(`Preview request failed (${response.status}).`);
        const data = await response.arrayBuffer();
        const pdf = await getDocument({ data }).promise;
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        setTotal(pdf.numPages);
        const last = Math.min(pdf.numPages, MAX_PAGES);
        for (let number = 1; number <= last; number += 1) {
          if (cancelled) break;
          const page = await pdf.getPage(number);
          const natural = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({
            scale: PAGE_WIDTH / natural.width,
          });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.className =
            'mx-auto block h-auto w-full rounded-md bg-white shadow-sm';
          await page.render({ canvas, viewport }).promise;
          if (cancelled) break;
          container.append(canvas);
          setRendered(number);
        }
        void pdf.destroy();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed)
    return (
      <div role='alert' className='text-sm text-destructive'>
        This PDF could not be displayed.
      </div>
    );

  const loading = total === undefined || rendered < total;
  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2 text-xs text-muted-foreground'>
        {loading ? (
          <Loader2 className='animate-spin' aria-hidden='true' />
        ) : null}
        <span role='status' data-testid='media-pdf-status'>
          {total === undefined
            ? 'Loading PDF...'
            : `Page ${rendered} of ${total}`}
        </span>
        <span className='sr-only'>{filename}</span>
      </div>
      <div
        ref={containerRef}
        data-testid='media-pdf-pages'
        className='max-h-[70vh] space-y-3 overflow-auto rounded-md bg-muted/40 p-3'
      />
    </div>
  );
}
