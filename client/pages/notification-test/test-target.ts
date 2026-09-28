/**
 * The destination rules for the notification test entry.
 *
 * The entry may only send to a channel whose name carries {@link TEST_CHANNEL_PREFIX}, and the destination is pinned
 * here rather than typed by hand: the in-app channel goes to the signed-in user's own inbox, and an email channel
 * goes to a reserved address that no real mailbox owns. Keeping this pure makes "which destination does a channel
 * resolve to" testable without rendering the page.
 */

/** Only channels with this prefix are offered, so a real customer channel can never be selected here. */
export const TEST_CHANNEL_PREFIX = 'test-';

/** The channel configured to fail on purpose, used to observe a controlled failure in the notification logs. */
export const CONTROLLED_FAILURE_CHANNEL = 'test-failure';

/** A reserved address that no real mailbox owns, used as the isolated destination of an email test. */
export const CONTROLLED_FAILURE_EMAIL = 'notification-test@example.invalid';

export type NotificationTestFieldType = 'text' | 'email' | 'textarea';

export interface NotificationTestField {
  readonly name: string;
  readonly label: string;
  readonly type: NotificationTestFieldType;
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly maxLength?: number;
}

export interface NotificationTestTarget {
  readonly channel: {
    readonly name: string;
    readonly type: string;
    readonly label: string;
  };
  readonly provider: {
    readonly type: string;
    readonly label: string;
  };
  readonly fields: readonly NotificationTestField[];
}

export interface NotificationTestSendResult {
  readonly notificationId: string;
  readonly idempotencyKey: string;
  readonly deduplicated: boolean;
  readonly status: string;
}

/** Whether the test entry may offer this channel. */
export function isTestChannel(target: NotificationTestTarget): boolean {
  return target.channel.name.startsWith(TEST_CHANNEL_PREFIX);
}

/** The isolated destination a channel sends to. */
export function testRecipient(
  target: NotificationTestTarget,
  currentUserId: string,
): string {
  const recipient = target.fields.find((field) => field.name === 'recipient');
  return recipient?.type === 'email' ? CONTROLLED_FAILURE_EMAIL : currentUserId;
}

/** Whether this channel is the one configured to fail on purpose. */
export function isControlledFailure(target: NotificationTestTarget): boolean {
  return target.channel.name === CONTROLLED_FAILURE_CHANNEL;
}

/**
 * Build the request body for the notification test endpoint: pin the recipient and keep each field's default so the
 * message matches what the existing notification dialog would send.
 */
export function buildTestRequest(
  target: NotificationTestTarget,
  currentUserId: string,
): { readonly channel: string; readonly values: Record<string, string> } {
  const values: Record<string, string> = {};
  for (const field of target.fields) {
    if (field.name === 'recipient') {
      values[field.name] = testRecipient(target, currentUserId);
      continue;
    }
    if (field.defaultValue !== undefined) {
      values[field.name] = field.defaultValue;
    }
  }
  return { channel: target.channel.name, values };
}
