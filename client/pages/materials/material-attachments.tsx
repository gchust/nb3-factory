import { useTranslation } from '@nocobase/i18n/client';
import { Download, Eye } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { FilePreviewDialog } from '../../extensions/nocobase-file-component-ui/components/file-preview-dialog.js';
import type { FileRecord } from '../../extensions/nocobase-file-component-ui/index.js';
import { FileThumbnail } from '../../extensions/nocobase-file-component-ui/index.js';
import { resolveSafeFileUrl } from '../../extensions/nocobase-file-component-ui/lib/file-url.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * The attachments of one material, with a preview and a download action each.
 *
 * The list reuses the File component library's dialog for the actual preview, but renders the row itself: a
 * corrupt image has to say so in place. The library's thumbnail is a bare `<img>` with no failure state, so the
 * left tile here loads the image itself and, when the bytes cannot be decoded, replaces it with an explanation
 * and marks the row. That is what keeps "a filename" from standing in for a successful preview.
 */

function isPreviewableImage(file: FileRecord): boolean {
  const mimeType = file.mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return mimeType.startsWith('image/');
}

function triggerDownload(file: FileRecord): void {
  const url = file.contentUrl ? resolveSafeFileUrl(file.contentUrl) : undefined;
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.rel = 'noopener';
  link.click();
}

interface AttachmentRowProps {
  readonly file: FileRecord;
  readonly onPreview: () => void;
}

function AttachmentRow({ file, onPreview }: AttachmentRowProps): ReactElement {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  const url = file.contentUrl ? resolveSafeFileUrl(file.contentUrl) : undefined;
  const image = isPreviewableImage(file);

  return (
    <li className='flex flex-wrap items-start gap-3 rounded-md border p-3'>
      <div className='flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/40'>
        {image && url && !broken ? (
          <img
            src={url}
            alt={file.filename}
            className='h-full w-full object-cover'
            onError={() => setBroken(true)}
          />
        ) : (
          <div className='size-14 p-2'>
            <FileThumbnail file={file} />
          </div>
        )}
      </div>
      <div className='min-w-0 flex-1 space-y-2'>
        <div className='truncate font-medium' title={file.filename}>
          {file.filename}
        </div>
        <div className='text-xs text-muted-foreground'>{file.mimeType}</div>
        {image && broken ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('materials.attachmentBrokenTitle')}</AlertTitle>
            <AlertDescription>
              {t('materials.attachmentBrokenDescription')}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        <Button type='button' variant='outline' size='sm' onClick={onPreview}>
          <Eye data-icon='inline-start' />
          {t('materials.preview')}
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => triggerDownload(file)}
        >
          <Download data-icon='inline-start' />
          {t('materials.download')}
        </Button>
      </div>
    </li>
  );
}

export interface MaterialAttachmentListProps {
  readonly files: readonly FileRecord[];
}

export function MaterialAttachmentList({
  files,
}: MaterialAttachmentListProps): ReactElement {
  const { t } = useTranslation();
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  if (!files.length) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('materials.noAttachments')}
      </p>
    );
  }

  return (
    <>
      <ul className='grid gap-3'>
        {files.map((file, index) => (
          <AttachmentRow
            key={file.id}
            file={file}
            onPreview={() => setPreviewIndex(index)}
          />
        ))}
      </ul>
      <FilePreviewDialog
        files={files}
        initialIndex={previewIndex ?? 0}
        open={previewIndex !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewIndex(null);
        }}
      />
    </>
  );
}
