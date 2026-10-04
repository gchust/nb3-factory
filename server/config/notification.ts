import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // The service module delivers durable in-app messages to ticket assignees
    // and supervisors through this channel.
    channels: { inbox: { provider: 'in-app' } },
  }),
);

export default notification;
