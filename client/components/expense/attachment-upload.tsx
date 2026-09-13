import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useState, type ChangeEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { attachmentHref, type AttachmentRecord } from '@/lib/expense-api';

/**
 * Uploads invoice attachments through the file plugin's client repository and keeps the resulting file ids on the
 * surrounding form. Only the ids are submitted; the server links them to the claim and derives content URLs.
 */
export function AttachmentUpload({
  files,
  onChange,
  disabled = false,
}: {
  files: readonly AttachmentRecord[];
  onChange: (files: readonly AttachmentRecord[]) => void;
  disabled?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('invoiceAttachments'),
    [manager],
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleSelect(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (selected.length === 0) return;
    setError('');
    setUploading(true);
    try {
      const result = await repository.uploadMany({ files: selected });
      const uploaded: AttachmentRecord[] = result.records.map((record) => ({
        id: record.id,
        filename: record.filename,
        ext: record.ext,
        mimeType: record.mimeType,
        size: record.size,
        url: `/uploads/invoices/${record.id}${record.ext ? `.${record.ext}` : ''}`,
      }));
      onChange([...files, ...uploaded]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('expense.attachments.uploadFailed'),
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className='space-y-2'>
      <input
        type='file'
        multiple
        disabled={disabled || uploading}
        onChange={(event) => void handleSelect(event)}
        className='block w-full cursor-pointer rounded-lg border border-input bg-transparent p-2 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:font-medium file:text-foreground disabled:opacity-50'
      />
      {uploading && (
        <p className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner /> {t('expense.attachments.uploading')}
        </p>
      )}
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      {files.length > 0 && (
        <ul className='space-y-1'>
          {files.map((file) => (
            <li
              key={file.id}
              className='flex items-center justify-between gap-2 text-sm'
            >
              <a
                href={attachmentHref(file)}
                target='_blank'
                rel='noreferrer'
                className='truncate text-primary underline-offset-4 hover:underline'
              >
                {file.filename}
              </a>
              <Button
                type='button'
                variant='ghost'
                size='xs'
                disabled={disabled}
                onClick={() =>
                  onChange(files.filter((item) => item.id !== file.id))
                }
              >
                {t('expense.attachments.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
