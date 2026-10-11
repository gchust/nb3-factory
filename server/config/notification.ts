import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // The in-app channel is the durable inbox the ticket workflow notifies through. It is registered by the
    // notification plugin; naming it here is what makes `messages.inbox` a configured channel rather than an
    // unconfigured provider.
    channels: {
      inbox: { provider: 'in-app' },
    },
  }),
);

export default notification;
