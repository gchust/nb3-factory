import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import type { OfficeOpenXmlFormat } from '../../lib/file-preview.js';
import { installOfficeOpenXmlWorkerCompat } from '../../lib/ooxml-worker-compat.js';
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
      try {
        await viewer.load(data);
      } catch (loadError) {
        // Only a spreadsheet may need the missing-style-part repair, and only
        // after the parser reports a genuine failure. Healthy files never pay
        // for the extra unzip/re-zip.
        if (format !== 'xlsx' || isAbortError(loadError)) throw loadError;
        const patched = await prepareXlsx(data);
        if (!active) return;
        if (!patched) throw loadError;
        await viewer.load(patched);
      }
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

/**
 * A minimal `xl/styles.xml`. Some generators produce a structurally valid but
 * minimal spreadsheet without the style part; the parser treats that part as
 * required and refuses the whole file. Injecting an empty style table lets the
 * real cell content render instead of failing.
 */
const MINIMAL_XLSX_STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border/></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
  '</styleSheet>';

async function prepareXlsx(
  data: ArrayBuffer,
): Promise<ArrayBuffer | undefined> {
  try {
    const { unzipSync, zipSync, strToU8 } = await import('fflate');
    const files = unzipSync(new Uint8Array(data));
    if (files['xl/styles.xml']) return undefined;
    files['xl/styles.xml'] = strToU8(MINIMAL_XLSX_STYLES);
    const zipped = zipSync(files);
    return zipped.buffer.slice(
      zipped.byteOffset,
      zipped.byteOffset + zipped.byteLength,
    );
  } catch {
    // A non-XLSX archive cannot be repaired here; returning undefined lets the
    // caller re-raise the parser's original error instead of masking it.
    return undefined;
  }
}

async function createOfficeOpenXmlViewer(
  format: OfficeOpenXmlFormat,
  host: HTMLElement,
  onError: (error: Error) => void,
): Promise<OfficeOpenXmlViewer> {
  // The renderer's worker must be classic rather than an ES module so a
  // guarded browser can run it; see `ooxml-worker-compat.ts`. When the browser
  // cannot offload rendering, fall back to the inline parser worker.
  installOfficeOpenXmlWorkerCompat();
  const canRenderInWorker =
    typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
  const commonOptions = {
    mode: canRenderInWorker ? ('worker' as const) : ('main' as const),
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
