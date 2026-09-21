import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  RotateCwIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { resolveFilePreviewKind } from '../extensions/nocobase-file-component-ui/lib/file-preview.js';
import {
  fileUrlCredentials,
  resolveSafeFileUrl,
} from '../extensions/nocobase-file-component-ui/lib/file-url.js';
import { Button } from './ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';
import { Spinner } from './ui/spinner.js';
import { formatSize, purposeKey, toFileRecord } from '@/lib/lab-file';
import type { LabFileView } from '@/lib/lab-types';

/** Characters of a text file shown before the viewer truncates with a notice. */
const TEXT_PREVIEW_LIMIT = 2000;
/** Bytes above which a text file is not fetched into the browser at all. */
const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

/** Why a preview could not be shown. */
type FailureReason = 'denied' | 'missing' | 'error';

class AttachmentFetchError extends Error {
  readonly reason: FailureReason;

  constructor(reason: FailureReason) {
    super(reason);
    this.reason = reason;
  }
}

function failureReason(status: number): FailureReason {
  if (status === 401 || status === 403) return 'denied';
  if (status === 404) return 'missing';
  return 'error';
}

/** Appends a query the content route ignores, so a retry is not answered from cache. */
function retryUrl(url: string, attempt: number): string {
  if (attempt <= 0) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}__retry=${attempt}`;
}

/** Appends the route's explicit download flag to a content URL. */
function downloadUrl(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}download=1`;
}

type AttachmentBytes =
  | { status: 'loading' }
  | { status: 'ready'; url: string; blob: Blob }
  | { status: 'failed'; reason: FailureReason };

/**
 * Fetches attachment bytes and watches the HTTP status, so the viewer can tell a permission refusal
 * from a missing file instead of collapsing every failure into the same broken image.
 */
function useAttachmentBytes(url: string, attempt: number): AttachmentBytes {
  const key = `${url}\u0000${attempt}`;
  const [state, setState] = useState<{
    key: string;
    value: Exclude<AttachmentBytes, { status: 'loading' }>;
  } | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    void fetch(retryUrl(url, attempt), {
      credentials: fileUrlCredentials(url),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new AttachmentFetchError(failureReason(response.status));
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ key, value: { status: 'ready', url: objectUrl, blob } });
      })
      .catch((cause: unknown) => {
        if (
          !active ||
          (cause instanceof DOMException && cause.name === 'AbortError')
        ) {
          return;
        }
        setState({
          key,
          value: {
            status: 'failed',
            reason:
              cause instanceof AttachmentFetchError ? cause.reason : 'error',
          },
        });
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attempt, key, url]);

  return state?.key === key ? state.value : { status: 'loading' };
}

