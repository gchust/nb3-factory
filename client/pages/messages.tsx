import { useApiClient } from '@nocobase/app-client';
import {
  fetchInbox,
  mutateInboxItem,
  type InboxItem,
} from '@nocobase/app-plugin-notification-in-app/client';
import { useTranslation } from '@nocobase/i18n/client';
import { MailIcon, TrashIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import { formatDateTime } from '@/components/service/format.js';
import { EmptyTable, RequestError } from '@/components/service/states.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

export default function MessagesPage(): ReactElement {
  const { t } = useTranslation();
  const client = useApiClient();
  const navigate = useNavigate();
  const [items, setItems] = useState<readonly InboxItem[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchInbox(client, { unreadOnly, pageSize: 50 }, controller.signal).then(
      (response) => {
        if (!controller.signal.aborted) {
          setItems(response.data);
          setError(null);
          setLoading(false);
        }
      },
      (failure) => {
        if (!controller.signal.aborted) {
          setError(failure);
          setLoading(false);
        }
      },
    );
    return () => controller.abort();
  }, [client, unreadOnly, version]);

  const open = async (item: InboxItem) => {
    if (!item.readAt) {
      await mutateInboxItem(client, item.id, 'read');
    }
    const target = item.target;
    if (target?.type === 'route') {
      navigate(target.path);
    } else if (target?.type === 'url') {
      window.open(target.url, '_blank', 'noopener');
    } else {
      reload();
    }
  };

  const toggleRead = async (item: InboxItem) => {
    await mutateInboxItem(client, item.id, item.readAt ? 'unread' : 'read');
    reload();
  };

  const remove = async (item: InboxItem) => {
    await mutateInboxItem(client, item.id, 'delete');
    reload();
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.messages.title')}
        description={t('service.messages.description')}
      />

      <div className='flex items-center gap-3'>
        <Switch
          id='messages-unread'
          checked={unreadOnly}
          onCheckedChange={setUnreadOnly}
        />
        <label htmlFor='messages-unread' className='text-sm'>
          {t('service.messages.unreadOnly')}
        </label>
      </div>

      {error ? <RequestError error={error} onRetry={reload} /> : null}

      {!error && !loading && items.length === 0 ? (
        <EmptyTable title={t('service.messages.empty')} />
      ) : null}

      <ul className='space-y-2'>
        {items.map((item) => (
          <li
            key={item.id}
            className='flex flex-wrap items-start justify-between gap-3 rounded-md border border-border px-3 py-2'
          >
            <button
              type='button'
              className='flex-1 text-left'
              onClick={() => void open(item)}
            >
              <div className='flex items-center gap-2'>
                <MailIcon className='size-4 text-muted-foreground' />
                <span className='text-sm font-medium'>{item.title}</span>
                {item.readAt ? null : (
                  <Badge variant='default'>
                    {t('service.messages.unread')}
                  </Badge>
                )}
              </div>
              <p className='mt-1 whitespace-pre-wrap text-sm text-muted-foreground'>
                {item.body}
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>
                {formatDateTime(item.createdAt)}
              </p>
            </button>
            <div className='flex items-center gap-1'>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => void toggleRead(item)}
              >
                {item.readAt
                  ? t('service.messages.markUnread')
                  : t('service.messages.markRead')}
              </Button>
              <Button
                size='icon'
                variant='ghost'
                aria-label={t('service.messages.delete')}
                onClick={() => void remove(item)}
              >
                <TrashIcon />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
