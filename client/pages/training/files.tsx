import { useService } from '@nocobase/app-client';
import {
  clientFileRepositoryManagerToken,
  type ClientFileRepository,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  Download,
  Eye,
  FileQuestion,
  Loader2,
  Minus,
  Paperclip,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

import { errorMessage } from './client.js';
import {
  downloadAttachment,
  formatFileSize,
  previewKind,
} from './file-utils.js';
import { FILE_MAX_COUNT, FILE_MAX_SIZE, type FileAttachment } from './types.js';

// The PDF renderer carries the pdf.js runtime and its worker, so it is loaded
// only when a PDF is actually previewed instead of on every page that lists a
// file.
const PdfPreview = lazy(() => import('./pdf-preview.js'));

function fromRecord(record: FileRecord): FileAttachment {
  return {
    id: record.id,
    filename: record.filename,
    ext: record.ext,
    mimeType: record.mimeType,
    size: Number(record.size),
    contentUrl: record.contentUrl ?? '',
    uploadedById: '',
    createdAt: String(record.createdAt),
  };
}

/**
 * Keeps the processing indicator on screen long enough to be noticed.
 *
 * A local upload can finish between two frames; without a floor the control
 * would flash and a slow reviewer would reasonably conclude nothing happened.
 */
const MIN_BUSY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface AttachmentUploaderProps {
  readonly value: readonly FileAttachment[];
  readonly onChange: (files: readonly FileAttachment[]) => void;
  readonly disabled?: boolean;
  readonly onBusyChange?: (busy: boolean) => void;
}

/**
 * Selects and uploads up to five files of at most 5 MB each.
 *
 * Files are uploaded as they are selected, so the business form only ever
 * receives ids of stored files. An upload that fails leaves nothing behind and
 * shows the reason instead of pretending the file was saved.
 */
export function AttachmentUploader({
  value,
  onChange,
  disabled = false,
  onBusyChange,
}: AttachmentUploaderProps): ReactElement {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository: ClientFileRepository = useMemo(
    () => manager.repository('trainingFiles'),
    [manager],
  );

  const upload = async (selected: readonly File[]): Promise<void> => {
    setError(undefined);
    if (selected.length === 0) return;
    if (value.length + selected.length > FILE_MAX_COUNT) {
      setError(t('training.files.tooMany', { max: FILE_MAX_COUNT }));
      return;
    }
    for (const file of selected) {
      if (file.size === 0) {
        setError(t('training.files.emptyFile', { name: file.name }));
        return;
      }
      if (file.size > FILE_MAX_SIZE) {
        setError(
          t('training.files.tooLarge', {
            name: file.name,
            max: formatFileSize(FILE_MAX_SIZE),
          }),
        );
        return;
      }
    }
    setBusy(true);
    onBusyChange?.(true);
    const startedAt = Date.now();
    try {
      const result = await repository.uploadMany({ files: selected });
      onChange([...value, ...result.records.map(fromRecord)]);
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('training.files.uploadFailed')));
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_BUSY_MS) await delay(MIN_BUSY_MS - elapsed);
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>): void => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    void upload(selected);
  };

  const remove = (file: FileAttachment): void => {
    onChange(value.filter((item) => item.id !== file.id));
    void repository.deleteOne({ filter: { id: file.id } }).catch(() => {
      // Removing the metadata is best effort; the selection is already gone.
    });
  };

  return (
    <div className='space-y-3'>
      <input
        ref={inputRef}
        type='file'
        multiple
        className='hidden'
        onChange={handleInput}
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={disabled || busy || value.length >= FILE_MAX_COUNT}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <Loader2 className='size-4 animate-spin' aria-hidden />
          ) : (
            <Upload className='size-4' aria-hidden />
          )}
          {busy ? t('training.files.uploading') : t('training.files.choose')}
        </Button>
        <span className='text-xs text-muted-foreground'>
          {t('training.files.limits', {
            max: FILE_MAX_COUNT,
            size: formatFileSize(FILE_MAX_SIZE),
          })}
        </span>
      </div>
      {error ? (
        <p className='text-sm text-destructive' role='alert'>
          {error}
        </p>
      ) : null}
      {busy ? (
        <div className='space-y-1' role='status'>
          <Progress value={null} aria-label={t('training.files.uploading')} />
          <p className='text-xs text-muted-foreground'>
            {t('training.files.uploading')}
          </p>
        </div>
      ) : null}
      {value.length > 0 ? (
        <ul className='space-y-2'>
          {value.map((file) => (
            <li
              key={file.id}
              className='flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm'
            >
              <Paperclip
                className='size-4 shrink-0 text-muted-foreground'
                aria-hidden
              />
              <span className='min-w-0 flex-1 truncate'>{file.filename}</span>
              <span className='text-xs text-muted-foreground'>
                {formatFileSize(file.size)}
              </span>
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                aria-label={`${t('training.files.remove')}: ${file.filename}`}
                disabled={disabled || busy}
                onClick={() => remove(file)}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface AttachmentListProps {
  readonly files: readonly FileAttachment[];
  readonly emptyMessage?: string;
  readonly onRemove?: (file: FileAttachment) => void;
  readonly labelOf?: (file: FileAttachment) => string;
}

/** A grouped, read-only list of stored files with preview, download and remove. */
export function AttachmentList({
  files,
  emptyMessage,
  onRemove,
  labelOf,
}: AttachmentListProps): ReactElement {
  const { t } = useTranslation();
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  if (files.length === 0) {
    return (
      <p className='rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground'>
        {emptyMessage ?? t('training.files.empty')}
      </p>
    );
  }

  return (
    <>
      <ul className='space-y-2'>
        {files.map((file, index) => (
          <li
            key={file.id}
            className='flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm'
          >
            <Paperclip
              className='size-4 shrink-0 text-muted-foreground'
              aria-hidden
            />
            <span className='min-w-0 flex-1 truncate'>
              {labelOf ? labelOf(file) : file.filename}
            </span>
            <span className='text-xs text-muted-foreground'>
              {formatFileSize(file.size)}
            </span>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setPreviewIndex(index)}
            >
              <Eye className='size-4' aria-hidden />
              {t('training.files.preview')}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => downloadAttachment(file)}
            >
              <Download className='size-4' aria-hidden />
              {t('training.files.download')}
            </Button>
            {onRemove ? (
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                aria-label={`${t('training.files.remove')}: ${file.filename}`}
                onClick={() => onRemove(file)}
              >
                <Trash2 aria-hidden />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <FilePreviewDialog
        files={files}
        open={previewIndex !== null}
        initialIndex={previewIndex ?? 0}
        onOpenChange={(open) => {
          if (!open) setPreviewIndex(null);
        }}
      />
    </>
  );
}

interface FilePreviewDialogProps {
  readonly files: readonly FileAttachment[];
  readonly open: boolean;
  readonly initialIndex: number;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Renders a real preview: images with zoom, PDFs with the browser's page
 * navigation, and text inline. Formats the interface cannot render say so and
 * offer a download instead of showing an empty frame.
 */
export function FilePreviewDialog({
  files,
  open,
  initialIndex,
  onOpenChange,
}: FilePreviewDialogProps): ReactElement | null {
  if (!open || files.length === 0) return null;
  return (
    <OpenFilePreviewDialog
      files={files}
      initialIndex={Math.min(Math.max(initialIndex, 0), files.length - 1)}
      onOpenChange={onOpenChange}
    />
  );
}

function OpenFilePreviewDialog({
  files,
  initialIndex,
  onOpenChange,
}: {
  readonly files: readonly FileAttachment[];
  readonly initialIndex: number;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [index, setIndex] = useState(initialIndex);
  const file = files[Math.min(Math.max(index, 0), files.length - 1)];
  if (!file) {
    // `files` is non-empty and `index` is clamped, so this is unreachable.
    return <span />;
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[calc(100vh-2rem)] max-w-4xl flex-col overflow-hidden'>
        <DialogHeader>
          <DialogTitle className='truncate'>{file.filename}</DialogTitle>
        </DialogHeader>
        <PreviewBody key={file.id} file={file} />
        <div className='flex items-center justify-between gap-2 border-t border-border pt-3'>
          <div className='flex gap-1'>
            {files.length > 1 ? (
              <>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() =>
                    setIndex(
                      (value) => (value - 1 + files.length) % files.length,
                    )
                  }
                >
                  {t('training.files.previous')}
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() =>
                    setIndex((value) => (value + 1) % files.length)
                  }
                >
                  {t('training.files.next')}
                </Button>
              </>
            ) : null}
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => downloadAttachment(file)}
          >
            <Download className='size-4' aria-hidden />
            {t('training.files.download')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({
  file,
}: {
  readonly file: FileAttachment;
}): ReactElement {
  const { t } = useTranslation();
  const kind = useMemo(() => previewKind(file), [file]);
  const [text, setText] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>(() =>
    file.contentUrl ? undefined : t('training.files.missingUrl'),
  );
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!file.contentUrl) return undefined;
    if (kind !== 'text') return undefined;
    const controller = new AbortController();
    void fetch(file.contentUrl, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const body = await response.text();
        if (!controller.signal.aborted) setText(body);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          t('training.files.previewFailed', {
            reason: cause instanceof Error ? cause.message : '',
          }),
        );
      });
    return () => controller.abort();
  }, [file.contentUrl, kind, t]);

  if (error) {
    return (
      <div
        className='flex flex-col items-center gap-3 py-10 text-center'
        role='alert'
      >
        <FileQuestion className='size-10 text-muted-foreground' aria-hidden />
        <p className='text-sm text-destructive'>{error}</p>
        <DownloadButton file={file} />
      </div>
    );
  }

  switch (kind) {
    case 'image':
      return (
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              size='icon-sm'
              aria-label={t('training.files.zoomOut')}
              onClick={() => setScale((value) => Math.max(0.25, value - 0.25))}
            >
              <Minus aria-hidden />
            </Button>
            <span className='w-14 text-center text-xs text-muted-foreground'>
              {Math.round(scale * 100)}%
            </span>
            <Button
              type='button'
              variant='outline'
              size='icon-sm'
              aria-label={t('training.files.zoomIn')}
              onClick={() => setScale((value) => Math.min(5, value + 0.25))}
            >
              <Plus aria-hidden />
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              aria-label={t('training.files.zoomReset')}
              onClick={() => setScale(1)}
            >
              <RotateCcw aria-hidden />
            </Button>
          </div>
          <div className='max-h-[65vh] overflow-auto rounded-md border border-border bg-muted/30 p-2'>
            <img
              src={file.contentUrl}
              alt={file.filename}
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
              className='block max-w-none transition-transform'
            />
          </div>
        </div>
      );
    case 'pdf':
      return (
        <Suspense fallback={<Loading />}>
          <PdfPreview file={file} />
        </Suspense>
      );
    case 'text':
      return text === undefined ? (
        <Loading />
      ) : (
        <pre className='max-h-[65vh] overflow-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap'>
          {text}
        </pre>
      );
    default:
      return (
        <div className='flex flex-col items-center gap-3 py-10 text-center'>
          <FileQuestion className='size-10 text-muted-foreground' aria-hidden />
          <p className='text-sm text-muted-foreground'>
            {t('training.files.unsupported', { name: file.filename })}
          </p>
          <DownloadButton file={file} />
        </div>
      );
  }
}

function DownloadButton({
  file,
}: {
  readonly file: FileAttachment;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Button type='button' size='sm' onClick={() => downloadAttachment(file)}>
      <Download className='size-4' aria-hidden />
      {t('training.files.download')}
    </Button>
  );
}

function Loading(): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className='flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground'
      role='status'
    >
      <Loader2 className='size-4 animate-spin' aria-hidden />
      {t('training.files.loading')}
    </div>
  );
}
