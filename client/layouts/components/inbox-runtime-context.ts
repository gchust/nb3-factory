import { createContext, useContext } from 'react';

/**
 * The unread count shell components read.
 *
 * It exists so the header bell can be rendered even when the inbox provider
 * cannot mount — a test environment without the API or realtime service, or a
 * deployment that disabled realtime. In that case the count stays at zero
 * instead of the shell failing to render.
 */
export const InboxRuntimeContext = createContext<{ unreadCount: number }>({
  unreadCount: 0,
});

export function useInboxUnreadCount(): number {
  return useContext(InboxRuntimeContext).unreadCount;
}
