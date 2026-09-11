import { Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import {
  FilePreviewDialog,
  FileThumbnail,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';
import { Button } from '@/components/ui/button';

export interface PhotoGridProps {
  readonly name: string;
  readonly photos: readonly FileRecord[];
  readonly emptyText: string;
  readonly previewLabel?: string;
  readonly removeLabel?: string;
  readonly onDelete?: (photo: FileRecord) => void;
  readonly onError?: (error: Error) => void;
}

/**
 * Compact image grid for inspection site photos: click to open the preview
 * dialog, optionally delete one photo without touching the others (each photo
 * row is independent).
 */
export function PhotoGrid({
  name,
  photos,
  emptyText,
  previewLabel = 'Preview',
  removeLabel = 'Remove',
  onDelete,
  onError,
}: PhotoGridProps): ReactElement {
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!photos.length) {
    return <p className='text-sm text-muted-foreground'>{emptyText}</p>;
  }

  return (
    <>
      <ul
        className='grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6'
        aria-label={name}
      >
        {photos.map((photo, index) => (
          <li
            key={photo.id}
            className='relative overflow-hidden rounded-md border'
          >
            <Button
              type='button'
              variant='ghost'
              className='block h-auto w-full rounded-none p-0'
              aria-label={`${previewLabel}: ${photo.filename}`}
              onClick={() => {
                setPreviewIndex(index);
                setPreviewOpen(true);
              }}
            >
              <span className='block aspect-square w-full'>
                <FileThumbnail file={photo} />
              </span>
            </Button>
            {onDelete ? (
              <Button
                type='button'
                size='icon'
                variant='ghost'
                className='absolute right-1 bottom-1 h-7 w-7 rounded-full bg-background/80 shadow-sm'
                aria-label={`${removeLabel}: ${photo.filename}`}
                onClick={() => onDelete(photo)}
              >
                <Trash2 className='size-3.5' aria-hidden='true' />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <FilePreviewDialog
        files={photos}
        initialIndex={previewIndex}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onError={onError}
      />
    </>
  );
}
