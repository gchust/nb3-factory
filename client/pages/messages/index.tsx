import {
  NotificationInAppInbox,
  NotificationInAppProvider,
} from '@nocobase/app-plugin-notification-in-app/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';

/**
 * The authenticated message center.
 *
 * It renders the in-app notification plugin's own inbox and provider, so the
 * durable store, per-user isolation, read state and realtime invalidation stay
 * plugin-owned. This route is the production surface for the plugin's
 * development-only `/dev/notification-in-app` page.
 */
export default function MessagesPage(): ReactElement {
  return (
    <PageContainer>
      <NotificationInAppProvider>
        <NotificationInAppInbox />
      </NotificationInAppProvider>
    </PageContainer>
  );
}
