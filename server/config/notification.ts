import { defineMailChannelsConfig } from '@nocobase/app-server/mailer';
import { type AppConfigFactory } from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> =
  defineMailChannelsConfig({
    defaults: {
      // The header bell and the ticket workflow use this durable in-app inbox. A deployment can add email or
      // other channels beside it under the same configuration key.
      channels: { inbox: { provider: 'in-app' } },
    },
  });

export default notification;
