import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // The `inbox` Channel the IT service desk sends ticket notifications through. It is
    // backed by the `in-app` provider, so a notification becomes a durable inbox item.
    channels: {
      inbox: { provider: 'in-app' },
    },
  }),
);

export default notification;
