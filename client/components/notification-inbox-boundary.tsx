import {
  ClientApplicationContext,
  apiClientToken,
  realtimeClientToken,
} from '@nocobase/app-client';
import { NotificationInAppProvider } from '@nocobase/app-plugin-notification-in-app/client';
import { useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';

/**
 * Mounts the in-app message subscription the authenticated shell shares between the header
 * bell and the `/notifications` page, so unread state is fetched and subscribed to once.
 *
 * The inbox provider needs the application's HTTP and realtime clients. A host that renders
 * the layout without them — an isolated component test, an embedded renderer — still gets a
 * working shell, and `NotificationBell` degrades to a plain link with no unread badge.
 */
export function NotificationInboxBoundary({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  const app = useContext(ClientApplicationContext);
  const services = app?.services;
  const ready =
    services != null &&
    services.has(apiClientToken) &&
    services.has(realtimeClientToken);
  if (!ready) return <>{children}</>;
  return <NotificationInAppProvider>{children}</NotificationInAppProvider>;
}
