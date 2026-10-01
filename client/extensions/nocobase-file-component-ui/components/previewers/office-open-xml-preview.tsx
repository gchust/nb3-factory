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

// An Office Open XML viewer can stop making progress without ever rejecting `load()`: its parser runs in a Worker, and a
// terminated or killed Worker never reports again. The library re-arms its watchdog on every progress message, so it can
// be told to fail a load that has been silent for too long without capping how long a large document may take. A stall is
// retried with a fresh Worker, and a second stall is reported honestly, before the dialog commits to the explanation.
const OFFICE_OPEN_XML_SILENCE_TIMEOUT_MS = 10_000;
// A last-resort bound in case a viewer never settles at all: no preview may sit on "Loading preview..." forever.
const OFFICE_OPEN_XML_LOAD_TIMEOUT_MS = 60_000;
const OFFICE_OPEN_XML_ATTEMPTS = 2;

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
  // `t` is not always a stable reference. Keeping it out of the effect dependencies means a re-render cannot tear down a
  // viewer that is still loading, which would otherwise restart the fetch and the parser worker for no reason.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !url || error) return undefined;

    let active = true;
    let viewer: OfficeOpenXmlViewer | undefined;
    let currentAttempt: object | undefined;
    const controller = new AbortController();
    const reportViewerError = (cause: unknown): void => {
      if (!active) return;
      const failedViewer = viewer;
      viewer = undefined;
      currentAttempt = undefined;
      failedViewer?.destroy();
      setViewerError(
        cause instanceof OfficeOpenXmlRequestError
          ? cause.message
          : tRef.current('files.ooxmlLoadFailed', {
              defaultValue: 'Unable to render this Office Open XML file.',
            }),
      );
    };
    // A late error from a viewer this effect has already replaced must not condemn the replacement.
    const viewerErrorHandler =
      (owner: object) =>
      (cause: unknown): void => {
        if (active && owner === currentAttempt && !isAbortError(cause)) {
          reportViewerError(cause);
        }
      };

    void (async () => {
      const data = await fetchOfficeOpenXml(
        url,
        controller.signal,
        tRef.current,
      );
      if (!active) return;
      let lastError: unknown;
      for (let attempt = 0; attempt < OFFICE_OPEN_XML_ATTEMPTS; attempt += 1) {
        const attemptToken = {};
        currentAttempt = attemptToken;
        try {
          const createdViewer = await createOfficeOpenXmlViewer(
            format,
            host,
            viewerErrorHandler(attemptToken),
          );
          if (!active) {
            createdViewer.destroy();
            return;
          }
          viewer = createdViewer;
          // `load()` transfers the buffer it is handed, so each attempt needs its own copy.
          await withTimeout(
            createdViewer.load(data.slice(0)),
            OFFICE_OPEN_XML_LOAD_TIMEOUT_MS,
          );
          if (active) setLoaded(true);
          return;
        } catch (cause) {
          if (!active || isAbortError(cause)) return;
          lastError = cause;
          const failedViewer = viewer;
          viewer = undefined;
          currentAttempt = undefined;
          failedViewer?.destroy();
          host.replaceChildren();
        }
      }
      if (active) reportViewerError(lastError);
    })().catch(reportViewerError);

    return () => {
      active = false;
      controller.abort();
      viewer?.destroy();
    };
  }, [error, format, url]);

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

// Resolves like `promise`, but rejects once `timeoutMs` has passed without it settling. A viewer whose parser Worker
// stopped reporting never rejects on its own, so the caller must be able to give up on it.
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error('Office Open XML preview timed out.')),
      timeoutMs,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (cause: unknown) => {
        window.clearTimeout(timer);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      },
    );
  });
}

async function createOfficeOpenXmlViewer(
  format: OfficeOpenXmlFormat,
  host: HTMLElement,
  onError: (error: Error) => void,
): Promise<OfficeOpenXmlViewer> {
  const commonOptions = {
    mode: 'main' as const,
    useGoogleFonts: false,
    // The library only arms its "no layout progress" watchdog when it is given a bound. Without one a silent parser
    // worker leaves `load()` pending forever and never calls `onError`.
    workerTimeoutMs: OFFICE_OPEN_XML_SILENCE_TIMEOUT_MS,
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
