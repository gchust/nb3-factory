import { useInboxUnreadCount } from '@nocobase/app-plugin-notification-in-app/client/inbox';
import { useTranslation } from '@nocobase/i18n/client';
import { BellIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { Button } from '#components/ui/button';

/** The header's way into the durable in-app inbox, with its unread count. */
export function InboxButton(): ReactElement {
  const { t } = useTranslation();
  const unread = useInboxUnreadCount();
  const count = unread.data ?? 0;
  const label =
    count > 0 ? t('inboxButton.unread', { count }) : t('inboxButton.title');

  return (
    <Button
      variant='ghost'
      size='icon'
      nativeButton={false}
      render={
        <Link
          to='/inbox'
          aria-label={label}
          title={t('inboxButton.title')}
          className='relative'
        />
      }
    >
      <BellIcon aria-hidden />
      {count > 0 ? (
        <span
          aria-hidden
          className='absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-medium text-destructive-foreground'
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Button>
  );
}
