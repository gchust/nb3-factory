import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // `inbox` is the application's channel name; the In-app Notification plugin
    // registers the `in-app` provider at boot, so the provider is available
    // without this application implementing or configuring a transport.
    channels: { inbox: { provider: 'in-app' } },
  }),
);

export default notification;
