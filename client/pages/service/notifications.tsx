import {
  NotificationInAppInbox,
  NotificationInAppProvider,
} from '@nocobase/app-plugin-notification-in-app/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';

/**
 * The message center.
 *
 * The notification-in-app plugin ships its inbox as a development-only page,
 * which a production build drops. The capability is a product feature here —
 * engineers read the notifications the work-order workflow and overdue
 * reminders produce — so the application owns the route and reuses the
 * plugin's provider and inbox instead of reimplementing the list.
 */
export default function NotificationsPage(): ReactElement {
  return (
    <PageContainer>
      <NotificationInAppProvider>
        <NotificationInAppInbox />
      </NotificationInAppProvider>
    </PageContainer>
  );
}
