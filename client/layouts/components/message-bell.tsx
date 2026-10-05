import { useTranslation } from '@nocobase/i18n/client';
import { Bell } from 'lucide-react';
import { useContext, type ReactElement } from 'react';
import { Link } from 'react-router';

import { NotificationInAppRuntimeContext } from '@nocobase/app-plugin-notification-in-app/client';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * The header's message entry.
 *
 * It reads the inbox runtime rather than fetching its own count, so the badge
 * here and the message-center page share one source of truth. The runtime is
 * mounted only inside the signed-in application shell; without it there is no
 * inbox to open and the bell renders nothing, which keeps it out of the guest
 * and optional surfaces.
 */
export const ACTION_LINK_CLASS =
  'relative inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

export function MessageBell(): ReactElement | null {
  const { t } = useTranslation();
  const runtime = useContext(NotificationInAppRuntimeContext);
  if (!runtime) return null;
  const label = t('service.nav.messages');
  const count = runtime.unreadCount;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Link to='/service/messages' className={ACTION_LINK_CLASS} />}
        aria-label={
          count > 0 ? t('service.messages.bellUnread', { count }) : label
        }
      >
        <Bell className='size-5' />
        {count > 0 ? (
          <span
            data-slot='message-bell-badge'
            className='absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] leading-none font-semibold text-primary-foreground'
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side='bottom'>{label}</TooltipContent>
    </Tooltip>
  );
}
