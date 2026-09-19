import { useTranslation } from '@nocobase/i18n/client';
import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  MAX_FILE_BYTES,
  contentUrl,
  errorMessage,
  formatSize,
  isImage,
  useSalesApi,
  type CustomerSummary,
} from '@/lib/sales';

import { ErrorNotice } from './ui.js';

/**
 * The customer's identifying image: view, replace and remove.
 *
 * A replacement is only shown once the server confirms it, so a failed upload
 * leaves the previous image in place rather than an optimistic empty box.
 */
export function CustomerAvatar({
  customer,
  onChanged,
}: {
  readonly customer: CustomerSummary;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const hasImage = Boolean(customer.avatarFileId);

  const onPick = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(undefined);
    if (!isImage({ mimeType: file.type, ext: '' })) {
      setError(t('sales.avatar.notImage'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(t('sales.files.tooLarge', { name: file.name, size: 5 }));
      return;
    }
    setBusy(true);
    try {
      await api.uploadAvatar(customer.id, file);
      onChanged();
    } catch (cause: unknown) {
      setError(errorMessage(cause) || t('sales.avatar.uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (): Promise<void> => {
    setError(undefined);
    setBusy(true);
    try {
      await api.removeAvatar(customer.id);
      onChanged();
    } catch (cause: unknown) {
      setError(errorMessage(cause) || t('sales.avatar.removeFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='space-y-2'>
      <div className='flex items-center gap-3'>
        <div className='flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40'>
          {hasImage ? (
            <img
              src={contentUrl({ id: customer.avatarFileId as string })}
              alt={t('sales.avatar.alt', { name: customer.name })}
              className='size-full object-cover'
            />
          ) : (
            <span className='text-lg font-semibold text-muted-foreground'>
              {customer.name.slice(0, 1)}
            </span>
          )}
        </div>
        <div className='flex flex-col gap-2'>
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <Loader2 className='animate-spin' /> : <ImageUp />}
              {hasImage ? t('sales.avatar.replace') : t('sales.avatar.upload')}
            </Button>
            {hasImage ? (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                disabled={busy}
                onClick={() => void onRemove()}
              >
                <Trash2 />
                {t('sales.avatar.remove')}
              </Button>
            ) : null}
          </div>
          <p className='text-xs text-muted-foreground'>
            {t('sales.avatar.hint', { size: formatSize(MAX_FILE_BYTES) })}
          </p>
        </div>
        <input
          ref={inputRef}
          type='file'
          accept='image/png,image/jpeg,image/gif,image/webp,image/bmp'
          className='hidden'
          onChange={(event) => void onPick(event)}
        />
      </div>
      <ErrorNotice message={error} />
    </div>
  );
}

export default CustomerAvatar;
