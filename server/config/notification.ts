import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // The service module delivers work-order and inspection notices to the
    // durable in-app inbox. An empty channel map makes every send reject, so
    // the inbox channel is declared here; `inbox` is the key the domain code
    // addresses in `messages`.
    channels: {
      inbox: { provider: 'in-app' },
    },
  }),
);

export default notification;
