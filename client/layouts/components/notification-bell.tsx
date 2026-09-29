import {
  NotificationInAppProvider,
  useNotificationInAppRuntime,
} from '@nocobase/app-plugin-notification-in-app/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Bell } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { HEADER_ACTION_LINK_CLASS } from './header-action.js';

/**
 * The durable in-app inbox entry. It shows the unread count from the
 * notification plugin and links to the application's notifications page, so a
 * recipient can see the persistent message a business action produced instead
 * of a toast that disappears.
 */
export function NotificationBell(): ReactElement {
  return (
    <NotificationInAppProvider>
      <NotificationBellButton />
    </NotificationInAppProvider>
  );
}

function NotificationBellButton(): ReactElement {
  const { t } = useTranslation();
  const { unreadCount } = useNotificationInAppRuntime();
  const label = t('notifications.title', { defaultValue: 'Notifications' });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to='/service/notifications'
            className={`relative ${HEADER_ACTION_LINK_CLASS}`}
          />
        }
        aria-label={label}
      >
        <Bell className='size-5' />
        {unreadCount > 0 ? (
          <span className='absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground'>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side='bottom'>
        {unreadCount > 0
          ? t('notifications.unread', {
              count: unreadCount,
              defaultValue: '{{count}} unread',
            })
          : label}
      </TooltipContent>
    </Tooltip>
  );
}
