import {
  realtimeClientToken,
  useApiClient,
  useService,
} from '@nocobase/app-client';
import { subscribeToInboxInvalidations } from '@nocobase/app-plugin-notification-in-app/client';
import { useTranslation } from '@nocobase/i18n/client';
import { CheckCheck, Mail, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from './components/data-states.js';
import { formatDateTime } from './lib/format.js';
import {
  fetchInbox,
  fetchUnreadCount,
  markInboxRead,
  mutateInboxItem,
  type InboxItem,
} from './lib/inbox.js';
import { useServiceQuery } from './lib/use-service-query.js';

export default function ServiceMessagesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const realtime = useService(realtimeClientToken);
  const inbox = useServiceQuery(
    (signal) =>
      Promise.all([
        fetchInbox(api, { limit: 50 }, signal),
        fetchUnreadCount(api, signal),
      ]),
    'inbox',
  );
  const items = inbox.data?.[0].data ?? [];
  const unread = inbox.data?.[1] ?? 0;
  const [actionError, setActionError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const { reload } = inbox;

  // Durable HTTP state stays authoritative. A returning user may have missed a
  // realtime invalidation while offline; the subscription refetches on a valid
  // `inbox.changed` event, on a reopened realtime connection, and on focus, so
  // a reconnect catches up without requiring the user to reload the page.
  useEffect(
    () => subscribeToInboxInvalidations(realtime, window, reload),
    [realtime, reload],
  );

  // A browser that regained connectivity without dropping its socket still has
  // to reconcile missed events; window focus alone is not enough.
  useEffect(() => {
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, [reload]);

  const act = async (item: InboxItem, action: 'read' | 'unread' | 'delete') => {
    setBusy(true);
    setActionError(undefined);
    try {
      await mutateInboxItem(api, item.id, action);
      reload();
    } catch (cause) {
      setActionError(cause);
    } finally {
      setBusy(false);
    }
  };

  const readAll = async () => {
    setBusy(true);
    setActionError(undefined);
    try {
      await markInboxRead(api);
      reload();
    } catch (cause) {
      setActionError(cause);
    } finally {
      setBusy(false);
    }
  };

  const error = actionError ?? inbox.error;

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button
            disabled={busy || unread === 0}
            onClick={() => void readAll()}
            variant='outline'
          >
            <CheckCheck aria-hidden='true' />
            {t('service.messages.readAll')}
          </Button>
        }
        description={t('service.messages.description')}
        title={t('service.messages.title', { count: unread })}
      />
      {inbox.loading && !items.length ? <LoadingState /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!inbox.loading || items.length ? (
        <Card className='py-0'>
          <CardContent className='divide-y divide-border px-0'>
            {items.length ? (
              items.map((item) => (
                <div
                  className={cn(
                    'flex items-start gap-3 p-4',
                    !item.readAt && 'bg-muted/40',
                  )}
                  key={item.id}
                >
                  <Mail
                    aria-hidden='true'
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      item.readAt ? 'text-muted-foreground' : 'text-primary',
                    )}
                  />
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <p className='font-medium'>
                        {item.title ?? t('service.messages.untitled')}
                      </p>
                      {!item.readAt ? (
                        <Badge variant='secondary'>
                          {t('service.messages.unread')}
                        </Badge>
                      ) : null}
                    </div>
                    <p className='mt-0.5 text-sm text-muted-foreground'>
                      {item.body}
                    </p>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {formatDateTime(item.createdAt)}
                    </p>
                    {item.actionUrl ? (
                      /^https?:\/\//u.test(item.actionUrl) ? (
                        <a
                          className='mt-1 inline-block text-sm text-primary hover:underline'
                          href={item.actionUrl}
                          rel='noreferrer'
                          target='_blank'
                        >
                          {t('service.messages.open')}
                        </a>
                      ) : (
                        // Route-internal paths must go through the router so the
                        // deployment base path (for example `/main`) is applied;
                        // a raw anchor would leave the application.
                        <Link
                          className='mt-1 inline-block text-sm text-primary hover:underline'
                          to={item.actionUrl}
                        >
                          {t('service.messages.open')}
                        </Link>
                      )
                    ) : null}
                  </div>
                  <div className='flex shrink-0 gap-1'>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void act(item, item.readAt ? 'unread' : 'read')
                      }
                      size='xs'
                      variant='ghost'
                    >
                      {item.readAt
                        ? t('service.messages.markUnread')
                        : t('service.messages.markRead')}
                    </Button>
                    <Button
                      aria-label={t('service.messages.delete')}
                      disabled={busy}
                      onClick={() => void act(item, 'delete')}
                      size='icon-xs'
                      variant='ghost'
                    >
                      <Trash2 aria-hidden='true' />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                className='m-4'
                message={t('service.messages.empty')}
              />
            )}
          </CardContent>
        </Card>
      ) : null}
    </PageContainer>
  );
}
