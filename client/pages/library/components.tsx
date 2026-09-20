import { useTranslation } from '@nocobase/i18n/client';
import {
  File as FileIcon,
  FileImage,
  FileText,
  FileArchive,
  Download,
  AlertCircle,
} from 'lucide-react';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import {
  fileContentUrl,
  type BorrowingStatus,
  type MaterialFileDto,
} from './api.js';
import { formatBytes } from './format.js';
import { PdfPreview } from './pdf-preview.js';

export function StatusBadge({
  status,
}: {
  readonly status: BorrowingStatus;
}): ReactElement {
  const { t } = useTranslation();
  const tone: Record<BorrowingStatus, string> = {
    pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    borrowed: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    returned: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    cancelled: 'bg-muted text-muted-foreground',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone[status],
      )}
    >
      {t(`library.status.${status}`, { defaultValue: status })}
    </span>
  );
}

export function Badge({
  children,
  tone = 'muted',
}: {
  readonly children: ReactNode;
  readonly tone?: 'muted' | 'primary' | 'warning';
}): ReactElement {
  const tones = {
    muted: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Alert({
  tone = 'error',
  children,
}: {
  readonly tone?: 'error' | 'info';
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
        tone === 'error'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-border bg-muted/50 text-muted-foreground',
      )}
    >
      {tone === 'error' ? (
        <AlertCircle className='mt-0.5 size-4 shrink-0' />
      ) : null}
      <div className='min-w-0'>{children}</div>
    </div>
  );
}

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly busy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button disabled={busy} onClick={onCancel} variant='outline'>
            {t('actions.cancel')}
          </Button>
          <Button disabled={busy} onClick={onConfirm} variant='destructive'>
            {busy ? <Spinner /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PreviewIcon({
  file,
}: {
  readonly file: MaterialFileDto;
}): ReactElement {
  const className = 'size-4 shrink-0 text-muted-foreground';
  if (file.previewKind === 'image') return <FileImage className={className} />;
  if (file.previewKind === 'pdf') return <FileText className={className} />;
  if (file.ext === 'zip' || file.ext === 'rar' || file.ext === '7z')
    return <FileArchive className={className} />;
  return <FileIcon className={className} />;
}

export interface FilePreviewDialogProps {
  readonly file: MaterialFileDto | null;
  readonly onClose: () => void;
}

export function FilePreviewDialog({
  file,
  onClose,
}: FilePreviewDialogProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          file?.previewKind === 'image' || file?.previewKind === 'pdf'
            ? 'sm:max-w-3xl'
            : 'sm:max-w-md',
        )}
      >
        <DialogHeader>
          <DialogTitle className='truncate'>{file?.filename ?? ''}</DialogTitle>
          <DialogDescription>
            {file ? formatBytes(file.size) : ''}
          </DialogDescription>
        </DialogHeader>
        {file ? <PreviewBody file={file} key={file.id} /> : null}
        <DialogFooter>
          {file ? (
            <DownloadLink fileId={file.id} label={t('library.download')} />
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A same-origin download link styled like a ghost button; avoids nesting a button inside an anchor. */
export function DownloadLink({
  fileId,
  label,
}: {
  readonly fileId: string;
  readonly label: string;
}): ReactElement {
  return (
    <a
      className='inline-flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-sm font-medium transition-colors hover:bg-muted'
      download
      href={fileContentUrl(fileId, true)}
    >
      <Download className='size-3.5' />
      {label}
    </a>
  );
}

function PreviewBody({
  file,
}: {
  readonly file: MaterialFileDto;
}): ReactElement {
  const { t } = useTranslation();
  if (file.previewKind === 'image') {
    return (
      <img
        alt={file.filename}
        className='mx-auto max-h-[75vh] w-auto max-w-full rounded-md border border-border object-contain'
        src={fileContentUrl(file.id)}
      />
    );
  }
  if (file.previewKind === 'pdf') {
    // Never point an iframe at the content URL: the browser would hand the file to its built-in
    // PDF plugin and navigate away from the application, which leaves a blank page wherever that
    // plugin is unavailable. PDF.js paints the pages in place instead.
    return <PdfPreview file={file} />;
  }
  if (file.previewKind === 'text') {
    return <TextPreview file={file} />;
  }
  return (
    <Alert tone='info'>
      <p className='font-medium'>{t('library.previewUnsupported')}</p>
      <p className='mt-1'>
        {t('library.previewUnsupportedHint', {
          defaultValue:
            'This file type cannot be previewed in the browser. Download it to open it locally.',
        })}
      </p>
    </Alert>
  );
}

function TextPreview({
  file,
}: {
  readonly file: MaterialFileDto;
}): ReactElement {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const response = await fetch(fileContentUrl(file.id), {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const value = await response.text();
        if (active) setText(value);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [file.id]);

  if (failed) {
    return <Alert tone='error'>{t('library.previewFailed')}</Alert>;
  }
  if (text === null) {
    return (
      <div className='flex items-center gap-2 py-8 text-sm text-muted-foreground'>
        <Spinner />
        {t('library.previewLoading')}
      </div>
    );
  }
  return (
    <pre className='max-h-[70vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap break-words'>
      {text}
    </pre>
  );
}
