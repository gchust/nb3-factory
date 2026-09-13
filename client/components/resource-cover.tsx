import { ImageOff } from 'lucide-react';
import type { ReactElement } from 'react';

import { isImageFile, resolveFileUrl } from '@/lib/file-utils';
import { cn } from '@/lib/utils';

export interface CoverFile {
  readonly filename: string;
  readonly mimeType: string;
  readonly ext?: string;
  readonly contentUrl?: string;
}

export interface ResourceCoverProps {
  readonly file: CoverFile | null;
  readonly className?: string;
  readonly emptyLabel: string;
}

/** Shows the cover image inline, or the empty state when there is no usable image. */
export function ResourceCover({
  file,
  className,
  emptyLabel,
}: ResourceCoverProps): ReactElement {
  const url =
    file && isImageFile(file) ? resolveFileUrl(file.contentUrl) : undefined;

  return (
    <div
      data-slot='resource-cover'
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-md border bg-muted/40',
        className,
      )}
    >
      {file && url ? (
        <img
          src={url}
          alt={file.filename}
          className='h-full w-full object-cover'
        />
      ) : (
        <span
          className='flex flex-col items-center gap-1 p-3 text-center text-xs text-muted-foreground'
          role='img'
          aria-label={emptyLabel}
        >
          <ImageOff aria-hidden='true' className='size-5' />
          {emptyLabel}
        </span>
      )}
    </div>
  );
}
