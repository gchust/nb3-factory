import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

/**
 * The `inbox` channel is the application's own, backed by the in-app provider, and it is what the ticket desk uses to
 * tell someone their ticket was assigned, resolved, confirmed, returned, or left waiting. Adding an email or chat
 * channel later means adding it here and naming it in the delivery code; the ticket desk only ever addresses `inbox`.
 */
const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    channels: {
      inbox: { provider: 'in-app' },
    },
  }),
);

export default notification;
