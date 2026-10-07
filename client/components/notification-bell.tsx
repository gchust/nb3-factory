import { NotificationInAppRuntimeContext } from '@nocobase/app-plugin-notification-in-app/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Bell } from 'lucide-react';
import { useContext } from 'react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const ACTION_LINK_CLASS =
  'relative inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * The header entry to the in-app message center, carrying the unread count.
 *
 * It reads the inbox runtime the application layout provides; it does not mount a provider
 * of its own, so the badge and the message center page share one subscription. When the host
 * registers no inbox provider the runtime context is absent and the bell stays a plain link.
 */
export function NotificationBell(): ReactElement {
  const { t } = useTranslation();
  const unreadCount =
    useContext(NotificationInAppRuntimeContext)?.unreadCount ?? 0;
  const label = t('navigation.notifications');

  return (
    <Tooltip>
      <TooltipTrigger
        render={<Link to='/notifications' className={ACTION_LINK_CLASS} />}
        aria-label={label}
      >
        <Bell className='size-5' />
        {unreadCount > 0 ? (
          <Badge
            className='absolute -top-1 -right-1 h-4 min-w-4 justify-center px-1 text-[10px] leading-none'
            aria-hidden='true'
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side='bottom'>{label}</TooltipContent>
    </Tooltip>
  );
}
