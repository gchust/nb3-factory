import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  createAcceptanceNotifier,
  acceptanceNotifierServiceToken,
  type AcceptanceNotifier,
} from '../services/notify.js';
import {
  acceptOrderRecord,
  orderAcceptanceServiceToken,
  type OrderAcceptanceService,
} from '../services/order-lifecycle.js';

/**
 * Exposes the order-acceptance transition to the workflow run handlers.
 *
 * The `order-acceptance` workflow's run node cannot import application source,
 * so it resolves this service from the application container by the shared
 * `orderAcceptanceServiceToken`. The transition itself stays implemented once,
 * in `server/services/order-lifecycle.ts`, and the HTTP order service imports it
 * directly.
 */
export default class ServiceOrderProvider extends ServiceProvider<Application> {
  public readonly name = 'app/service-orders';

  public override register(): void {
    this.app.container.singleton(
      orderAcceptanceServiceToken,
      (container): OrderAcceptanceService => {
        const database = container.resolve(databaseManagerToken);
        return {
          acceptOrderRecord: (input) => acceptOrderRecord(database, input),
        };
      },
    );
    this.app.container.singleton(
      acceptanceNotifierServiceToken,
      (container): AcceptanceNotifier => {
        const database = container.resolve(databaseManagerToken);
        // The notification plugin may be absent in a minimal deployment; the
        // notifier then reports the notice as undeliverable instead of failing.
        const notification = container.has(notificationServiceToken)
          ? container.resolve(notificationServiceToken)
          : undefined;
        return createAcceptanceNotifier({ database, notification });
      },
    );
  }
}
