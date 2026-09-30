import { NotificationInAppInbox } from '@nocobase/app-plugin-notification-in-app/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';

/**
 * The durable, per-user message centre. It is an application page rather than
 * the plugin's development-only route: the plugin owns the inbox component,
 * persistence and authentication, and this page is the production surface the
 * header bell links to. The Provider mounted at the application root keeps the
 * unread badge live while this page renders the inbox list; the component
 * carries its own header, so the page adds no second one.
 */
export default function ServiceNotificationsPage(): ReactElement {
  return (
    <PageContainer>
      <NotificationInAppInbox />
    </PageContainer>
  );
}
