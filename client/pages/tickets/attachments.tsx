import { resolveAppUrl } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { FileIcon, ImageIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import type { TicketAttachment } from './types.js';
import { formatBytes } from './ticket-format.js';

export function AttachmentList({
  ticketId,
  attachments,
}: {
  readonly ticketId: number;
  readonly attachments: readonly TicketAttachment[];
}): ReactElement {
  const { t } = useTranslation();

  if (attachments.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('serviceDesk.ticket.noAttachments', {
          defaultValue: 'No attachments.',
        })}
      </p>
    );
  }

  return (
    <ul className='grid gap-3 sm:grid-cols-2'>
      {attachments.map((attachment) => {
        const url = resolveAppUrl(
          `/api/service-desk/tickets/${ticketId}/files/${attachment.id}`,
        );
        const isImage = attachment.mimeType.startsWith('image/');
        return (
          <li key={attachment.id}>
            <a
              href={url}
              target='_blank'
              rel='noreferrer'
              className='group flex flex-col overflow-hidden rounded-lg border border-border bg-background transition-colors hover:border-primary/30'
            >
              {isImage ? (
                <span className='flex aspect-video items-center justify-center overflow-hidden bg-muted/40'>
                  <img
                    src={url}
                    alt={attachment.filename}
                    className='max-h-48 w-full object-contain'
                  />
                </span>
              ) : null}
              <span className='flex min-w-0 items-center gap-2 px-3 py-2.5'>
                {isImage ? (
                  <ImageIcon className='size-4 shrink-0 text-muted-foreground' />
                ) : (
                  <FileIcon className='size-4 shrink-0 text-muted-foreground' />
                )}
                <span className='flex min-w-0 flex-col'>
                  <span className='truncate text-sm font-medium group-hover:underline'>
                    {attachment.filename}
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    {formatBytes(attachment.size)}
                  </span>
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
