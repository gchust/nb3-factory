import {
  NotificationInAppInbox,
  NotificationInAppProvider,
} from '@nocobase/app-plugin-notification-in-app/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';

/**
 * The application's notification center.
 *
 * The notification-in-app plugin only ships a development-only inbox page, so the production surface for the
 * overdue-task reminders (and every other in-app message) is this App route. The Provider subscribes to realtime
 * invalidations for as long as the page is open, and the inbox itself reads durable HTTP state and renders its own
 * page header, so this page only supplies the application's standard page frame.
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
