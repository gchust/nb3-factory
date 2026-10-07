import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // The service desk notifies through the durable in-app inbox. The channel is
    // named `inbox` here and the work-order routes send to that name, so a
    // deployment that adds email or IM keeps this one and adds others beside it.
    channels: {
      inbox: { provider: 'in-app' },
    },
  }),
);

export default notification;
