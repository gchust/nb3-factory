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

export interface OfficeOpenXmlPreviewProps {
  readonly file: FileRecord;
  readonly format: OfficeOpenXmlFormat;
  readonly url?: string;
  readonly error?: string;
  readonly onDownload?: () => void;
}

/**
 * `load()` is bounded and retried once: an interrupted attempt can leave the returned
 * promise pending, and the second try usually succeeds.
 *
 * The viewer also keeps working after `load()` resolves — with `progressiveLayout` it lays
 * out the remaining pages in the background — and routes any later failure to `onError`.
 * Wiring `onError` straight to the dialog's error state replaced a document the reader was
 * already viewing with "Unable to render this Office Open XML file." on any non-fatal
 * background error. Each attempt owns its own failure now, so a late `onError` after a
 * successful load is ignored.
 */
const OFFICE_OPEN_XML_LOAD_TIMEOUT_MS = 20_000;
const OFFICE_OPEN_XML_LOAD_ATTEMPTS = 2;

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
    const isActive = (): boolean => active && !controller.signal.aborted;
    const timeoutMessage = t('files.ooxmlLoadTimeout', {
      defaultValue:
        'The document took too long to load, so the preview was stopped. Download the file to read it.',
    });

    const reportViewerError = (cause: unknown): void => {
      if (!isActive() || isAbortError(cause)) return;
      active = false;
      const failedViewer = viewer;
      viewer = undefined;
      failedViewer?.destroy();
      setViewerError(describeViewerError(cause, t));
    };

    const loadViewer = async (data: ArrayBuffer): Promise<void> => {
      let lastCause: unknown;
      for (
        let attempt = 0;
        attempt < OFFICE_OPEN_XML_LOAD_ATTEMPTS;
        attempt += 1
      ) {
        const failure = createAttemptFailure();
        const createdViewer = await createOfficeOpenXmlViewer(
          format,
          host,
          // Only fails the attempt that is still loading; a post-load error is ignored below.
          (cause) => failure.reject(cause),
        );
        if (!isActive()) {
          createdViewer.destroy();
          throw createAbortError();
        }
        viewer = createdViewer;
        try {
          await withLoadTimeout(
            createdViewer.load(data),
            failure,
            controller.signal,
            timeoutMessage,
          );
          return;
        } catch (cause) {
          viewer = undefined;
          createdViewer.destroy();
          if (!isActive() || isAbortError(cause)) throw cause;
          lastCause = cause;
        }
      }
      throw toError(lastCause);
    };

    void (async () => {
      const data = await fetchOfficeOpenXml(url, controller.signal, t);
      if (!isActive()) return;
      await loadViewer(data);
      if (isActive()) setLoaded(true);
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

class OfficeOpenXmlLoadTimeoutError extends Error {}

interface AttemptFailure {
  readonly promise: Promise<never>;
  reject(cause: unknown): void;
}

/** Resolves the first time the viewer reports a failure of its own. */
function createAttemptFailure(): AttemptFailure {
  let reject!: (cause: unknown) => void;
  const promise = new Promise<never>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
}

/**
 * Rejects when the viewer fails, the attempt exceeds its deadline, or the effect is
 * torn down — whichever comes first. Without the deadline a silent worker keeps the
 * returned promise pending indefinitely.
 */
function withLoadTimeout(
  load: Promise<void>,
  failure: AttemptFailure,
  signal: AbortSignal,
  timeoutMessage: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const onAbort = (): void => finish(() => reject(createAbortError()));
    const finish = (run: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      run();
    };
    const timer: ReturnType<typeof setTimeout> = setTimeout(
      () =>
        finish(() => reject(new OfficeOpenXmlLoadTimeoutError(timeoutMessage))),
      OFFICE_OPEN_XML_LOAD_TIMEOUT_MS,
    );
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    failure.promise.then(
      () => undefined,
      (cause) => finish(() => reject(toError(cause))),
    );
    load.then(
      () => finish(resolve),
      (cause) => finish(() => reject(toError(cause))),
    );
  });
}

function createAbortError(): Error {
  const error = new Error('The Office Open XML preview was superseded.');
  error.name = 'AbortError';
  return error;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) return cause;
  return new Error(
    typeof cause === 'string' ? cause : 'Office Open XML preview failed.',
  );
}

function describeViewerError(
  cause: unknown,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (
    cause instanceof OfficeOpenXmlRequestError ||
    cause instanceof OfficeOpenXmlLoadTimeoutError
  ) {
    return cause.message;
  }
  return t('files.ooxmlLoadFailed', {
    defaultValue: 'Unable to render this Office Open XML file.',
  });
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
