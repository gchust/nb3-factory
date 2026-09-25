import type {
  NotificationProviderConfig,
  NotificationProviderDefinition,
  NotificationProviderErrorCategory,
  ProviderSendResult,
} from '@nocobase/app-plugin-notification/server';
import { notificationI18nText } from '@nocobase/app-plugin-notification/server';
import type { PreparedImMessage } from '@nocobase/app-plugin-notification-providers/im';

import {
  TEST_NOTIFICATION_DELIVERY_ID_HEADER,
  TEST_NOTIFICATION_RECEIVER_TOKEN_HEADER,
  testNotificationReceiverToken,
} from './test-receiver.js';

/**
 * The provider for the application's own external test channel.
 *
 * It is deliberately a thin HTTP provider registered into the Notification plugin's provider registry rather than a
 * second delivery mechanism: the plugin's channel definition supplies the test form, the scheduler picks up the
 * delivery, and the plugin's store records queued/accepted/failed together with the reason this provider returns.
 * That is what keeps the result visible on the existing diagnostics page.
 *
 * The `im` message type is reused because it already defines the test adapter (title, message, optional URL) and a
 * prepared-message shape a webhook can post, so no channel definition of our own is needed.
 */
export interface TestWebhookProviderConfig extends NotificationProviderConfig {
  readonly provider: 'test-webhook';
  readonly webhookUrl: string;
  readonly token?: string;
}

export function defineTestWebhookProviderConfig(
  input: Omit<TestWebhookProviderConfig, 'provider'>,
): TestWebhookProviderConfig {
  return { provider: 'test-webhook', ...input };
}

const MAX_REASON_LENGTH = 512;

export function createTestWebhookProviderDefinition(): NotificationProviderDefinition<
  TestWebhookProviderConfig,
  PreparedImMessage
> {
  return {
    type: 'test-webhook',
    messageType: 'im',
    label: notificationI18nText(
      'test.providers.externalReceiver',
      'External test receiver',
    ),
    validateConfig: validateTestWebhookProviderConfig,
    async createProvider(_context, config) {
      validateTestWebhookProviderConfig(config);
      return {
        type: 'test-webhook',
        async send({ message, deliveryId, signal }) {
          return postTestNotification(config, message, deliveryId, signal);
        },
      };
    },
  };
}

async function postTestNotification(
  config: TestWebhookProviderConfig,
  message: PreparedImMessage,
  deliveryId: string,
  signal: AbortSignal,
): Promise<ProviderSendResult> {
  const body = JSON.stringify({
    title: message.content.title,
    text: message.content.text,
    url: message.content.target?.url,
    deliveryId,
  });

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [TEST_NOTIFICATION_RECEIVER_TOKEN_HEADER]:
          config.token ?? testNotificationReceiverToken,
        [TEST_NOTIFICATION_DELIVERY_ID_HEADER]: deliveryId,
      },
      body,
      signal,
      redirect: 'manual',
    });

    if (response.ok) {
      await response.body?.cancel();
      return { status: 'accepted' };
    }

    const error = {
      code: String(response.status),
      category: categoryForStatus(response.status),
      message: await readFailureReason(response),
    };

    if (response.status === 429) {
      const retryAfter = retryAfterMs(response.headers.get('retry-after'));
      return {
        status: 'failed',
        disposition: 'same_provider',
        error,
        ...(retryAfter === undefined ? {} : { retryAfterMs: retryAfter }),
      };
    }

    // A 5xx means the receiver may have processed the message before failing, so the outcome is not known rather
    // than failed; anything else the receiver told us about the request is final.
    if (response.status >= 500) {
      return { status: 'submission_unknown', error };
    }

    return { status: 'failed', disposition: 'never', error };
  } catch (error) {
    const message = describeError(error);
    if (signal.aborted) {
      return {
        status: 'submission_unknown',
        error: { code: 'HTTP_ABORTED', category: 'timeout', message },
      };
    }
    return {
      status: 'failed',
      disposition: 'same_provider',
      error: { code: errorCode(error), category: 'network', message },
    };
  }
}

/**
 * Preserve what the receiver actually said. A controlled failure is only useful when its reason survives to the
 * diagnostics page, so a JSON `error.message`/`message` wins and raw text is the fallback.
 */
async function readFailureReason(response: Response): Promise<string> {
  const fallback = `The test receiver responded with HTTP ${response.status}.`;
  const text = await response.text().catch(() => '');
  const candidate = parseJsonMessage(text) ?? text.trim();
  return candidate ? truncate(candidate) : fallback;
}

function parseJsonMessage(text: string): string | undefined {
  if (!text) return undefined;
  try {
    const value = JSON.parse(text) as unknown;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const error = record.error;
      const fromError =
        error && typeof error === 'object'
          ? (error as Record<string, unknown>).message
          : undefined;
      if (typeof fromError === 'string') return fromError;
      if (typeof record.message === 'string') return record.message;
    }
  } catch {
    // Not JSON; the raw body is the reason.
  }
  return undefined;
}

function truncate(value: string): string {
  // A reason copied from a response header or body can carry control characters; strip them so the diagnostics page
  // shows readable text. Written as a codepoint filter because a control-character regular expression is rejected
  // by the lint rules for exactly the reason it is unsafe.
  const normalized = [...value]
    .map((character) => (isControlCharacter(character) ? ' ' : character))
    .join('')
    .trim();
  return normalized.length > MAX_REASON_LENGTH
    ? `${normalized.slice(0, MAX_REASON_LENGTH - 1)}…`
    : normalized;
}

function isControlCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (
    code <= 0x08 ||
    code === 0x0b ||
    code === 0x0c ||
    (code >= 0x0e && code <= 0x1f) ||
    code === 0x7f
  );
}

function categoryForStatus(status: number): NotificationProviderErrorCategory {
  if (status === 401 || status === 403) return 'authentication';
  if (status === 404) return 'channel';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'provider';
  return 'content';
}

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : 0;
  }
  return undefined;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return truncate(error.message);
  return 'The test receiver could not be reached.';
}

function errorCode(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    if (typeof code === 'string' && code) return code;
    return error.name || 'HTTP_REQUEST_FAILED';
  }
  return 'HTTP_REQUEST_FAILED';
}

export function validateTestWebhookProviderConfig(
  config: TestWebhookProviderConfig,
): void {
  validateTestWebhookUrl(config.webhookUrl);
  if (
    config.token !== undefined &&
    (typeof config.token !== 'string' || !config.token.trim())
  ) {
    throw new Error('Test receiver token must be a non-empty string.');
  }
}

/**
 * Used by the channel configuration to drop an invalid receiver URL from the environment instead of failing startup.
 */
export function isTestWebhookUrlAllowed(value: unknown): value is string {
  try {
    validateTestWebhookUrl(value);
    return true;
  } catch {
    return false;
  }
}

function validateTestWebhookUrl(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Test receiver URL is required.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Test receiver URL must be an absolute URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Test receiver URL must use HTTP or HTTPS.');
  }
  if (url.username || url.password) {
    throw new Error('Test receiver URL must not contain embedded credentials.');
  }
  // Plain HTTP is only accepted for loopback, so an externally supplied receiver cannot downgrade the transport.
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) {
    throw new Error(
      'Plain HTTP test receiver URLs must point to a loopback host.',
    );
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0'
  );
}
