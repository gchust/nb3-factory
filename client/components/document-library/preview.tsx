import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';

import { canPreviewInPage, isPdf, type DocumentRecord } from './types.js';

export interface DocumentPreviewProps {
  readonly record: DocumentRecord;
  readonly onClose: () => void;
}

/**
 * In-page preview. A PDF is fetched as a blob and embedded, so the viewer shows the file without the browser first
 * downloading it; an image is shown directly from its content URL.
 */
export function DocumentPreview({
  record,
  onClose,
}: DocumentPreviewProps): ReactElement {
  const { t } = useTranslation();
  const [blobUrl, setBlobUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  const pdf = isPdf(record);
  const previewable = canPreviewInPage(record);

  useEffect(() => {
    if (!pdf) return undefined;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    fetch(record.contentUrl, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load the preview.');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdf, record.contentUrl, record.id]);

  return (
    <section
      data-slot='document-preview'
      className='space-y-3 rounded-lg border border-border bg-card p-4'
      aria-label={t('documents.preview.title')}
    >
      <div className='flex items-center justify-between gap-3'>
        <h2 className='min-w-0 truncate text-base font-semibold'>
          {t('documents.preview.title')} · {record.filename}
        </h2>
        <Button type='button' variant='outline' size='sm' onClick={onClose}>
          {t('documents.preview.close')}
        </Button>
      </div>

      {!previewable ? (
        <p className='text-sm text-muted-foreground'>
          {t('documents.preview.unavailable')}
        </p>
      ) : null}

      {previewable && !pdf ? (
        <img
          src={record.contentUrl}
          alt={record.filename}
          className='max-h-[70vh] w-auto max-w-full rounded-md border border-border object-contain'
        />
      ) : null}

      {pdf ? (
        failed ? (
          <p role='alert' className='text-sm text-destructive'>
            {t('documents.preview.failed')}
          </p>
        ) : blobUrl ? (
          <iframe
            data-slot='document-preview-pdf'
            src={blobUrl}
            title={record.filename}
            className='h-[70vh] w-full rounded-md border border-border'
          />
        ) : (
          <p role='status' className='text-sm text-muted-foreground'>
            {t('documents.preview.loading')}
          </p>
        )
      ) : null}
    </section>
  );
}
