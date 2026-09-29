import {
  NotificationInAppInbox,
  NotificationInAppProvider,
} from '@nocobase/app-plugin-notification-in-app/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';

/**
 * The signed-in user's durable inbox. It is per-actor, so the route declares no
 * page grant; the inbox endpoint scopes to the session independently.
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
