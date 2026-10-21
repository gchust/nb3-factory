import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { DownloadIcon, FileTextIcon } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';

import { TicketsClient } from './api.js';
import { formatSize } from './format.js';
import type { TicketAttachment } from './types.js';

export function AttachmentCard({
  attachment,
}: {
  readonly attachment: TicketAttachment;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const client = useMemo(() => new TicketsClient(api), [api]);
  const isImage = attachment.mimeType.startsWith('image/');
  const oversized = attachment.size > 10 * 1024 * 1024;
  const [preview, setPreview] = useState<string>();
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isImage || oversized) return;
    let active = true;
    let url: string | undefined;
    void client.download(attachment).then(
      (blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      },
      () => {
        if (active) setPreviewFailed(true);
      },
    );
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment, client, isImage, oversized]);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await client.download(attachment);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toaster.show({ type: 'error', title: t('tickets.downloadFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <figure className='overflow-hidden rounded-lg border bg-card'>
      {isImage && !oversized && !previewFailed ? (
        preview ? (
          <img
            src={preview}
            alt={attachment.filename}
            className='max-h-72 w-full object-contain'
            loading='lazy'
          />
        ) : (
          <Skeleton className='h-40 w-full rounded-none' />
        )
      ) : (
        <div className='flex h-24 items-center justify-center bg-muted/40'>
          <FileTextIcon className='size-8 text-muted-foreground' aria-hidden />
        </div>
      )}
      <figcaption className='flex items-center justify-between gap-2 border-t px-3 py-2'>
        <div className='min-w-0'>
          <p className='truncate text-sm font-medium'>{attachment.filename}</p>
          <p className='text-xs text-muted-foreground'>
            {formatSize(attachment.size)}
          </p>
        </div>
        <Button
          type='button'
          size='icon-sm'
          variant='ghost'
          disabled={busy}
          aria-label={t('tickets.downloadFile', { name: attachment.filename })}
          onClick={() => void download()}
        >
          <DownloadIcon />
        </Button>
      </figcaption>
    </figure>
  );
}
