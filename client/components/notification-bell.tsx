/**
 * The header's in-app notification entry: an unread badge and the newest
 * messages, so an assignment or a resolution is visible without opening the
 * inbox page. Clicking a message marks it read and opens what it is about.
 *
 * The items and their unread count come from the notification plugin's client
 * hooks, which read the signed-in person's own inbox; no extra permission is
 * needed and every person sees only their own messages.
 */
import {
  useInboxActions,
  useInboxItems,
  useInboxRefresh,
  useInboxUnreadCount,
} from '@nocobase/app-plugin-notification-in-app/client/inbox';
import { useTranslation } from '@nocobase/i18n/client';
import { BellIcon, InboxIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { Button, buttonVariants } from '#components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';
import { Spinner } from '#components/ui/spinner';
import { entryLink, relativeTime } from '#extensions/nocobase-inbox/model';
import { cn } from 'cn';

const PREVIEW_SIZE = 6;

export function NotificationBell(): ReactElement {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = useInboxItems(PREVIEW_SIZE);
  const unread = useInboxUnreadCount();
  const actions = useInboxActions();
  useInboxRefresh();

  const unreadCount = unread.data ?? 0;
  const latest = (items.data?.pages.flatMap((page) => page.data) ?? []).slice(
    0,
    PREVIEW_SIZE,
  );

  const openItem = (id: string, path: string | null): void => {
    setOpen(false);
    // Marking read is best effort: the message still opens even if the
    // bookkeeping call fails, and the inbox refetches on its own.
    void actions.mark(id, 'read').catch(() => undefined);
    void navigate(path ?? '/inbox');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t('notifications.open', {
          defaultValue: 'Open notifications',
        })}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'relative',
        )}
      >
        <BellIcon className='size-4' />
        {unreadCount > 0 ? (
          <span
            aria-hidden='true'
            className='absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground tabular-nums'
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
        {unreadCount > 0 ? (
          <span className='sr-only'>
            {t('notifications.unread', {
              count: unreadCount,
              defaultValue: '{{count}} unread',
            })}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align='end' className='w-80 p-0'>
        <div className='flex items-center justify-between gap-2 border-b border-border px-3 py-2'>
          <p className='text-sm font-medium'>
            {t('notifications.title', { defaultValue: 'Notifications' })}
          </p>
          {unreadCount > 0 ? (
            <Button
              type='button'
              variant='ghost'
              size='xs'
              disabled={actions.pending}
              onClick={() => {
                void actions.readAll().catch(() => undefined);
              }}
            >
              {t('notifications.readAll', { defaultValue: 'Mark all read' })}
            </Button>
          ) : null}
        </div>
        {items.isLoading ? (
          <div className='flex items-center justify-center gap-2 px-3 py-6'>
            <Spinner className='size-4' />
            <span className='text-sm text-muted-foreground'>
              {t('notifications.loading', {
                defaultValue: 'Loading notifications…',
              })}
            </span>
          </div>
        ) : items.isError ? (
          <p className='px-3 py-6 text-center text-sm text-muted-foreground'>
            {t('notifications.error', {
              defaultValue: 'Notifications could not be loaded.',
            })}
          </p>
        ) : latest.length === 0 ? (
          <div className='flex flex-col items-center gap-1 px-3 py-6 text-center'>
            <InboxIcon className='size-5 text-muted-foreground' />
            <p className='text-sm text-muted-foreground'>
              {t('notifications.empty', {
                defaultValue: 'You have no notifications yet.',
              })}
            </p>
          </div>
        ) : (
          <ul className='flex max-h-96 flex-col overflow-y-auto py-1'>
            {latest.map((item) => {
              const path = entryLink({ item, notice: null });
              return (
                <li key={item.id}>
                  <button
                    type='button'
                    onClick={() => openItem(item.id, path)}
                    className='flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none'
                  >
                    <span className='flex w-full items-center gap-2'>
                      <span
                        className={cn(
                          'truncate text-sm',
                          item.readAt
                            ? 'text-muted-foreground'
                            : 'font-medium text-foreground',
                        )}
                      >
                        {item.title}
                      </span>
                      {item.readAt ? null : (
                        <span
                          aria-hidden='true'
                          className='ml-auto size-2 shrink-0 rounded-full bg-primary'
                        />
                      )}
                    </span>
                    <span className='line-clamp-2 text-xs text-muted-foreground'>
                      {item.body}
                    </span>
                    <span className='text-[11px] text-muted-foreground'>
                      {relativeTime(item.createdAt, i18n.language)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className='border-t border-border p-1'>
          <Link
            to='/inbox'
            onClick={() => setOpen(false)}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'w-full justify-center',
            )}
          >
            {t('notifications.viewAll', {
              defaultValue: 'View all notifications',
            })}
          </Link>
        </div>
        {actions.pending ? (
          <div className='flex justify-center border-t border-border py-1'>
            <Spinner className='size-3.5' />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
