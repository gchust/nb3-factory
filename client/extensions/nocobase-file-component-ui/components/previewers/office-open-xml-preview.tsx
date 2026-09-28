import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import type { OfficeOpenXmlFormat } from '../../lib/file-preview.js';
import { fileUrlCredentials } from '../../lib/file-url.js';
import { extractDocxText } from '../../lib/docx-text.js';
import type { FileRecord } from '../../types.js';
import { FileThumbnail } from '../file-thumbnail.js';

interface OfficeOpenXmlViewer {
  load(source: string | ArrayBuffer): Promise<void>;
  destroy(): void;
}

/**
 * The rich viewer parses inside a module worker. A worker that starts but never publishes layout
 * progress leaves `load()` pending forever — neither the promise nor the viewer's `onError`
 * settles — so without a bound the dialog would sit on "Loading preview..." indefinitely. The
 * library's own watchdog (`workerTimeoutMs`) is the first guard; this timer is the backstop that
 * covers a worker which never reaches the watchdog.
 */
const OFFICE_OPEN_XML_TIMEOUT_MS = 15_000;

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
  const loadedRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [viewerError, setViewerError] = useState<string>();
  const [plainText, setPlainText] = useState<string>();

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !url || error) return undefined;

    let active = true;
    let settled = false;
    let viewer: OfficeOpenXmlViewer | undefined;
    let source: ArrayBuffer | undefined;
    let fallbackSource: ArrayBuffer | undefined;
    let loadTimer: number | undefined;
    const controller = new AbortController();

    const clearLoadTimer = (): void => {
      if (loadTimer !== undefined) {
        window.clearTimeout(loadTimer);
        loadTimer = undefined;
      }
    };

    // A DOCX is still readable as text when the canvas renderer cannot settle. Showing its body
    // keeps the document viewable in-app and keeps the filename from passing as a preview.
    // It reads `fallbackSource`, an independent copy: the viewer transfers its input ArrayBuffer
    // to its parser worker, which detaches the original before this fallback can run.
    const showPlainText = async (): Promise<boolean> => {
      if (format !== 'docx' || !fallbackSource) return false;
      try {
        const text = await extractDocxText(fallbackSource);
        if (active && text) {
          setPlainText(text);
          return true;
        }
      } catch {
        // Fall through to the explanatory failure below.
      }
      return false;
    };

    const reportViewerError = (cause: unknown): void => {
      if (!active || settled || isAbortError(cause)) return;
      // A recoverable render error after a successful load must not replace a visible document.
      if (loadedRef.current) return;
      settled = true;
      clearLoadTimer();
      const failedViewer = viewer;
      viewer = undefined;
      failedViewer?.destroy();
      void showPlainText().then((handled) => {
        if (handled || !active) return;
        setViewerError(
          cause instanceof OfficeOpenXmlRequestError
            ? cause.message
            : t('files.ooxmlLoadFailed', {
                defaultValue: 'Unable to render this Office Open XML file.',
              }),
        );
      });
    };

    void (async () => {
      source = await fetchOfficeOpenXml(url, controller.signal, t);
      if (!active) return;
      // The worker-based viewer transfers this buffer, detaching it on the main thread; keep a
      // copy for the DOCX text fallback so a failed or stalled render can still show the document.
      // Other formats have no fallback, so their single buffer stays single.
      fallbackSource = format === 'docx' ? source.slice(0) : undefined;
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
      loadTimer = window.setTimeout(
        () => reportViewerError(new Error('ooxml-load-timeout')),
        OFFICE_OPEN_XML_TIMEOUT_MS,
      );
      await viewer.load(source);
      clearLoadTimer();
      if (active && !settled) {
        loadedRef.current = true;
        setLoaded(true);
      }
    })().catch(reportViewerError);

    return () => {
      active = false;
      clearLoadTimer();
      controller.abort();
      viewer?.destroy();
    };
  }, [error, format, t, url]);

  const resolvedError = error ?? viewerError;
  if (plainText !== undefined) {
    return <PlainTextPreview text={plainText} onDownload={onDownload} />;
  }
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

/**
 * The text-only rendering of a DOCX whose rich preview was unavailable. It says so, so the
 * content is presented as a fallback rather than as a faithful preview of the document.
 */
function PlainTextPreview({
  text,
  onDownload,
}: {
  readonly text: string;
  readonly onDownload?: () => void;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-file');
  return (
    <div className='flex flex-col gap-2'>
      <p role='status' className='text-sm text-muted-foreground'>
        {t('files.ooxmlTextFallback', {
          defaultValue:
            'Showing the document text. The rich preview could not be loaded.',
        })}
      </p>
      <pre
        data-office-open-xml-text
        className='max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm'
      >
        {text}
      </pre>
      {onDownload ? (
        <Button type='button' onClick={onDownload} className='self-start'>
          {t('files.downloadFile', { defaultValue: 'Download file' })}
        </Button>
      ) : null}
    </div>
  );
}

class OfficeOpenXmlRequestError extends Error {}

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
    workerTimeoutMs: OFFICE_OPEN_XML_TIMEOUT_MS,
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
