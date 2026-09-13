import { UploadCloud, X } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { isImageFile } from '@/lib/file-utils';

export interface UploadedFile {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly contentUrl: string;
}

export interface FileUploadFieldLabels {
  readonly choose: string;
  readonly uploading: string;
  readonly remove: string;
  readonly failed: string;
}

export type FileUploadStatus = 'idle' | 'uploading' | 'error';

export interface FileUploadFieldProps {
  readonly value: UploadedFile | null;
  readonly onChange: (file: UploadedFile | null) => void;
  readonly upload: (file: File) => Promise<UploadedFile>;
  readonly accept?: readonly string[];
  readonly labels: FileUploadFieldLabels;
  readonly disabled?: boolean;
  readonly onStatusChange?: (status: FileUploadStatus) => void;
}

/**
 * A single-file upload field. The file is stored as soon as it is chosen and the surrounding
 * form only keeps the returned record; the form stays disabled while an upload is in flight.
 */
export function FileUploadField({
  value,
  onChange,
  upload,
  accept = [],
  labels,
  disabled = false,
  onStatusChange,
}: FileUploadFieldProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setFailed(false);
    setUploading(true);
    onStatusChange?.('uploading');
    upload(file)
      .then((record) => {
        onChange(record);
        onStatusChange?.('idle');
      })
      .catch(() => {
        setFailed(true);
        onStatusChange?.('error');
      })
      .finally(() => {
        setUploading(false);
      });
  };

  const chooseLabel = uploading ? labels.uploading : labels.choose;

  return (
    <div data-slot='file-upload-field' className='space-y-2'>
      {value ? (
        <div className='flex items-center gap-3 rounded-md border p-2'>
          <span
            className={`size-8 shrink-0 overflow-hidden rounded ${
              isImageFile(value) ? '' : 'bg-muted'
            }`}
          >
            {isImageFile(value) && value.contentUrl ? (
              <img
                src={value.contentUrl}
                alt={value.filename}
                className='h-full w-full object-cover'
              />
            ) : null}
          </span>
          <span
            className='min-w-0 flex-1 truncate text-sm font-medium'
            title={value.filename}
          >
            {value.filename}
          </span>
          <Button
            type='button'
            size='icon'
            variant='ghost'
            aria-label={`${labels.remove}: ${value.filename}`}
            title={labels.remove}
            disabled={disabled || uploading}
            onClick={() => {
              setFailed(false);
              onChange(null);
            }}
          >
            <X aria-hidden='true' />
          </Button>
        </div>
      ) : null}

      <Button
        type='button'
        variant='outline'
        disabled={disabled || uploading || value !== null}
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloud aria-hidden='true' />
        {chooseLabel}
      </Button>

      <input
        ref={inputRef}
        type='file'
        className='sr-only'
        accept={accept.join(',')}
        aria-label={labels.choose}
        disabled={disabled || uploading}
        onChange={handleChange}
      />

      <div className='sr-only' aria-live='polite'>
        {uploading ? labels.uploading : ''}
      </div>
      {failed ? (
        <p role='alert' className='text-sm text-destructive'>
          {labels.failed}
        </p>
      ) : null}
    </div>
  );
}
