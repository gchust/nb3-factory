/**
 * Message center — the durable in-app inbox.
 *
 * The inbox component owns its own header, read state and pagination; this page
 * only gives it the application's page frame. It is reached from the header
 * bell and reads the same runtime the bell does, so marking a message read here
 * updates the unread badge immediately.
 */
import type { ReactElement } from 'react';
import { NotificationInAppInbox } from '@nocobase/app-plugin-notification-in-app/client';

import { PageContainer } from '@/components/page-container';

export default function MessagesPage(): ReactElement {
  return (
    <PageContainer>
      <NotificationInAppInbox />
    </PageContainer>
  );
}
