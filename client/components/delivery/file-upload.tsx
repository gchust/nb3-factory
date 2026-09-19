import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  deliveryErrorMessage,
  formatBytes,
  uploadDeliveryFile,
  type UploadedRecord,
} from '@/lib/delivery';

export const MAX_UPLOAD_FILES = 5;
export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

export interface DeliveryFileUploadProps {
  readonly onUploaded: (files: readonly UploadedRecord[]) => void;
  readonly disabled?: boolean;
  readonly hint?: string;
}

export function DeliveryFileUpload({
  onUploaded,
  disabled,
  hint,
}: DeliveryFileUploadProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function handleChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!selected.length) return;
    setError(undefined);
    setMessage(undefined);
    if (selected.length > MAX_UPLOAD_FILES) {
      setError(t('delivery.file.tooMany', { count: MAX_UPLOAD_FILES }));
      return;
    }
    const oversized = selected.find((file) => file.size > MAX_UPLOAD_SIZE);
    if (oversized) {
      setError(
        t('delivery.file.tooLarge', {
          name: oversized.name,
          size: formatBytes(MAX_UPLOAD_SIZE),
        }),
      );
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setUploading(true);
    const uploaded: UploadedRecord[] = [];
    try {
      for (const [index, file] of selected.entries()) {
        setMessage(
          t('delivery.file.uploading', {
            current: index + 1,
            total: selected.length,
            name: file.name,
          }),
        );
        uploaded.push(await uploadDeliveryFile(api, file, controller.signal));
      }
      onUploaded(uploaded);
      setMessage(t('delivery.file.uploaded', { count: uploaded.length }));
    } catch (cause) {
      if (controller.signal.aborted) {
        setMessage(t('delivery.file.cancelled'));
      } else {
        // Replace the progress line so a failed upload cannot leave the
        // "uploading n/m" text sitting above the reason it failed.
        setMessage(undefined);
        setError(deliveryErrorMessage(cause));
      }
    } finally {
      setUploading(false);
      controllerRef.current = undefined;
    }
  }

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          type='button'
          variant='outline'
        >
          <Upload />
          {t('delivery.file.select')}
        </Button>
        {uploading ? (
          <Button
            onClick={() => controllerRef.current?.abort()}
            type='button'
            variant='ghost'
          >
            {t('delivery.file.cancel')}
          </Button>
        ) : null}
        <input
          className='hidden'
          multiple
          onChange={(event) => void handleChange(event)}
          ref={inputRef}
          type='file'
        />
        <span className='text-xs text-muted-foreground'>
          {hint ??
            t('delivery.file.limit', { count: MAX_UPLOAD_FILES, size: '5 MB' })}
        </span>
      </div>
      {message ? (
        <p className='text-xs text-muted-foreground'>{message}</p>
      ) : null}
      {error ? (
        <p className='text-xs text-destructive' role='alert'>
          {error}
        </p>
      ) : null}
    </div>
  );
}
