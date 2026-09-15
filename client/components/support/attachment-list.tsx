import { useTranslation } from '@nocobase/i18n/client';
import { Download, FileText } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  formatDateTime,
  formatFileSize,
  type AttachmentSummary,
} from '@/lib/support';

export interface AttachmentListProps {
  readonly attachments: readonly AttachmentSummary[];
  readonly downloadingId: string | null;
  readonly onDownload: (attachment: AttachmentSummary) => void;
}

export function AttachmentList({
  attachments,
  downloadingId,
  onDownload,
}: AttachmentListProps): ReactElement {
  const { t } = useTranslation();

  if (attachments.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('support.attachments.empty')}
      </p>
    );
  }

  return (
    <ul className='divide-y divide-border rounded-lg border border-border'>
      {attachments.map((attachment) => {
        const role = attachment.uploaderRole ?? 'customer';
        return (
          <li
            key={attachment.id}
            className='flex flex-wrap items-center gap-3 px-3 py-2'
            data-testid='attachment-row'
          >
            <FileText
              aria-hidden='true'
              className='size-4 shrink-0 text-muted-foreground'
            />
            <div className='min-w-0 flex-1'>
              <p className='truncate text-sm font-medium'>
                {attachment.filename}
              </p>
              <p className='text-xs text-muted-foreground'>
                <span
                  className='font-medium text-foreground'
                  data-testid='attachment-role'
                >
                  {t(`support.uploader.${role}`, { defaultValue: role })}
                </span>
                {' · '}
                {attachment.uploaderName ??
                  t('support.attachments.unknownUser')}
                {' · '}
                {formatDateTime(attachment.createdAt)}
                {' · '}
                {formatFileSize(attachment.size)}
              </p>
            </div>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={downloadingId === attachment.id}
              onClick={() => onDownload(attachment)}
            >
              <Download aria-hidden='true' />
              {downloadingId === attachment.id
                ? t('support.attachments.downloading')
                : t('support.attachments.download')}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
