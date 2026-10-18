import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

// The in-app inbox is the channel the help desk notifies through. It is declared here rather than in `config.yml`
// so the channel exists on any database, and an operator can still override or disable it in `config.yml`.
const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    channels: {
      inbox: { provider: 'in-app' },
    },
  }),
);

export default notification;
