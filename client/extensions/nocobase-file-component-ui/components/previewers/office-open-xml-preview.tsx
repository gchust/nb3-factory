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
 * Upper bound on a single `viewer.load()` call. The viewer's own layout
 * watchdog does not cover every code path, and a stalled parse can leave
 * `load()` pending with no `onError` callback, so the dialog cannot rely on
 * `load()` ever settling. A bounded wait turns an unrenderable document into
 * the download fallback instead of an endless "Loading preview...".
 */
const OOXML_LOAD_TIMEOUT_MS = 20_000;

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
          : cause instanceof OfficeOpenXmlTimeoutError
            ? t('files.ooxmlLoadTimeout', {
                defaultValue:
                  'This document took too long to render. Download it instead.',
              })
            : t('files.ooxmlLoadFailed', {
                defaultValue: 'Unable to render this Office Open XML file.',
              }),
      );
    };

    void (async () => {
      const data = await fetchOfficeOpenXml(url, controller.signal, t);
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
      await withLoadTimeout(
        createdViewer.load(data),
        OOXML_LOAD_TIMEOUT_MS,
        controller.signal,
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
class OfficeOpenXmlTimeoutError extends Error {}

/**
 * Race `load()` against a fixed budget. The pending load is not cancelled here
 * (the caller aborts and destroys the viewer on unmount); this only guarantees
 * the dialog never waits on it forever.
 */
async function withLoadTimeout(
  load: Promise<void>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<void> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => {
      reject(new OfficeOpenXmlTimeoutError('ooxml-load-timeout'));
    }, timeoutMs);
  });
  const aborted = new Promise<never>((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => reject(new DOMException('Aborted', 'AbortError')),
      { once: true },
    );
  });
  try {
    await Promise.race([load, timeout, aborted]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
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
      // Kept out of progressive mode on purpose: the progressive path streams
      // a partial layout and can defer the completion signal, which is the
      // one shape that leaves the preview waiting; the regular path resolves
      // once layout is complete and still renders the same content.
      return new DocxScrollViewer(host, {
        ...commonOptions,
        enableTextSelection: true,
        gap: 16,
      });
    }
    case 'pptx': {
      const { PptxScrollViewer } = await import('@silurus/ooxml/pptx');
      return new PptxScrollViewer(host, {
        ...commonOptions,
        enableTextSelection: true,
        gap: 16,
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
