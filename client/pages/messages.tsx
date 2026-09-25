/**
 * Message center — the authenticated App route that hosts the notification
 * plugin's durable in-app inbox.
 *
 * The in-app plugin owns the inbox component, its persistence, CSRF, realtime
 * invalidation and read state; this page only mounts its provider locally (so
 * its realtime subscription and focus listeners clean up when navigation leaves
 * the page) inside the application's page container. Opening a message follows
 * the message's `target` route, which for acceptance notifications is the
 * service request detail drawer.
 *
 * Registered as an application route rather than reusing the plugin's
 * development-only `/dev/notification-in-app` page, which is absent from a
 * production build.
 */
import {
  NotificationInAppInbox,
  NotificationInAppProvider,
} from '@nocobase/app-plugin-notification-in-app/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';

export default function MessagesPage(): ReactElement {
  return (
    <PageContainer>
      <NotificationInAppProvider>
        <NotificationInAppInbox />
      </NotificationInAppProvider>
    </PageContainer>
  );
}
