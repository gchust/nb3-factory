import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // In-app is this application's only notification channel and it needs no
    // external credentials, so it is enabled by default. A deployment that
    // supplies its own configuration file (for example the acceptance harness)
    // replaces `config.yml` wholesale; without a default here the channel is
    // absent and every notification is silently dropped.
    channels: {
      inbox: { provider: 'in-app' },
    },
  }),
);

export default notification;
