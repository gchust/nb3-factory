import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

/**
 * One channel, `inApp`, backed by the durable in-app provider. Service-desk
 * messages address a user id directly, so no channel routing config is needed
 * beyond declaring the provider.
 */
const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({ channels: { inApp: { provider: 'in-app' } } }),
);

export default notification;
