import { QueryClientContext, useQueryClient } from '@tanstack/react-query';
import {
  inboxKeys,
  useInboxUnreadCount,
} from '@nocobase/app-plugin-notification-in-app/client/inbox';
import { useContext, useEffect, type ReactElement } from 'react';

import { InboxButton } from '#components/inbox-button';
import { inboxBadge, useDocumentTitleBadge } from '#components/inbox-badge';

/**
 * The header's inbox entry. Helpdesk notifications arrive while a person is
 * working on another page, so the unread count is refreshed periodically even
 * when the realtime channel is unavailable; the inbox page subscribes to the
 * same queries and therefore updates as well.
 */
function InboxWithUnread(): ReactElement {
  const queryClient = useQueryClient();
  const unread = useInboxUnreadCount();
  const badge = inboxBadge(0, unread.data ?? 0);
  useDocumentTitleBadge(badge?.text ?? null);

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
    };
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, [queryClient]);

  return <InboxButton badge={badge} />;
}

/**
 * Rendered in the shell header. A layout rendered without a QueryClient (small
 * component tests, isolated stories) still gets the link, just no live count.
 */
export function HeaderInbox(): ReactElement {
  const queryClient = useContext(QueryClientContext);
  return queryClient ? <InboxWithUnread /> : <InboxButton badge={null} />;
}
