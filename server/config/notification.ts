import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // In-app notices are the only notification channel this application uses;
    // the `inbox` key is what the notification service addresses messages to.
    channels: { inbox: { provider: 'in-app' } },
  }),
);

export default notification;
