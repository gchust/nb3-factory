import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type {
  NotificationChannelConfig,
  NotificationConfig,
} from '@nocobase/app-plugin-notification/server';

import {
  resolveTestNotificationReceiverUrls,
  testNotificationReceiverToken,
} from '../notifications/test-receiver.js';
import {
  defineTestWebhookProviderConfig,
  isTestWebhookUrlAllowed,
} from '../notifications/test-webhook-provider.js';

/**
 * Two channels are configured by default so that a browser check can exercise both halves of the requirement without
 * a receiver to stand up and without editing a real channel:
 *
 * - the normal channel delivers to the isolated loopback receiver and ends `accepted`;
 * - the `-failure` channel delivers to the receiver's failure path, which answers 400 with a fixed reason, so the
 *   diagnostics page shows a real failed delivery and the reason the receiver gave.
 *
 * An independent check can point the normal channel at its own isolated receiver with `FACTORY_TEST_RECEIVER_URL`
 * and name the channel with `FACTORY_TEST_CHANNEL`; the failure channel keeps using the in-process receiver, unless
 * `FACTORY_TEST_FAILURE_RECEIVER_URL` points it at a receiver of its own so a test can assert the exact reason it
 * returns.
 */
const DEFAULT_PRIMARY_CHANNEL = 'test-inbox';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (runtime) => {
    const urls = resolveTestNotificationReceiverUrls({
      env: runtime.env,
      publicBasePath: runtime.routing.publicBasePath,
    });

    const primaryName =
      normalizeChannelName(runtime.env.FACTORY_TEST_CHANNEL) ??
      DEFAULT_PRIMARY_CHANNEL;
    const primaryUrl =
      validExternalReceiverUrl(runtime.env.FACTORY_TEST_RECEIVER_URL) ??
      urls.normal;
    const failureUrl =
      validExternalReceiverUrl(runtime.env.FACTORY_TEST_FAILURE_RECEIVER_URL) ??
      urls.failure;

    const channels: Record<string, NotificationChannelConfig> = {
      [primaryName]: defineTestWebhookProviderConfig({
        webhookUrl: primaryUrl,
        token: testNotificationReceiverToken,
      }),
      [`${primaryName}-failure`]: defineTestWebhookProviderConfig({
        webhookUrl: failureUrl,
        token: testNotificationReceiverToken,
      }),
    };

    return { channels };
  },
);

function normalizeChannelName(value: string | undefined): string | undefined {
  const name = value?.trim();
  if (
    !name ||
    name.length > 100 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name)
  ) {
    return undefined;
  }
  return name;
}

function validExternalReceiverUrl(
  value: string | undefined,
): string | undefined {
  const url = value?.trim();
  if (!url || !isTestWebhookUrlAllowed(url)) return undefined;
  return url;
}

export default notification;
