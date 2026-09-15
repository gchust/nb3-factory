import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

import { formatBytes } from './format.js';
import type { Photo } from './types.js';

export interface PhotoGalleryProps {
  readonly photos: readonly Photo[];
  readonly canDelete?: boolean;
  readonly deletingFileId?: string;
  readonly onDelete?: (fileId: string) => void;
}

/**
 * Thumbnails for one record. A click opens the large preview; when the caller
 * may delete, each thumbnail also offers a single-photo delete that never
 * touches its siblings.
 */
export function PhotoGallery({
  photos,
  canDelete = false,
  deletingFileId,
  onDelete,
}: PhotoGalleryProps): ReactElement {
  const { t } = useTranslation();
  const [previewIndex, setPreviewIndex] = useState<number>();

  if (photos.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('inspection.detail.photosEmpty')}
      </p>
    );
  }

  const preview = previewIndex === undefined ? undefined : photos[previewIndex];
  const hasPrevious = previewIndex !== undefined && previewIndex > 0;
  const hasNext =
    previewIndex !== undefined && previewIndex < photos.length - 1;

  return (
    <>
      <ul className='flex flex-wrap gap-3'>
        {photos.map((photo, index) => (
          <li className='relative' key={photo.fileId}>
            <button
              aria-label={t('inspection.gallery.preview', {
                name: photo.filename,
              })}
              className='block overflow-hidden rounded-lg border border-border bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
              onClick={() => setPreviewIndex(index)}
              type='button'
            >
              <img
                alt={photo.filename}
                className='size-28 object-cover'
                src={photo.contentUrl}
              />
            </button>
            <p className='mt-1 max-w-28 truncate text-xs text-muted-foreground'>
              {photo.filename}
            </p>
            {canDelete && onDelete ? (
              <Button
                aria-label={t('inspection.gallery.delete', {
                  name: photo.filename,
                })}
                className='absolute top-1 right-1'
                disabled={deletingFileId === photo.fileId}
                onClick={() => onDelete(photo.fileId)}
                size='icon-xs'
                type='button'
                variant='destructive'
              >
                <Trash2 />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <Dialog
        open={previewIndex !== undefined}
        onOpenChange={(open: boolean) => {
          if (!open) setPreviewIndex(undefined);
        }}
      >
        <DialogContent className='sm:max-w-3xl'>
          <DialogTitle>{preview?.filename}</DialogTitle>
          <DialogDescription>
            {preview ? formatBytes(preview.size) : null}
          </DialogDescription>
          {preview ? (
            <img
              alt={preview.filename}
              className='max-h-[70vh] w-full object-contain'
              src={preview.contentUrl}
            />
          ) : null}
          <div className='flex justify-between'>
            <Button
              disabled={!hasPrevious}
              onClick={() =>
                setPreviewIndex((current) =>
                  current === undefined ? current : current - 1,
                )
              }
              type='button'
              variant='outline'
            >
              <ChevronLeft />
              {t('inspection.gallery.previous')}
            </Button>
            <Button
              disabled={!hasNext}
              onClick={() =>
                setPreviewIndex((current) =>
                  current === undefined ? current : current + 1,
                )
              }
              type='button'
              variant='outline'
            >
              {t('inspection.gallery.next')}
              <ChevronRight />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
