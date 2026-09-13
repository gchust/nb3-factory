import { useTranslation } from '@nocobase/i18n/client';
import { Paperclip, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';

import type { Certificate } from './api.js';

export interface CertificateListProps {
  readonly certificates: readonly Certificate[];
  readonly deletingId: number | undefined;
  readonly onDelete: (id: number) => void;
}

export function CertificateList({
  certificates,
  deletingId,
  onDelete,
}: CertificateListProps): ReactElement {
  const { t } = useTranslation();

  if (certificates.length === 0) {
    return (
      <p className='rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground'>
        {t('certificates.empty')}
      </p>
    );
  }

  return (
    <ul className='space-y-3'>
      {certificates.map((certificate) => (
        <li
          key={certificate.id}
          className='space-y-3 rounded-lg border border-border bg-card p-4'
        >
          <div className='flex flex-wrap items-start justify-between gap-2'>
            <div className='space-y-1'>
              <h3 className='font-heading text-base font-semibold'>
                {certificate.name}
              </h3>
              <p className='text-sm text-muted-foreground'>
                {certificate.expiresAt
                  ? t('certificates.expiresAt', {
                      date: certificate.expiresAt.slice(0, 10),
                    })
                  : t('certificates.noExpiry')}
              </p>
            </div>
            <Button
              aria-label={t('certificates.delete', {
                name: certificate.name,
              })}
              disabled={deletingId === certificate.id}
              size='icon-sm'
              variant='destructive'
              onClick={() => onDelete(certificate.id)}
            >
              <Trash2 />
            </Button>
          </div>

          {certificate.attachments.length > 0 ? (
            <ul className='flex flex-wrap gap-2'>
              {certificate.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <a
                    className='inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground transition-colors hover:bg-muted'
                    href={attachment.contentUrl}
                    rel='noreferrer'
                    target='_blank'
                  >
                    <Paperclip className='size-3.5 text-muted-foreground' />
                    <span>{attachment.filename}</span>
                    <span className='text-xs text-muted-foreground'>
                      {formatSize(attachment.size)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('certificates.attachmentsEmpty')}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
