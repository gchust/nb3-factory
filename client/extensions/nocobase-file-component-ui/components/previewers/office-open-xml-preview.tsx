import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import type { OfficeOpenXmlFormat } from '../../lib/file-preview.js';
import { fileUrlCredentials } from '../../lib/file-url.js';
import type { FileRecord } from '../../types.js';
import { FileThumbnail } from '../file-thumbnail.js';

interface OfficeOpenXmlViewer {
  load(source: string | ArrayBuffer): Promise<void>;
  destroy(): void;
}

/**
 * How long a single step of the preview may take.
 *
 * The viewer has its own internal timeouts, but a renderer can also stall with
 * nothing pending to time out — a worker that never reports back, or a layout
 * that produces no output. Without a bound the overlay stays at "Loading
 * preview..." forever and the reader is told nothing. The request and the render
 * are timed separately so the message names which one failed.
 */
const OOXML_REQUEST_TIMEOUT_MS = 15_000;
const OOXML_RENDER_TIMEOUT_MS = 20_000;

export interface OfficeOpenXmlPreviewProps {
  readonly file: FileRecord;
  readonly format: OfficeOpenXmlFormat;
  readonly url?: string;
  readonly error?: string;
  readonly onDownload?: () => void;
}

export function OfficeOpenXmlPreview({
  file,
  format,
  url,
  error,
  onDownload,
}: OfficeOpenXmlPreviewProps): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-file');
  const hostRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [viewerError, setViewerError] = useState<string>();

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !url || error) return undefined;

    let active = true;
    let viewer: OfficeOpenXmlViewer | undefined;
    const controller = new AbortController();
    const reportViewerError = (cause: unknown): void => {
      if (!active || isAbortError(cause)) return;
      const failedViewer = viewer;
      viewer = undefined;
      failedViewer?.destroy();
      setViewerError(
        cause instanceof OfficeOpenXmlRequestError
          ? cause.message
          : t('files.ooxmlLoadFailed', {
              defaultValue: 'Unable to render this Office Open XML file.',
            }),
      );
    };

    void (async () => {
      const data = await withTimeout(
        fetchOfficeOpenXml(url, controller.signal, t),
        OOXML_REQUEST_TIMEOUT_MS,
        () =>
          t('files.previewTimedOut', {
            defaultValue:
              'The preview took too long to load. Try downloading the file.',
          }),
      );
      if (!active) return;
      const createdViewer = await createOfficeOpenXmlViewer(
        format,
        host,
        reportViewerError,
      );
      if (!active) {
        createdViewer.destroy();
        return;
      }
      viewer = createdViewer;
      await withTimeout(viewer.load(data), OOXML_RENDER_TIMEOUT_MS, () =>
        t('files.previewTimedOut', {
          defaultValue:
            'The preview took too long to load. Try downloading the file.',
        }),
      );
      if (active) setLoaded(true);
    })().catch(reportViewerError);

    return () => {
      active = false;
      controller.abort();
      viewer?.destroy();
    };
  }, [error, format, t, url]);

  const resolvedError = error ?? viewerError;
  if (resolvedError) {
    return (
      <OfficeOpenXmlDownloadFallback
        file={file}
        message={resolvedError}
        onDownload={onDownload}
      />
    );
  }
  if (!url) {
    return (
      <div role='status'>
        {t('files.loadingPreview', { defaultValue: 'Loading preview...' })}
      </div>
    );
  }

  return (
    <div className='relative h-[70vh] min-h-0 w-full overflow-hidden bg-muted/30'>
      {!loaded ? (
        <div
          role='status'
          className='absolute inset-0 z-10 flex items-center justify-center bg-background'
        >
          {t('files.loadingPreview', { defaultValue: 'Loading preview...' })}
        </div>
      ) : null}
      <div
        ref={hostRef}
        className='h-full min-h-0 w-full overflow-hidden'
        data-office-open-xml-format={format}
      />
    </div>
  );
}

class OfficeOpenXmlRequestError extends Error {}

/** Reject with a named error when `work` does not settle in time. */
async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  message: () => string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new OfficeOpenXmlRequestError(message())),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function fetchOfficeOpenXml(
  url: string,
  signal: AbortSignal,
  t: ReturnType<typeof useTranslation>['t'],
): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    credentials: fileUrlCredentials(url),
    signal,
  });
  if (!response.ok) {
    throw new OfficeOpenXmlRequestError(
      t('files.previewRequestFailed', {
        defaultValue: `Preview request failed (${response.status}).`,
        status: response.status,
      }),
    );
  }
  return await response.arrayBuffer();
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError';
}

async function createOfficeOpenXmlViewer(
  format: OfficeOpenXmlFormat,
  host: HTMLElement,
  onError: (error: Error) => void,
): Promise<OfficeOpenXmlViewer> {
  const commonOptions = {
    mode: 'main' as const,
    useGoogleFonts: false,
    onError,
  };
  switch (format) {
    case 'docx': {
      const { DocxScrollViewer } = await import('@silurus/ooxml/docx');
      return new DocxScrollViewer(host, {
        ...commonOptions,
        enableTextSelection: true,
        gap: 16,
        progressiveLayout: true,
      });
    }
    case 'pptx': {
      const { PptxScrollViewer } = await import('@silurus/ooxml/pptx');
      return new PptxScrollViewer(host, {
        ...commonOptions,
        enableTextSelection: true,
        gap: 16,
        progressiveLayout: true,
      });
    }
    case 'xlsx': {
      const { XlsxViewer } = await import('@silurus/ooxml/xlsx');
      return new XlsxViewer(host, {
        ...commonOptions,
        showZoomSlider: true,
      });
    }
  }
}

function OfficeOpenXmlDownloadFallback({
  file,
  message,
  onDownload,
}: {
  readonly file: FileRecord;
  readonly message: string;
  readonly onDownload?: () => void;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-file');
  return (
    <div className='flex flex-col items-center gap-3 py-8'>
      <div className='h-24 w-24'>
        <FileThumbnail file={file} />
      </div>
      <p role='alert'>{message}</p>
      {onDownload ? (
        <Button type='button' onClick={onDownload}>
          {t('files.downloadFile', { defaultValue: 'Download file' })}
        </Button>
      ) : null}
    </div>
  );
}
