import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // The in-app channel is what makes the server-side notification service deliver to the durable inbox
    // that the notification-in-app plugin renders. Without a channel entry `send()` has nowhere to deliver.
    channels: {
      inbox: { provider: 'in-app' },
    },
  }),
);

export default notification;
