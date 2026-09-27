import {
  NotificationInAppInbox,
  NotificationInAppProvider,
} from '@nocobase/app-plugin-notification-in-app/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';

/**
 * The message center. It renders the in-app plugin's own inbox — the same
 * durable messages the acceptance workflow writes through the Notification
 * service — so an assignee reads them, opens the linked request, and the read
 * state is the plugin's persisted state rather than anything this page keeps.
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
