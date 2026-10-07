import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // The IT service desk delivers assignment, progress, result and overdue
    // notices into the durable in-app inbox. `inbox` is a channel *name*; the
    // `in-app` provider is what stores it and pushes it over realtime.
    channels: { inbox: { provider: 'in-app' } },
  }),
);

export default notification;
