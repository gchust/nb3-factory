import { useTranslation } from '@nocobase/i18n/client';
import { useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  attachmentUrl,
  messageOf,
  useProcurementApi,
  type ProcurementAttachment,
} from '@/lib/procurement-api';

export function AttachmentField({
  ownerType,
  ownerId,
  files,
  onUploaded,
  disabled = false,
}: {
  readonly ownerType: 'supplier' | 'request';
  readonly ownerId: number;
  readonly files: readonly ProcurementAttachment[];
  readonly onUploaded: () => void;
  readonly disabled?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useProcurementApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const upload = async (file: File): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await api.uploadAttachment(ownerType, ownerId, file);
      onUploaded();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>{t('procurement.files')}</p>
      {files.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('procurement.noFiles')}
        </p>
      ) : (
        <ul className='space-y-1'>
          {files.map((file) => (
            <li key={file.id}>
              <a
                className='text-sm text-primary underline-offset-4 hover:underline'
                href={attachmentUrl(file.contentUrl)}
                download={file.filename ?? undefined}
              >
                {file.filename ?? file.fileId}
              </a>
            </li>
          ))}
        </ul>
      )}
      {!disabled ? (
        <div className='flex items-center gap-2'>
          <input
            ref={inputRef}
            className='text-sm text-muted-foreground'
            type='file'
            aria-label={t('procurement.files')}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          {busy ? (
            <span className='text-sm text-muted-foreground'>
              {t('procurement.uploading')}
            </span>
          ) : (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => inputRef.current?.click()}
            >
              {t('procurement.upload')}
            </Button>
          )}
        </div>
      ) : null}
      {error ? (
        <p className='text-sm text-destructive' role='alert'>
          {error}
        </p>
      ) : null}
    </div>
  );
}
