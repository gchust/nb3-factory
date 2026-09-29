import {
  realtimeClientToken,
  useClientApplication,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  NotificationInAppProvider,
  useNotificationInAppRuntime,
} from '@nocobase/app-plugin-notification-in-app/client';
import { Bell } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Kept in step with the other header entries so the bell reads as part of the
// same row rather than a one-off control.
const ACTION_LINK_CLASS =
  'relative inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * Header entry to the durable in-app inbox. The provider only wraps the bell and
 * its link, so the unread count is fetched once and shared with the page the link
 * opens rather than fetched again there.
 */
export function MessageBell(): ReactElement | null {
  const app = useClientApplication();
  // The inbox runtime belongs to the notification-in-app plugin. When that
  // plugin is not registered there is no inbox behind the link, so the entry
  // stays hidden instead of failing on a service the application does not have.
  if (!app.services?.has(realtimeClientToken)) {
    return null;
  }
  return (
    <NotificationInAppProvider>
      <MessageBellButton />
    </NotificationInAppProvider>
  );
}

function MessageBellButton(): ReactElement {
  const { t } = useTranslation();
  const { unreadCount } = useNotificationInAppRuntime();
  const label = t('shell.messages', { defaultValue: 'Messages' });

  return (
    <Tooltip>
      <TooltipTrigger
        render={<Link to='/service/messages' className={ACTION_LINK_CLASS} />}
        aria-label={label}
      >
        <Bell className='size-5' />
        {unreadCount > 0 ? (
          <span
            className='absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground'
            data-testid='message-bell-unread'
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side='bottom'>{label}</TooltipContent>
    </Tooltip>
  );
}
