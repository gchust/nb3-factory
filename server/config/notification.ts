import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // `inbox` is the durable in-app channel the notification service sends
    // through; the `in-app` provider persists each message in the message
    // center instead of only pushing a transient toast.
    channels: { inbox: { provider: 'in-app' } },
  }),
);

export default notification;
