import {
  apiClientToken,
  realtimeClientToken,
  useClientApplication,
} from '@nocobase/app-client';
import {
  useInboxRefresh,
  useInboxUnreadCount,
} from '@nocobase/app-plugin-notification-in-app/client/inbox';
import type { ReactElement } from 'react';

import { inboxBadge, useDocumentTitleBadge } from '#components/inbox-badge';
import { InboxButton } from '#components/inbox-button';
import { TooltipProvider } from '#components/ui/tooltip';

import { ThemeSettings } from '../../theme/index.js';
import { UserMenu } from './user-menu.js';

/**
 * The header's inbox entry. It is separate so a host that runs without the
 * notification plugin keeps the rest of the header instead of failing on a
 * service the plugin would have registered.
 */
function InboxAction(): ReactElement {
  useInboxRefresh();
  const unread = useInboxUnreadCount();
  // Notifications are the only inbox entries this application uses, so nothing
  // is waiting for a decision; the badge counts what has not been read.
  const badge = inboxBadge(0, unread.data ?? 0);
  useDocumentTitleBadge(badge?.text ?? null);
  return <InboxButton badge={badge} />;
}

/** The header's right-hand actions, shared by every authenticated page. */
export function HeaderActions(): ReactElement {
  const app = useClientApplication();
  // A host may run without the services the inbox needs (and tests render the
  // shell without a service container at all), so treat an absent container as
  // "not available" instead of failing the whole header.
  const inboxAvailable =
    app.services?.has(apiClientToken) === true &&
    app.services.has(realtimeClientToken);

  return (
    <TooltipProvider>
      <div className='flex shrink-0 items-center gap-2'>
        {inboxAvailable ? <InboxAction /> : null}
        <ThemeSettings />
        <UserMenu />
      </div>
    </TooltipProvider>
  );
}
