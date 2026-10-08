import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CheckIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/pages/service/shared.js';
import {
  formatDateTime,
  useActionFeedback,
  useServiceList,
} from '@/pages/service/service-api.js';
import type { ServiceMessage } from '@/pages/service/types.js';

export default function MessagesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const feedback = useActionFeedback();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const { data, error, loading, reload } = useServiceList<ServiceMessage>(
    'service/messages',
    onlyUnread ? { unreadOnly: true } : undefined,
    onlyUnread ? 'unread' : 'all',
  );
  const [busy, setBusy] = useState<number | null>(null);

  const markRead = async (id: number): Promise<void> => {
    setBusy(id);
    try {
      await api.request({
        path: `service/messages/${id}/read`,
        method: 'POST',
        json: {},
      });
      reload();
    } catch (readError) {
      feedback.failure(readError);
    } finally {
      setBusy(null);
    }
  };

  const items = data ?? [];
  const unread = items.filter((message) => !message.read).length;

  return (
    <PageContainer>
      <PageHeader
        title={t('service.messages.title')}
        description={t('service.messages.description')}
        actions={
          <Button
            variant={onlyUnread ? 'default' : 'outline'}
            onClick={() => setOnlyUnread((value) => !value)}
          >
            {t('service.messages.onlyUnread')}
          </Button>
        }
      />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {data ? (
        items.length === 0 ? (
          <EmptyState
            title={t('service.messages.empty')}
            description={t('service.messages.emptyHint')}
          />
        ) : (
          <>
            <p className='text-sm text-muted-foreground'>
              {t('service.messages.unreadSummary', { count: unread })}
            </p>
            <ul className='space-y-3'>
              {items.map((message) => (
                <li key={message.id}>
                  <Card>
                    <CardContent className='flex flex-wrap items-start justify-between gap-3 pt-6'>
                      <div className='min-w-0 space-y-1'>
                        <div className='flex items-center gap-2'>
                          <Badge variant={message.read ? 'outline' : 'default'}>
                            {message.read
                              ? t('service.messages.read')
                              : t('service.messages.unread')}
                          </Badge>
                          <span className='text-sm font-medium'>
                            {message.title}
                          </span>
                        </div>
                        {message.body ? (
                          <p className='text-sm text-muted-foreground'>
                            {message.body}
                          </p>
                        ) : null}
                        <p className='text-xs text-muted-foreground'>
                          {formatDateTime(message.createdAt)}
                        </p>
                        {message.route ? (
                          <Link
                            to={`/service${message.route}`}
                            className='text-sm text-primary underline underline-offset-4'
                          >
                            {t('service.messages.open')}
                          </Link>
                        ) : null}
                      </div>
                      {!message.read ? (
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={busy !== null}
                          onClick={() => void markRead(message.id)}
                        >
                          <CheckIcon data-icon='inline-start' />
                          {t('service.messages.markRead')}
                        </Button>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
    </PageContainer>
  );
}
