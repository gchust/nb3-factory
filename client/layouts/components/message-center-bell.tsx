import {
  apiClientToken,
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

import { Badge } from '@/components/ui/badge';

const ACTION_LINK_CLASS =
  'relative inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * The header's message-center entry.
 *
 * It reuses the in-app inbox plugin's own provider, so the durable unread count
 * and its realtime invalidation come from the plugin rather than a second
 * store. The provider is mounted here rather than around the whole shell: the
 * header is the only place that needs the count, and the message-center page
 * mounts its own instance while it is open.
 *
 * The inbox services are read from the running application, and the entry is
 * omitted when they are absent. That is what lets a test render the header with
 * only the authentication and authorization clients, and it matches production:
 * an application that did not register the notification plugin has no inbox to
 * link to.
 */
export function MessageCenterBell(): ReactElement | null {
  const app = useClientApplication();
  // A shell rendered without the client services — a test, or an application
  // that registered no API client — has no inbox to link to.
  const services = (
    app as unknown as { services?: { has(token: unknown): boolean } }
  ).services;
  if (!services?.has(apiClientToken) || !services.has(realtimeClientToken)) {
    return null;
  }
  return (
    <NotificationInAppProvider>
      <BellLink />
    </NotificationInAppProvider>
  );
}

function BellLink(): ReactElement {
  const { t } = useTranslation();
  const { unreadCount } = useNotificationInAppRuntime();
  const label = t('shell.messageCenter', { defaultValue: 'Message center' });

  return (
    <Link
      aria-label={
        unreadCount > 0
          ? t('shell.messageCenterUnread', {
              defaultValue: 'Message center, {{count}} unread',
              count: unreadCount,
            })
          : label
      }
      className={ACTION_LINK_CLASS}
      to='/messages'
    >
      <Bell className='size-5' />
      {unreadCount > 0 ? (
        <Badge
          className='absolute -top-1 -right-1 h-5 min-w-5 justify-center rounded-full px-1 text-[0.65rem] tabular-nums'
          variant='destructive'
        >
          {unreadCount}
        </Badge>
      ) : null}
    </Link>
  );
}
