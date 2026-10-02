import { NotificationInAppInbox } from '@nocobase/app-plugin-notification-in-app/client';
import { NotificationInAppProvider } from '@nocobase/app-plugin-notification-in-app/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';

/**
 * The production message center.
 *
 * The In-app Notification plugin ships its durable inbox and its provider, but exposes only a development route
 * (`/dev/notification-in-app`). This application route is the product surface the service desk links to from the
 * dashboard; it uses the plugin's authenticated inbox unchanged. The provider is mounted here so its realtime and
 * focus listeners are cleaned up when the user leaves this page.
 */
export default function ServiceNotificationsPage(): ReactElement {
  return (
    <PageContainer>
      <NotificationInAppProvider>
        <NotificationInAppInbox />
      </NotificationInAppProvider>
    </PageContainer>
  );
}
