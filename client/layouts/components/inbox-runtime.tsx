import {
  apiClientToken,
  ClientApplicationContext,
  realtimeClientToken,
} from '@nocobase/app-client';
import {
  NotificationInAppProvider,
  useNotificationInAppRuntime,
} from '@nocobase/app-plugin-notification-in-app/client';
import { useContext, useMemo, type ReactElement, type ReactNode } from 'react';

import { InboxRuntimeContext } from './inbox-runtime-context.js';

function InboxRuntimeBridge({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const { unreadCount } = useNotificationInAppRuntime();
  const value = useMemo(() => ({ unreadCount }), [unreadCount]);
  return (
    <InboxRuntimeContext.Provider value={value}>
      {children}
    </InboxRuntimeContext.Provider>
  );
}

/**
 * Mounts the notification inbox runtime around the signed-in shell when its
 * dependency services are present. Reading the application context directly
 * (rather than `useClientApplication`) keeps the shell renderable where the
 * provider's services are absent.
 */
export function InboxProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const app = useContext(ClientApplicationContext);
  const services = app?.services;
  if (
    !services ||
    !services.has(apiClientToken) ||
    !services.has(realtimeClientToken)
  ) {
    return <>{children}</>;
  }
  return (
    <NotificationInAppProvider>
      <InboxRuntimeBridge>{children}</InboxRuntimeBridge>
    </NotificationInAppProvider>
  );
}
