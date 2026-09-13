import { useTranslation } from '@nocobase/i18n/client';
import { Paperclip, X } from 'lucide-react';
import { useId, useRef, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { ItFile } from '@/lib/it-api';
import { attachmentUrl, useAttachmentUploader } from '@/lib/it-files';
import { cn } from '@/lib/utils';

/**
 * Controlled attachment picker. Files upload immediately through the file repository; the parent
 * form only ever carries the resulting file ids, so form submission never waits on an upload it
 * cannot represent.
 */
export function AttachmentField({
  label,
  value,
  onChange,
  disabled,
}: {
  readonly label: string;
  readonly value: readonly ItFile[];
  readonly onChange: (files: readonly ItFile[]) => void;
  readonly disabled?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading, error, clearError } = useAttachmentUploader();

  return (
    <div className='space-y-2'>
      <Label htmlFor={inputId}>{label}</Label>
      <div className='flex flex-wrap items-center gap-2'>
        <input
          id={inputId}
          ref={inputRef}
          type='file'
          multiple
          className='hidden'
          disabled={disabled || uploading}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length === 0) return;
            void upload(files)
              .then((uploaded) => onChange([...value, ...uploaded]))
              .catch(() => undefined);
          }}
        />
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className='size-4' />
          {uploading
            ? t('it.attachments.uploading', { defaultValue: 'Uploading…' })
            : t('it.attachments.add', { defaultValue: 'Add attachment' })}
        </Button>
        <span className='text-xs text-muted-foreground'>
          {t('it.attachments.hint', {
            defaultValue: 'Invoices or photos, multiple allowed',
          })}
        </span>
      </div>
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
          <button type='button' className='ml-2 underline' onClick={clearError}>
            {t('actions.close', { defaultValue: 'Close' })}
          </button>
        </p>
      ) : null}
      {value.length > 0 ? (
        <ul className='flex flex-wrap gap-2'>
          {value.map((file) => (
            <li
              key={file.id}
              className='flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2 py-1 text-xs'
            >
              {file.mimeType.startsWith('image/') ? (
                <img
                  src={attachmentUrl(file)}
                  alt={file.filename}
                  className='size-8 rounded object-cover'
                />
              ) : (
                <Paperclip className='size-4 text-muted-foreground' />
              )}
              <a
                href={attachmentUrl(file)}
                target='_blank'
                rel='noreferrer'
                className={cn('max-w-40 truncate hover:underline')}
              >
                {file.filename}
              </a>
              <button
                type='button'
                aria-label={t('it.attachments.remove', {
                  defaultValue: 'Remove attachment',
                })}
                className='text-muted-foreground hover:text-destructive'
                disabled={disabled}
                onClick={() =>
                  onChange(value.filter((item) => item.id !== file.id))
                }
              >
                <X className='size-3.5' />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
