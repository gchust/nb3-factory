import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // The durable in-app inbox is the notification surface this application
    // uses for acceptance, assignment and overdue reminders. The channel key
    // `inbox` is referenced by the notification service when it sends.
    channels: { inbox: { provider: 'in-app' } },
  }),
);

export default notification;
