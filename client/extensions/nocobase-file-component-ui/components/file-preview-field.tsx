import { useTranslation } from '@nocobase/i18n/client';
import { Download } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import type { FileRecord, FilePreviewFieldProps } from '../types';
import { Button } from '@/components/ui/button';
import { FilePreviewDialog } from './file-preview-dialog';
import { FileThumbnail } from './file-thumbnail';
import { downloadFile } from '../lib/file-download';

export function FilePreviewField(
  inputProps: FilePreviewFieldProps,
): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-file');
  const {
    files,
    labels,
    emptyState,
    showFilenames = false,
    onError,
    allowDownload = false,
    onDownload,
  } = inputProps;

  const downloadLabel =
    labels?.download ?? t('files.download', { defaultValue: 'Download' });

  const handleDownload = (file: FileRecord): void => {
    void Promise.resolve(
      onDownload ? onDownload(file) : downloadFile(file),
    ).catch((error: unknown) =>
      onError?.(
        error instanceof Error ? error : new Error('File download failed.'),
      ),
    );
  };

  const [open, setOpen] = useState(false);
  const [initialIndex, setInitialIndex] = useState(0);
  if (!files.length)
    return (
      <>
        {emptyState ?? (
          <span role='status'>
            {t('files.empty', { defaultValue: 'No files.' })}
          </span>
        )}
      </>
    );
  return (
    <>
      <div data-slot='file-preview-field' className='flex flex-wrap gap-2'>
        {files.map((file, index) => (
          <div key={file.id} className='flex max-w-36 flex-col gap-1'>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='h-12 w-12 overflow-hidden'
              aria-label={`${labels?.preview ?? t('files.preview', { defaultValue: 'Preview' })}: ${file.filename}`}
              onClick={() => {
                setInitialIndex(index);
                setOpen(true);
              }}
            >
              <FileThumbnail file={file} />
            </Button>
            {showFilenames ? (
              <span className='truncate text-xs' title={file.filename}>
                {file.filename}
              </span>
            ) : null}
            {allowDownload ? (
              <Button
                type='button'
                size='xs'
                variant='outline'
                aria-label={`${downloadLabel}: ${file.filename}`}
                onClick={() => handleDownload(file)}
              >
                <Download aria-hidden='true' />
                {downloadLabel}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      <FilePreviewDialog
        files={files}
        initialIndex={initialIndex}
        open={open}
        onOpenChange={setOpen}
        labels={labels}
        onError={onError}
      />
    </>
  );
}
