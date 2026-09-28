import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';
import { defineSmtpProviderConfig } from '@nocobase/app-plugin-notification-providers/server';

/**
 * The isolated destinations this application offers for verifying notification delivery from the existing
 * notification logs page. They exist so a test never has to reach a customer or a real group:
 *
 * - `test-inbox` records a normal in-app delivery; the test entry pins it to the signed-in user's own inbox.
 * - `test-failure` points SMTP at a reserved `.invalid` host, so name resolution fails deterministically offline and a
 *   controlled failure with its preserved reason is observable without a receiver or a real channel being
 *   reconfigured.
 *
 * Keep the `test-` prefix: the notification test entry only offers channels that carry it.
 */
const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    channels: {
      'test-inbox': { provider: 'in-app' },
      'test-failure': defineSmtpProviderConfig({
        host: 'notification-test.invalid',
        port: 25,
        secure: false,
        from: 'notification-test@example.invalid',
      }),
    },
  }),
);

export default notification;
