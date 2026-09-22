import type { ApiClient } from '@nocobase/app-client';

/**
 * The small slice of the in-app inbox HTTP contract this application uses.
 * The plugin owns the endpoints, authentication, per-user isolation and CSRF;
 * these helpers only call them through the application-scoped `ApiClient`.
 */
export interface InboxItem {
  readonly id: string;
  readonly title?: string | null;
  readonly body: string;
  readonly actionUrl?: string | null;
  readonly readAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface InboxPage {
  readonly data: readonly InboxItem[];
  readonly nextCursor?: string;
}

export async function fetchInbox(
  client: ApiClient,
  options: { limit?: number; unreadOnly?: boolean; cursor?: string } = {},
  signal?: AbortSignal,
): Promise<InboxPage> {
  const query = new URLSearchParams({ limit: String(options.limit ?? 25) });
  if (options.unreadOnly) query.set('unreadOnly', 'true');
  if (options.cursor) query.set('cursor', options.cursor);
  const value = await client.request<unknown>({
    path: `notifications/in-app?${query.toString()}`,
    signal,
  });
  if (Array.isArray(value)) return { data: value as InboxItem[] };
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as InboxPage).data)
  ) {
    return value as InboxPage;
  }
  throw new Error('Inbox returned an invalid response.');
}

export async function fetchUnreadCount(
  client: ApiClient,
  signal?: AbortSignal,
): Promise<number> {
  const response = await client.request<{ count: number }>({
    path: 'notifications/in-app/unread-count',
    signal,
  });
  return response.count;
}

async function mutate<T>(
  client: ApiClient,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const csrf = await client.request<{ token: string }>({
    path: 'notifications/in-app/csrf',
  });
  return client.request<T>({
    path,
    method: 'POST',
    headers: { 'x-csrf-token': csrf.token },
    json: body,
  });
}

export function mutateInboxItem(
  client: ApiClient,
  id: string,
  action: 'read' | 'unread' | 'delete',
): Promise<{ data: InboxItem }> {
  return mutate<{ data: InboxItem }>(
    client,
    `notifications/in-app/${encodeURIComponent(id)}`,
    { action },
  );
}

export function markInboxRead(client: ApiClient): Promise<{ updated: number }> {
  return mutate<{ updated: number }>(
    client,
    'notifications/in-app/read-all',
    {},
  );
}
