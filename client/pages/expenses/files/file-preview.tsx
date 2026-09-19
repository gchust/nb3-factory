import { useTranslation } from '@nocobase/i18n/client';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

import type { ExpenseFileView } from '../api.js';
import {
  downloadFile,
  fileUrlCredentials,
  formatFileSize,
  resolvePreviewKind,
  resolveSafeFileUrl,
} from './file-utils.js';
import { PdfPreview } from './pdf-preview.js';

export function ExpenseFilePreviewDialog({
  files,
  initialIndex = 0,
  open,
  onOpenChange,
}: {
  readonly files: readonly ExpenseFileView[];
  readonly initialIndex?: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement | null {
  if (!open || files.length === 0) return null;
  const normalized = Math.max(0, Math.min(initialIndex, files.length - 1));
  return (
    <OpenPreviewDialog
      files={files}
      initialIndex={normalized}
      onOpenChange={onOpenChange}
    />
  );
}

function OpenPreviewDialog({
  files,
  initialIndex,
  onOpenChange,
}: {
  readonly files: readonly ExpenseFileView[];
  readonly initialIndex: number;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const [index, setIndex] = useState(initialIndex);
  const file = files[index];
  if (!file) return null;
  const url = resolveSafeFileUrl(file.contentUrl);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[calc(100vh-2rem)] max-w-4xl flex-col overflow-auto'>
        <div className='flex items-start justify-between gap-3 pr-8'>
          <div className='min-w-0'>
            <DialogTitle className='truncate'>{file.filename}</DialogTitle>
            <p className='text-sm text-muted-foreground'>
              {file.mimeType} · {formatFileSize(file.size)}
            </p>
          </div>
          <div className='flex shrink-0 items-center gap-1'>
            {files.length > 1 ? (
              <>
                <Button
                  aria-label={t('expenses.files.previous')}
                  onClick={() =>
                    setIndex(
                      (value) => (value - 1 + files.length) % files.length,
                    )
                  }
                  size='icon'
                  type='button'
                  variant='ghost'
                >
                  <ChevronLeft aria-hidden='true' />
                </Button>
                <Button
                  aria-label={t('expenses.files.next')}
                  onClick={() =>
                    setIndex((value) => (value + 1) % files.length)
                  }
                  size='icon'
                  type='button'
                  variant='ghost'
                >
                  <ChevronRight aria-hidden='true' />
                </Button>
              </>
            ) : null}
            <Button
              aria-label={`${t('expenses.files.download')}: ${file.filename}`}
              disabled={!url}
              onClick={() => {
                if (url) downloadFile(url, file.filename);
              }}
              size='icon'
              type='button'
              variant='ghost'
            >
              <Download aria-hidden='true' />
            </Button>
          </div>
        </div>

        <PreviewBody
          key={`${file.id}:${file.contentUrl}`}
          file={file}
          url={url}
        />
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({
  file,
  url,
}: {
  readonly file: ExpenseFileView;
  readonly url: string | undefined;
}): ReactElement {
  const { t } = useTranslation();
  const kind = resolvePreviewKind(file);
  const [imageFailed, setImageFailed] = useState(false);
  const [text, setText] = useState<string>();
  // The dialog remounts this view per file, so a missing URL is a stable failure.
  const [failed, setFailed] = useState(() => !url);
  const handlePdfFailure = useCallback(() => setFailed(true), []);

  useEffect(() => {
    if (!url || (kind !== 'text' && kind !== 'markdown')) {
      return undefined;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, {
          credentials: fileUrlCredentials(url),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('preview failed');
        const body = await response.text();
        if (!controller.signal.aborted) setText(body);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    })();
    return () => controller.abort();
  }, [file.id, kind, url]);

  if (kind === 'image' && url && !imageFailed) {
    return (
      <ImagePreview
        file={file}
        url={url}
        onError={() => setImageFailed(true)}
      />
    );
  }
  if (kind === 'image' && imageFailed) {
    return (
      <Unsupported
        file={file}
        message={t('expenses.files.imageUnavailable')}
        url={url}
      />
    );
  }
  if (kind === 'unsupported') {
    return <Unsupported file={file} url={url} />;
  }
  if (kind === 'pdf') {
    if (!url || failed) {
      return (
        <Unsupported
          file={file}
          message={failed ? t('expenses.files.previewFailed') : undefined}
          url={url}
        />
      );
    }
    return <PdfPreview file={file} onFailure={handlePdfFailure} url={url} />;
  }
  if (failed) {
    return (
      <Unsupported
        file={file}
        message={t('expenses.files.previewFailed')}
        url={url}
      />
    );
  }
  if (kind === 'audio') {
    return <audio className='w-full' controls src={url} />;
  }
  if (kind === 'video') {
    return (
      <video
        className='max-h-[70vh] max-w-full rounded-md'
        controls
        src={url}
      />
    );
  }
  return (
    <div className='space-y-2'>
      {text === undefined ? (
        <Loading />
      ) : (
        <pre className='max-h-[65vh] overflow-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap'>
          {text}
        </pre>
      )}
    </div>
  );
}

function ImagePreview({
  file,
  url,
  onError,
}: {
  readonly file: ExpenseFileView;
  readonly url: string;
  readonly onError: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const step = 0.25;
  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-center gap-2'>
        <Button
          aria-label={t('expenses.files.zoomOut')}
          onClick={() => setScale((value) => Math.max(0.5, value - step))}
          size='icon'
          type='button'
          variant='ghost'
        >
          <Minus aria-hidden='true' />
        </Button>
        <span className='w-14 text-center text-sm tabular-nums'>
          {Math.round(scale * 100)}%
        </span>
        <Button
          aria-label={t('expenses.files.zoomIn')}
          onClick={() => setScale((value) => Math.min(4, value + step))}
          size='icon'
          type='button'
          variant='ghost'
        >
          <Plus aria-hidden='true' />
        </Button>
        <Button
          aria-label={t('expenses.files.zoomReset')}
          onClick={() => setScale(1)}
          size='icon'
          type='button'
          variant='ghost'
        >
          <RotateCcw aria-hidden='true' />
        </Button>
      </div>
      <div className='flex max-h-[65vh] items-center justify-center overflow-auto rounded-md border border-border bg-muted/30 p-2'>
        <img
          alt={file.filename}
          className='max-h-[60vh] max-w-full cursor-zoom-in object-contain'
          onClick={() => setScale((value) => (value > 1 ? 1 : 2))}
          onError={onError}
          src={url}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            transition: 'transform 120ms ease',
          }}
        />
      </div>
    </div>
  );
}

function Loading(): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className='py-8 text-center text-sm text-muted-foreground'
      role='status'
    >
      {t('expenses.files.loading')}
    </div>
  );
}

function Unsupported({
  file,
  url,
  message,
}: {
  readonly file: ExpenseFileView;
  readonly url: string | undefined;
  readonly message?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col items-center gap-3 py-10 text-center'>
      <FileText aria-hidden='true' className='text-muted-foreground' />
      <p className='max-w-md text-sm text-muted-foreground'>
        {message ?? t('expenses.files.previewUnavailable')}
      </p>
      <Button
        disabled={!url}
        onClick={() => {
          if (url) downloadFile(url, file.filename);
        }}
        type='button'
      >
        <Download aria-hidden='true' />
        {t('expenses.files.download')}
      </Button>
    </div>
  );
}
