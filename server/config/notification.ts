import { defineMailChannelsConfig } from '@nocobase/app-server/mailer';
import { type AppConfigFactory } from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

/*
 * The application's notification channels.
 *
 * `inbox` is the durable in-app channel the ticket feature sends through: a new assignment, a resolution waiting for
 * confirmation and an overdue reminder all land in the recipient's inbox, where the message links to the ticket.
 * Mail is added here rather than in feature code, so a feature names a channel and never a transport.
 */
const notification: AppConfigFactory<NotificationConfig> =
  defineMailChannelsConfig({
    defaults: {
      channels: {
        inbox: { provider: 'in-app' },
      },
    },
  });

export default notification;
