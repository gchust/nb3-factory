import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // The overdue-task reminder, and any other in-app message, targets the `inbox` Channel. It resolves to the
    // `in-app` Provider that the notification-in-app plugin registers; without this entry `notification.send`
    // fails with an unknown Channel and the reminder is silently dropped.
    channels: {
      inbox: { provider: 'in-app' },
    },
  }),
);

export default notification;
