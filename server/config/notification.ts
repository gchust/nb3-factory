import { defineMailChannelsConfig } from '@nocobase/app-server/mailer';
import { type AppConfigFactory } from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

// `inbox` is the notice board the helpdesk lifecycle writes to. The `in-app`
// provider is registered by the installed notification-in-app plugin; email
// stays unconfigured because the application has no SMTP deployment settings.
const notification: AppConfigFactory<NotificationConfig> =
  defineMailChannelsConfig({
    defaults: { channels: { inbox: { provider: 'in-app' } } },
  });

export default notification;
