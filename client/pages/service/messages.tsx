import { useTranslation } from '@nocobase/i18n/client';
import {
  CheckCheckIcon,
  MailIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toast';

import {
  describeError,
  useResource,
  useServiceApi,
} from '../../service/api.js';
import { asText, formatDateTime } from '../../service/format.js';
import {
  AlertNotice,
  FilterSelect,
  QueryState,
  SectionCard,
  StatusBadge,
} from '../../service/ui.js';

/**
 * The in-app inbox. Messages are persisted by the notification plugin's in-app
 * store, so they survive a reload and a reconnect. The optional external channel
 * is reported honestly: when it is not configured, the page says so rather than
 * pretending a message was sent.
 */
export default function MessagesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [unreadOnly, setUnreadOnly] = useState('false');

  const count = useResource('service:message-count', () => api.messageCount());
  const inbox = useResource(`service:messages:${unreadOnly}`, () =>
    api.messages({ limit: 50, unreadOnly: unreadOnly === 'true' }),
  );
  const deliveries = useResource('service:deliveries', () =>
    api.deliveries({ limit: 50 }),
  );

  const items = inbox.data?.data ?? [];
  const unread = inbox.data?.meta?.unread as number | undefined;
  const external = count.data?.status.external;

  const reloadAll = (): void => {
    inbox.reload();
    count.reload();
    deliveries.reload();
  };

  const act = async (
    body: Record<string, unknown>,
    successKey: string,
  ): Promise<void> => {
    try {
      await api.messageAction(body);
      toast.add({ type: 'success', title: t(successKey) });
      reloadAll();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.common.saveFailed'),
        description: describeError(error),
      });
    }
  };

  const retry = async (id: number): Promise<void> => {
    try {
      await api.retryDelivery(id);
      toast.add({ type: 'success', title: t('service.messages.retried') });
      reloadAll();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.messages.retryFailed'),
        description: describeError(error),
      });
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.messages.title')}
        description={t('service.messages.description')}
        actions={
          <Button variant='outline' size='sm' onClick={reloadAll}>
            <RefreshCwIcon />
            {t('service.common.refresh')}
          </Button>
        }
      />

      <div className='flex flex-wrap items-center gap-3'>
        <Badge variant={unread && unread > 0 ? 'destructive' : 'secondary'}>
          {t('service.messages.unreadCount', {
            count: unread ?? count.data?.unread ?? 0,
          })}
        </Badge>
        {external?.configured ? (
          <Badge variant='default'>
            {t('service.messages.externalConfigured', {
              channels: external.channels.join(', '),
            })}
          </Badge>
        ) : (
          <Badge variant='outline'>
            {t('service.messages.externalNotConfigured')}
          </Badge>
        )}
      </div>

      {!external?.configured ? (
        <AlertNotice title={t('service.messages.notConfiguredTitle')}>
          {t('service.messages.notConfigured')}
        </AlertNotice>
      ) : null}

      <SectionCard
        title={t('service.messages.inbox')}
        actions={
          <span className='flex items-center gap-2'>
            <FilterSelect
              allLabel={t('service.messages.allMessages')}
              value={unreadOnly}
              onValueChange={(value) => setUnreadOnly(value)}
              options={[
                { value: 'true', label: t('service.messages.unreadOnly') },
              ]}
            />
            <Button
              variant='outline'
              size='sm'
              onClick={() =>
                void act(
                  { action: 'mark-all-read' },
                  'service.messages.allRead',
                )
              }
            >
              <CheckCheckIcon />
              {t('service.messages.markAllRead')}
            </Button>
          </span>
        }
      >
        <QueryState
          loading={inbox.loading}
          error={inbox.error}
          empty={items.length === 0}
          onRetry={inbox.reload}
        >
          <ul className='divide-y'>
            {items.map((item) => {
              const isUnread = !item.readAt;
              return (
                <li key={item.id} className='flex items-start gap-3 py-3'>
                  <span
                    className={
                      isUnread
                        ? 'mt-1.5 size-2 shrink-0 rounded-full bg-primary'
                        : 'mt-1.5 size-2 shrink-0 rounded-full bg-transparent'
                    }
                  />
                  <div className='min-w-0 flex-1 space-y-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span
                        className={isUnread ? 'font-medium' : 'font-normal'}
                      >
                        {item.title ?? t('service.messages.untitled')}
                      </span>
                      <span className='text-xs text-muted-foreground'>
                        {formatDateTime(item.createdAt)}
                      </span>
                      {item.target?.path ? (
                        <Badge variant='outline'>
                          {item.target.type ?? 'link'}
                        </Badge>
                      ) : null}
                    </div>
                    <p className='text-sm text-muted-foreground'>{item.body}</p>
                  </div>
                  <div className='flex shrink-0 items-center gap-1'>
                    {isUnread ? (
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        aria-label={t('service.messages.markRead')}
                        onClick={() =>
                          void act(
                            { id: item.id, action: 'read' },
                            'service.messages.markedRead',
                          )
                        }
                      >
                        <MailIcon />
                      </Button>
                    ) : (
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        aria-label={t('service.messages.markUnread')}
                        onClick={() =>
                          void act(
                            { id: item.id, action: 'unread' },
                            'service.messages.markedUnread',
                          )
                        }
                      >
                        <CheckCheckIcon />
                      </Button>
                    )}
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label={t('service.common.delete')}
                      onClick={() =>
                        void act(
                          { id: item.id, action: 'delete' },
                          'service.messages.deleted',
                        )
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </QueryState>
      </SectionCard>

      <SectionCard
        title={t('service.messages.deliveries')}
        description={t('service.messages.deliveriesDescription')}
      >
        <QueryState
          loading={deliveries.loading}
          error={deliveries.error}
          empty={(deliveries.data?.data.length ?? 0) === 0}
          onRetry={deliveries.reload}
          skeletonRows={3}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('service.messages.channel')}</TableHead>
                <TableHead>{t('service.messages.deliveryStatus')}</TableHead>
                <TableHead>{t('service.messages.recipient')}</TableHead>
                <TableHead>{t('service.messages.subject')}</TableHead>
                <TableHead>{t('service.messages.attempts')}</TableHead>
                <TableHead>{t('service.messages.lastError')}</TableHead>
                <TableHead>{t('service.common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(deliveries.data?.data ?? []).map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell>{asText(delivery.channel)}</TableCell>
                  <TableCell>
                    <StatusBadge kind='delivery' value={delivery.status} />
                  </TableCell>
                  <TableCell>{asText(delivery.recipientName) || '—'}</TableCell>
                  <TableCell className='max-w-64 truncate'>
                    {asText(delivery.title)}
                  </TableCell>
                  <TableCell>{asText(delivery.attempts)}</TableCell>
                  <TableCell className='max-w-64 truncate text-sm text-muted-foreground'>
                    {asText(delivery.lastError) || '—'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => void retry(delivery.id)}
                    >
                      {t('service.messages.retry')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </QueryState>
      </SectionCard>
    </PageContainer>
  );
}
