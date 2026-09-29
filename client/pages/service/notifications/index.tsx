import {
  NotificationInAppInbox,
  NotificationInAppProvider,
} from '@nocobase/app-plugin-notification-in-app/client';

import { PageContainer } from '@/components/page-container';

/**
 * The application's durable in-app inbox.
 *
 * The notification plugin owns the store, the read state and the rendering;
 * the application owns where the page lives. It is a real, linkable page so a
 * recipient can open the persistent message a business action produced, and
 * the header bell points here.
 */
export default function NotificationsPage() {
  return (
    <PageContainer>
      <NotificationInAppProvider>
        <NotificationInAppInbox />
      </NotificationInAppProvider>
    </PageContainer>
  );
}
