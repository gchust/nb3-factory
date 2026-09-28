import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  // The service workflow notifies engineers and supervisors through the
  // durable in-app inbox, so its Channel ships enabled by default.
  (_runtime) => ({
    channels: {
      inbox: { provider: 'in-app' },
    },
  }),
);

export default notification;
