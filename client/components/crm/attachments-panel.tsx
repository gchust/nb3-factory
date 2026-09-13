import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Download, Paperclip, Trash2 } from 'lucide-react';
import { useTranslation } from '@nocobase/i18n/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  toDate,
  useCrmApi,
  type Attachment,
  type AttachmentTarget,
} from './api';
import { CrmEmpty, CrmErrorText, CrmLoading, useCrmError } from './feedback';

export function AttachmentsPanel({
  targetType,
  targetId,
}: {
  targetType: AttachmentTarget;
  targetId: number;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useCrmApi();
  const errorFor = useCrmError();
  const [items, setItems] = useState<Attachment[]>();
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback((): void => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void api
      .listAttachments(targetType, targetId)
      .then((rows) => {
        if (!active) return;
        setItems(rows);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorFor(cause));
      });
    return () => {
      active = false;
    };
  }, [api, targetType, targetId, refreshKey, errorFor]);

  const upload = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setUploading(true);
    setError(undefined);
    try {
      await api.uploadAttachment({ targetType, targetId, file });
      reload();
    } catch (cause) {
      setError(errorFor(cause));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: number): Promise<void> => {
    setError(undefined);
    try {
      await api.deleteAttachment(id);
      reload();
    } catch (cause) {
      setError(errorFor(cause));
    }
  };

  const formatSize = (size: number | null): string => {
    if (size === null) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2'>
        <Input
          aria-label={t('crm.attachments.upload')}
          className='max-w-xs'
          disabled={uploading}
          type='file'
          onChange={(event) => {
            void upload(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <span className='text-sm text-muted-foreground'>
          {uploading ? t('crm.attachments.uploading') : null}
        </span>
      </div>
      <CrmErrorText message={error} />
      {items === undefined ? (
        <CrmLoading label={t('crm.common.loading')} />
      ) : items.length === 0 ? (
        <CrmEmpty>{t('crm.attachments.empty')}</CrmEmpty>
      ) : (
        <ul className='divide-y divide-border rounded-lg border border-border'>
          {items.map((item) => (
            <li
              key={item.id}
              className='flex items-center justify-between gap-3 p-3'
            >
              <div className='flex min-w-0 items-center gap-2'>
                <Paperclip className='size-4 shrink-0 text-muted-foreground' />
                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium'>
                    {item.filename ?? t('crm.common.unnamed')}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {formatSize(item.size)}
                    {item.createdAt
                      ? ` · ${toDate(item.createdAt)?.toLocaleDateString(i18n.language) ?? ''}`
                      : ''}
                  </p>
                </div>
              </div>
              <div className='flex shrink-0 items-center gap-1'>
                <Button
                  size='sm'
                  variant='ghost'
                  render={
                    <a
                      download={item.filename ?? undefined}
                      href={api.attachmentContentUrl(item.id)}
                    />
                  }
                >
                  <Download className='size-4' />
                  {t('crm.attachments.download')}
                </Button>
                <Button
                  aria-label={t('crm.attachments.delete')}
                  size='icon'
                  variant='ghost'
                  onClick={() => void remove(item.id)}
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
