import { NotificationInAppInbox } from '@nocobase/app-plugin-notification-in-app/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';

/**
 * The production message center.
 *
 * The notification-in-app plugin owns the inbox itself and exposes it publicly, but its
 * only page is a development-only route that a production build removes. This application
 * supplies the page users actually open, and the header bell that links to it; both read
 * the provider mounted by `AppLayout`. The inbox's own "Open" action navigates to each
 * notification's `target.path`, which the helpdesk sends as `/tickets/<id>`.
 */
export default function NotificationsPage(): ReactElement {
  return (
    <PageContainer>
      <NotificationInAppInbox />
    </PageContainer>
  );
}