function PreviewFailure({
  reason,
  onRetry,
}: {
  reason: FailureReason;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const message =
    reason === 'denied'
      ? t('lab.previewDenied')
      : reason === 'missing'
        ? t('lab.previewMissing')
        : t('lab.previewFailed');
  return (
    <div className='flex flex-col items-center gap-2 p-6 text-center'>
      <p className='text-destructive text-sm'>{message}</p>
      <Button variant='outline' size='sm' onClick={onRetry}>
        {t('lab.retry')}
      </Button>
    </div>
  );
}

/**
 * Presents a laboratory attachment the way the file component presents a file record.
 *
 * The kind of preview is decided by the file component's own rules (`resolveFilePreviewKind`), so the
 * classification — including which markup is refused as unsafe — is one implementation rather than
 * two. What differs is the interaction: this viewer steps between the record's attachments, adds the
 * zoom and rotation the image preview needs, page and zoom controls for a PDF, and the truncation
 * notice a long text file is shown with. A document format with no in-browser renderer, DOCX among
 * them, shows the unsupported notice and keeps the download available.
 */
export function LabFilePreview({
  files,
  selectedId,
  onSelect,
  onClose,
}: {
  files: readonly LabFileView[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const index = files.findIndex((item) => item.id === selectedId);
  const file = index >= 0 ? files[index] : undefined;
  if (!file) return null;

  const record = toFileRecord(file);
  const kind = resolveFilePreviewKind(record);
  const url = resolveSafeFileUrl(file.contentUrl);
  const hasPrevious = index > 0;
  const hasNext = index < files.length - 1;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className='max-h-[92vh] overflow-y-auto sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle className='break-all'>{file.filename}</DialogTitle>
          <DialogDescription>
            {t('lab.fileMeta', {
              purpose: file.purpose
                ? t(`lab.filePurpose.${purposeKey(file.purpose)}`)
                : t('lab.filePurposeUnset'),
              size: formatSize(file.size),
              date: file.createdAt
                ? new Date(file.createdAt).toLocaleString()
                : '',
            })}
          </DialogDescription>
          <p className='text-muted-foreground text-sm'>
            {t('lab.uploadedBy', {
              name: file.uploadedByName ?? t('lab.unset'),
            })}
          </p>
        </DialogHeader>
        <div className='flex items-center justify-between gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={!hasPrevious}
            onClick={() => onSelect(files[index - 1].id)}
          >
            <ChevronLeftIcon />
            {t('lab.previousFile')}
          </Button>
          <span className='text-muted-foreground text-xs'>
            {t('lab.filePosition', { index: index + 1, total: files.length })}
          </span>
          <Button
            variant='outline'
            size='sm'
            disabled={!hasNext}
            onClick={() => onSelect(files[index + 1].id)}
          >
            {t('lab.nextFile')}
            <ChevronRightIcon />
          </Button>
        </div>
        <div className='bg-muted/30 border-border flex min-h-[280px] items-center justify-center overflow-auto rounded-lg border p-2'>
          <div key={file.id} className='w-full'>
            {!url ? (
              <p className='text-muted-foreground text-center text-sm'>
                {t('lab.previewUnavailable')}
              </p>
            ) : kind === 'image' ? (
              <ImagePreview url={url} alt={file.filename} />
            ) : kind === 'pdf' ? (
              <PdfPreview url={url} />
            ) : kind === 'text' || kind === 'markdown' ? (
              <TextPreview
                url={url}
                filename={file.filename}
                size={file.size}
              />
            ) : (
              <div className='flex flex-col items-center gap-2 p-6 text-center'>
                <p className='text-muted-foreground text-sm'>
                  {t('lab.previewUnsupported')}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {t('lab.previewDownloadInstead')}
                </p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('lab.close')}
          </Button>
          <Button
            render={
              <a
                href={url ? downloadUrl(url) : file.contentUrl}
                download={file.filename}
                rel='noreferrer'
              />
            }
          >
            <DownloadIcon />
            {t('lab.download')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImagePreview({ url, alt }: { url: string; alt: string }) {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const bytes = useAttachmentBytes(url, attempt);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  const step = (delta: number) =>
    setScale((value) => Math.min(6, Math.max(0.2, value + delta)));

  if (bytes.status === 'loading') {
    return (
      <div className='flex min-h-[280px] items-center justify-center'>
        <Spinner className='size-6' />
      </div>
    );
  }
  if (bytes.status === 'failed') {
    return (
      <PreviewFailure
        reason={bytes.reason}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  return (
    <div className='flex w-full flex-col gap-2'>
      <div className='flex flex-wrap items-center justify-center gap-2'>
        <Button variant='outline' size='sm' onClick={() => step(0.25)}>
          <ZoomInIcon />
          {t('lab.zoomIn')}
        </Button>
        <Button variant='outline' size='sm' onClick={() => step(-0.25)}>
          <ZoomOutIcon />
          {t('lab.zoomOut')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setRotation((value) => (value + 90) % 360)}
        >
          <RotateCwIcon />
          {t('lab.rotate')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            setScale(1);
            setRotation(0);
          }}
        >
          {t('lab.resetView')}
        </Button>
        <span className='text-muted-foreground text-xs'>
          {Math.round(scale * 100)}%
        </span>
      </div>
      <div className='max-h-[65vh] w-full overflow-auto'>
        <img
          src={bytes.url}
          alt={alt}
          className='mx-auto block origin-center transition-transform'
          style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
        />
      </div>
    </div>
  );
}

function PdfPreview({ url }: { url: string }) {
  const [attempt, setAttempt] = useState(0);
  const bytes = useAttachmentBytes(url, attempt);

  if (bytes.status === 'loading') {
    return (
      <div className='flex min-h-[280px] items-center justify-center'>
        <Spinner className='size-6' />
      </div>
    );
  }
  if (bytes.status === 'failed') {
    return (
      <PreviewFailure
        reason={bytes.reason}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }
  return <PdfCanvas key={`${url}\u0000${attempt}`} blob={bytes.blob} />;
}

function PdfCanvas({ blob }: { blob: Blob }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.2);
  // The document is loaded once for the file and reused for every page and zoom level, from the
  // bytes the browser already fetched. Recreating it per page left one load being torn down while
  // the next started, and turned a slow or cancelled worker into a permanently blank page.
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  // The view that finished rendering is remembered, so `loading` is derived from the mismatch
  // rather than written by the effect, and turning the page shows the spinner at once.
  const [rendered, setRendered] = useState<string | null>(null);
  const view = `${page}\u0000${scale}`;
  const loading = !failed && (document === null || rendered !== view);

  useEffect(() => {
    let active = true;
    let loaded: PDFDocumentProxy | null = null;

    void import('pdfjs-dist')
      .then(async (pdfjs) => {
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const data = new Uint8Array(await blob.arrayBuffer());
        return pdfjs.getDocument({ data });
      })
      .then(async (task) => {
        const next = await task.promise;
        if (!active) {
          await next.destroy();
          return;
        }
        loaded = next;
        setPageCount(next.numPages);
        setDocument(next);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      void loaded?.destroy();
    };
  }, [blob]);

  useEffect(() => {
    if (!document) return;
    let active = true;
    let started = false;

    void document
      .getPage(Math.min(page, document.numPages))
      .then((pdfPage) => {
        if (!active) return;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const task = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        started = true;
        renderTaskRef.current = task;
        return task.promise;
      })
      .then(() => {
        if (active && started) setRendered(view);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (
          (cause as { name?: string } | null)?.name ===
          'RenderingCancelledException'
        ) {
          return;
        }
        setFailed(true);
      });

    return () => {
      active = false;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [document, page, scale, view]);

  return (
    <div className='flex w-full flex-col gap-2'>
      <div className='flex flex-wrap items-center justify-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          disabled={page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          {t('lab.previousPage')}
        </Button>
        <span className='text-muted-foreground text-xs'>
          {t('lab.pageOf', { page, total: pageCount || '?' })}
        </span>
        <Button
          variant='outline'
          size='sm'
          disabled={pageCount > 0 && page >= pageCount}
          onClick={() => setPage((value) => value + 1)}
        >
          {t('lab.nextPage')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setScale((value) => Math.min(4, value + 0.2))}
        >
          <ZoomInIcon />
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setScale((value) => Math.max(0.4, value - 0.2))}
        >
          <ZoomOutIcon />
        </Button>
        <span className='text-muted-foreground text-xs'>
          {Math.round(scale * 100)}%
        </span>
      </div>
      {failed ? (
        <p className='text-destructive text-center text-sm'>
          {t('lab.pdfFailed')}
        </p>
      ) : null}
      <div className='relative max-h-[65vh] w-full overflow-auto'>
        {loading ? (
          <div className='absolute inset-0 z-10 flex items-center justify-center'>
            <Spinner className='size-6' />
          </div>
        ) : null}
        <canvas ref={canvasRef} className='mx-auto block' />
      </div>
    </div>
  );
}

function TextPreview({
  url,
  filename,
  size,
}: {
  url: string;
  filename: string;
  size: number;
}) {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  // The text this has read is remembered with the URL and attempt it came from, so a file whose
  // contents are already in hand renders without a second request and a new file shows the spinner
  // immediately.
  const [loaded, setLoaded] = useState<{
    key: string;
    text?: string;
    error?: FailureReason;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const tooLarge = size > TEXT_PREVIEW_MAX_BYTES;
  const key = `${url}\u0000${attempt}`;
  const current = loaded?.key === key ? loaded : null;

  useEffect(() => {
    if (tooLarge) return;
    const controller = new AbortController();
    let active = true;
    void fetch(retryUrl(url, attempt), {
      credentials: fileUrlCredentials(url),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new AttachmentFetchError(failureReason(response.status));
        return response.text();
      })
      .then((text) => {
        if (active) setLoaded({ key, text });
      })
      .catch((cause: unknown) => {
        if (
          active &&
          !(cause instanceof DOMException && cause.name === 'AbortError')
        ) {
          setLoaded({
            key,
            error:
              cause instanceof AttachmentFetchError ? cause.reason : 'error',
          });
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, key, tooLarge, url]);

  if (tooLarge) {
    return (
      <p className='text-muted-foreground text-center text-sm'>
        {t('lab.textTooLarge')}
      </p>
    );
  }
  if (!current) {
    return (
      <div className='flex min-h-[280px] items-center justify-center'>
        <Spinner className='size-6' />
      </div>
    );
  }
  if (current.error || current.text === undefined) {
    return (
      <PreviewFailure
        reason={current.error ?? 'error'}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  const { text } = current;
  const truncated = text.length > TEXT_PREVIEW_LIMIT;
  const shown =
    truncated && !expanded ? text.slice(0, TEXT_PREVIEW_LIMIT) : text;

  return (
    <div className='flex w-full flex-col gap-2'>
      <div className='text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs'>
        <span>{filename}</span>
        {truncated ? (
          <span>
            {t('lab.truncatedNotice', {
              limit: TEXT_PREVIEW_LIMIT,
              total: text.length,
            })}
          </span>
        ) : null}
      </div>
      {truncated ? (
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? t('lab.showTruncated') : t('lab.showFull')}
          </Button>
        </div>
      ) : null}
      <pre className='bg-background border-border max-h-[60vh] w-full overflow-auto rounded-md border p-3 text-sm whitespace-pre-wrap'>
        {shown}
      </pre>
    </div>
  );
}
