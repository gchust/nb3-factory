import { UploadCloud, X } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import { useInspectionApi } from './api.js';
import { extensionOf, formatBytes } from './format.js';
import {
  ALLOWED_PHOTO_EXTENSIONS,
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  type Photo,
} from './types.js';

export interface PhotoUploadProps {
  readonly value: readonly Photo[];
  readonly onChange: (next: readonly Photo[]) => void;
  readonly disabled?: boolean;
}

type ValidationFailure = 'invalidType' | 'tooLarge' | 'tooMany';

/**
 * Local-file picker for site photos. Files are uploaded immediately and only
 * their returned ids are submitted with the record, so a record can never be
 * saved without at least one stored photo.
 */
export function PhotoUpload({
  value,
  onChange,
  disabled = false,
}: PhotoUploadProps): ReactElement {
  const { t } = useTranslation();
  const api = useInspectionApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState<ValidationFailure>();
  const [failedName, setFailedName] = useState('');
  const [uploadError, setUploadError] = useState(false);

  const handleSelect = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    setUploadError(false);
    if (value.length + files.length > MAX_PHOTOS) {
      setFailure('tooMany');
      return;
    }
    for (const file of files) {
      const extension = extensionOf(file.name);
      const mime = file.type.toLowerCase();
      if (
        !ALLOWED_PHOTO_EXTENSIONS.includes(extension) ||
        (mime !== '' && !mime.startsWith('image/'))
      ) {
        setFailure('invalidType');
        setFailedName(file.name);
        return;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setFailure('tooLarge');
        setFailedName(file.name);
        return;
      }
    }

    setFailure(undefined);
    setFailedName('');
    setUploading(true);
    try {
      const uploaded = await api.uploadPhotos(files);
      onChange([...value, ...uploaded]);
    } catch {
      setUploadError(true);
    } finally {
      setUploading(false);
    }
  };

  const remove = (fileId: string): void => {
    onChange(value.filter((photo) => photo.fileId !== fileId));
  };

  return (
    <div className='space-y-3'>
      <input
        accept='image/*'
        className='sr-only'
        disabled={disabled || uploading}
        multiple
        onChange={(event) => void handleSelect(event)}
        ref={inputRef}
        type='file'
      />
      <div className='flex items-center gap-3'>
        <Button
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          type='button'
          variant='outline'
        >
          <UploadCloud />
          {uploading
            ? t('inspection.upload.uploading')
            : t('inspection.upload.choose')}
        </Button>
        <span className='text-xs text-muted-foreground'>
          {t('inspection.upload.hint', { max: MAX_PHOTOS })}
        </span>
      </div>

      {failure ? (
        <Alert variant='destructive'>
          <AlertDescription>
            {t(`inspection.upload.${failure}`, {
              name: failedName,
              max:
                failure === 'tooLarge'
                  ? formatBytes(MAX_PHOTO_BYTES)
                  : MAX_PHOTOS,
            })}
          </AlertDescription>
        </Alert>
      ) : null}
      {uploadError ? (
        <Alert variant='destructive'>
          <AlertDescription>{t('inspection.upload.failed')}</AlertDescription>
        </Alert>
      ) : null}

      {value.length > 0 ? (
        <ul className='flex flex-wrap gap-3'>
          {value.map((photo) => (
            <li className='relative' key={photo.fileId}>
              <img
                alt={photo.filename}
                className='size-24 rounded-lg border border-border object-cover'
                src={photo.contentUrl}
              />
              <p className='mt-1 max-w-24 truncate text-xs text-muted-foreground'>
                {photo.filename}
              </p>
              <Button
                aria-label={t('inspection.upload.remove', {
                  name: photo.filename,
                })}
                className='absolute top-1 right-1'
                disabled={disabled}
                onClick={() => remove(photo.fileId)}
                size='icon-xs'
                type='button'
                variant='destructive'
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
