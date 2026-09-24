/**
 * Message center. The durable in-app inbox is owned by the in-app notification
 * plugin: the provider subscribes to realtime invalidations and tracks the
 * unread count, and the inbox renders the persisted messages with their read
 * state and the "Open" link into the linked service request.
 */
import {
  NotificationInAppInbox,
  NotificationInAppProvider,
} from '@nocobase/app-plugin-notification-in-app/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';

export default function MessagesPage(): ReactElement {
  return (
    <NotificationInAppProvider>
      <PageContainer>
        <NotificationInAppInbox />
      </PageContainer>
    </NotificationInAppProvider>
  );
}
