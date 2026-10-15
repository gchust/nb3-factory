import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // The service desk's inbox channel. Without an entry here the notification
    // manager has no channel to deliver to and in-app reminders are dropped.
    channels: { inbox: { provider: 'in-app' } },
  }),
);

export default notification;
