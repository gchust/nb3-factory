import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    channels: {
      // The in-app inbox is how the service desk reaches an assignee or a
      // requester. `inbox` is the channel name callers use in `messages`; the
      // `in-app` provider is registered by app-plugin-notification-in-app.
      inbox: { provider: 'in-app', enabled: true },
    },
  }),
);

export default notification;
