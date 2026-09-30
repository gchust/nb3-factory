import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { Link } from 'react-router';
import { Bell } from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { useInboxUnreadCount } from './inbox-runtime-context.js';

const ACTION_LINK_CLASS =
  'relative inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * The message-centre entry. The unread count comes from the application-level
 * inbox runtime, so the badge stays current on every page rather than only on
 * the inbox page itself, and the entry links to the app-owned inbox route.
 */
export function InboxEntry(): ReactElement {
  const { t } = useTranslation();
  const unreadCount = useInboxUnreadCount();
  const label = t('service.inbox.title');

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link to='/service/notifications' className={ACTION_LINK_CLASS} />
        }
        aria-label={label}
      >
        <Bell className='size-5' />
        {unreadCount > 0 ? (
          <span
            aria-hidden
            className='absolute -top-1 -right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground'
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side='bottom'>{label}</TooltipContent>
    </Tooltip>
  );
}
