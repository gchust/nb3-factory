import { useTranslation } from '@nocobase/i18n/client';
import { Paperclip, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type ReactElement } from 'react';

import { apiErrorCode } from '@/lib/contracts';

import { Button } from './ui/button';
import { Spinner } from './ui/spinner';

export interface ContractUploadFieldProps {
  readonly allowedExtensions: readonly string[];
  readonly maxBytes: number;
  readonly disabled?: boolean;
  /** Uploads the chosen file. Rejecting the returned promise shows its message to the user. */
  readonly onUpload: (file: File) => Promise<void>;
}

/**
 * File upload control.
 *
 * The only way to attach a scan is to pick a local file here — there is deliberately no URL field. Type and size are
 * checked here for immediate feedback and again on the server, which is the boundary that decides.
 */
export function ContractUploadField({
  allowedExtensions,
  maxBytes,
  disabled = false,
  onUpload,
}: ContractUploadFieldProps): ReactElement {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string>();

  const accept = allowedExtensions.map((ext) => `.${ext}`).join(',');
  const limitLabel = `${Math.round(maxBytes / (1024 * 1024))} MB`;

  const handleChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSelected(file.name);

    const extension = file.name.includes('.')
      ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
      : '';
    if (!extension || !allowedExtensions.includes(extension)) {
      setError(
        t('contracts.upload.errors.UNSUPPORTED_FILE_TYPE', {
          defaultValue: 'This file type is not allowed.',
          extension: extension || '—',
        }),
      );
      return;
    }
    if (file.size > maxBytes) {
      setError(
        t('contracts.upload.errors.FILE_TOO_LARGE', {
          defaultValue: 'The file exceeds the {{limit}} limit.',
          limit: limitLabel,
        }),
      );
      return;
    }

    setError(undefined);
    setBusy(true);
    try {
      await onUpload(file);
      setSelected(undefined);
    } catch (cause) {
      setError(translateUploadError(cause, t, limitLabel));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='space-y-2'>
      <input
        accept={accept}
        className='hidden'
        disabled={disabled || busy}
        onChange={(event) => void handleChange(event)}
        ref={inputRef}
        type='file'
      />
      <div className='flex flex-wrap items-center gap-3'>
        <Button
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          size='sm'
          type='button'
          variant='outline'
        >
          {busy ? <Spinner aria-hidden='true' role={undefined} /> : <Upload />}
          {busy
            ? t('contracts.upload.uploading', { defaultValue: 'Uploading…' })
            : t('contracts.upload.action', { defaultValue: 'Choose file' })}
        </Button>
        <span className='text-xs text-muted-foreground'>
          {t('contracts.upload.hint', {
            defaultValue: 'Allowed: {{types}} · up to {{limit}} per file',
            types: allowedExtensions.join(', '),
            limit: limitLabel,
          })}
        </span>
      </div>
      {selected && busy ? (
        <p className='flex items-center gap-2 text-xs text-muted-foreground'>
          <Paperclip className='size-3' />
          {selected}
        </p>
      ) : null}
      {error ? (
        <p className='text-sm text-destructive' role='alert'>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function translateUploadError(
  cause: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
  limitLabel: string,
): string {
  const code = apiErrorCode(cause) ?? 'INTERNAL_ERROR';
  return t(`contracts.upload.errors.${code}`, {
    defaultValue:
      code === 'INTERNAL_ERROR'
        ? 'The upload failed. Please try again.'
        : String((cause as Error | undefined)?.message ?? 'The upload failed.'),
    limit: limitLabel,
  });
}
