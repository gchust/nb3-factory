import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    // The application must be able to deliver at least the durable in-app inbox
    // without relying on an external configuration file: verification and
    // deployments may supply their own `config.yml` that omits `notification`.
    // An explicit `notification.channels` from configuration still replaces
    // this list, so real deployments keep control.
    channels: [
      {
        type: 'in-app',
        enabled: true,
        providers: [{ type: 'database', name: 'default' }],
      },
    ],
  }),
);

export default notification;
