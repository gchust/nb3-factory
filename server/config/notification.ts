import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    channels: {
      // In-app delivery powers the acceptance and overdue reminders. The
      // `in-app` channel is provided by `@nocobase/app-plugin-notification-in-app`.
      inbox: { provider: 'in-app' },
    },
  }),
);

export default notification;
