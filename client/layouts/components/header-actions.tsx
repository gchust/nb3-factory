import { useInboxUnreadCount } from '@nocobase/app-plugin-notification-in-app/client/inbox';
import type { ReactElement } from 'react';
import { inboxBadge, useDocumentTitleBadge } from '#components/inbox-badge';
import { InboxButton } from '#components/inbox-button';
import { TooltipProvider } from '#components/ui/tooltip';

import { ThemeSettings } from '../../theme/index.js';
import { UserMenu } from './user-menu.js';

/**
 * The inbox entry point. Ticket assignment and resolution notifications land in the inbox, and its badge is how the
 * recipient notices them; the button links to the `/inbox` route, which the notification-in-app plugin does not
 * provide itself. Nothing in this application produces inbox *decisions*, so only the unread count is shown.
 */
function InboxEntry(): ReactElement {
  const unread = useInboxUnreadCount();
  const badge = inboxBadge(0, unread.data ?? 0);
  useDocumentTitleBadge(badge?.text ?? null);
  return <InboxButton badge={badge} />;
}

/** The header's right-hand actions, shared by every authenticated page. */
export function HeaderActions(): ReactElement {
  return (
    <TooltipProvider>
      <div className='flex shrink-0 items-center gap-2'>
        <InboxEntry />
        <ThemeSettings />
        <UserMenu />
      </div>
    </TooltipProvider>
  );
}
