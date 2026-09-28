import { ApiClientError, type ApiClient } from '@nocobase/app-client';

import type {
  NotificationTestSendResult,
  NotificationTestTarget,
} from './test-target.js';

/**
 * The notification test endpoints refuse a request without this header, so only an explicit test entry can reach
 * them. The header is not authentication; the routes still require a session and the `notification:test send`
 * permission.
 */
const TEST_HEADER = { 'x-nocobase-notification-test': '1' } as const;

/** List the channels the application offers for a test, with their fields. */
export async function listTestTargets(
  api: ApiClient,
): Promise<readonly NotificationTestTarget[]> {
  const response = await api.request<{ data: NotificationTestTarget[] }>({
    path: 'notifications/test/targets',
    headers: TEST_HEADER,
  });
  return response.data;
}

/** Ask the application to send one test notification on a single channel. */
export async function sendTestNotification(
  api: ApiClient,
  request: {
    readonly channel: string;
    readonly values: Readonly<Record<string, string>>;
  },
): Promise<NotificationTestSendResult> {
  const response = await api.request<{ data: NotificationTestSendResult }>({
    path: 'notifications/test/send',
    method: 'POST',
    headers: TEST_HEADER,
    json: request,
  });
  return response.data;
}

/** The localized message the notification test endpoint returned, falling back to the transport error. */
export function readNotificationTestError(cause: unknown): string {
  if (cause instanceof ApiClientError) {
    const payload = cause.payload;
    if (isRecord(payload)) {
      const error = payload.error;
      if (isRecord(error) && typeof error.message === 'string') {
        return error.message;
      }
      if (typeof payload.message === 'string') return payload.message;
    }
    return cause.message;
  }
  return cause instanceof Error ? cause.message : String(cause);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
