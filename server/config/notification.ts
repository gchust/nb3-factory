import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

/**
 * The `inbox` channel is the application's own in-app notifications: the service desk's ticket notifications are
 * delivered only there, so that is the one provider this application configures. `notificationProviders` and
 * `notificationInApp` are both registered in `server/plugins.ts`.
 */
const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({ channels: { inbox: { provider: 'in-app' } } }),
);

export default notification;
