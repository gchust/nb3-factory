import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

import { DeliveryService } from './service.js';

export const deliveryServiceToken =
  createServiceToken<DeliveryService>('delivery.service');

/**
 * Exposes the contract delivery domain service to the application container.
 * Routes resolve it instead of building their own, so one authorization scope
 * implementation serves every endpoint.
 */
export class DeliveryProvider extends ServiceProvider<Application> {
  public readonly name: string = 'contract-delivery';

  public override register(): void {
    this.app.container.singleton(
      deliveryServiceToken,
      (resolver) =>
        new DeliveryService(
          resolver.resolve(databaseManagerToken),
          this.app.publicBasePath,
        ),
    );
  }
}
