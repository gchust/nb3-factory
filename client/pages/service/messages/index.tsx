import {
  NotificationInAppInbox,
  NotificationInAppProvider,
} from '@nocobase/app-plugin-notification-in-app/client';

import { PageContainer } from '@/components/page-container';

/**
 * The production in-app message center.
 *
 * The notification plugin owns the inbox persistence, per-user isolation and
 * the inbox UI itself; this page only gives that UI a signed-in application
 * route. The provider is mounted here, so its realtime subscription and focus
 * listener live only while the page is open. The plugin's own inbox page is a
 * development route and is absent from a production build.
 */
export default function ServiceMessagesPage() {
  return (
    <PageContainer>
      <NotificationInAppProvider>
        <NotificationInAppInbox />
      </NotificationInAppProvider>
    </PageContainer>
  );
}
