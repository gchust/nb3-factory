import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  // The in-app inbox is the only channel this application needs, and it must
  // work in a fresh installation that has not written a config file yet. A
  // deployment config may still override or extend these channels.
  (_runtime) => ({ channels: { inbox: { provider: 'in-app' } } }),
);

export default notification;
