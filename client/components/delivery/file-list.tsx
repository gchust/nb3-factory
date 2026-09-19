import { useTranslation } from '@nocobase/i18n/client';
import {
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { formatBytes, type DeliveryFile } from '@/lib/delivery';

import { FilePreviewDialog } from './file-preview.js';

export interface DeliveryFileListProps {
  readonly files: readonly DeliveryFile[];
  readonly onRemove?: (file: DeliveryFile) => void;
  readonly emptyLabel?: string;
  readonly showActions?: boolean;
}

export function DeliveryFileList({
  files,
  onRemove,
  emptyLabel,
  showActions = true,
}: DeliveryFileListProps): ReactElement {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<DeliveryFile | null>(null);

  if (!files.length) {
    return (
      <p className='text-sm text-muted-foreground'>
        {emptyLabel ?? t('delivery.file.empty')}
      </p>
    );
  }

  return (
    <div className='space-y-2'>
      <ul className='space-y-2'>
        {files.map((file) => (
          <li
            className='flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2'
            key={file.id}
          >
            <span className='text-muted-foreground'>
              {file.mimeType.startsWith('image/') ? (
                <ImageIcon className='size-4' />
              ) : (
                <FileText className='size-4' />
              )}
            </span>
            <span className='min-w-0 flex-1 truncate text-sm'>
              {file.filename}
            </span>
            <span className='text-xs text-muted-foreground'>
              {formatBytes(file.size)}
            </span>
            {showActions ? (
              <span className='flex items-center gap-1'>
                <Button
                  aria-label={`${t('delivery.file.preview')} ${file.filename}`}
                  onClick={() => setPreview(file)}
                  size='icon-sm'
                  type='button'
                  variant='ghost'
                >
                  <Eye />
                </Button>
                <Button
                  aria-label={`${t('delivery.file.download')} ${file.filename}`}
                  nativeButton={false}
                  render={<a download={file.filename} href={file.contentUrl} />}
                  size='icon-sm'
                  variant='ghost'
                >
                  <Download />
                </Button>
                {onRemove ? (
                  <Button
                    aria-label={`${t('delivery.file.remove')} ${file.filename}`}
                    onClick={() => onRemove(file)}
                    size='icon-sm'
                    type='button'
                    variant='ghost'
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <FilePreviewDialog file={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
