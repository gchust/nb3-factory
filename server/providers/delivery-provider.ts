import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { DeliveryService } from './delivery-service.js';

export const deliveryServiceToken: ServiceToken<DeliveryService> =
  createServiceToken<DeliveryService>('app/delivery-service');

export default class DeliveryProvider extends ServiceProvider<Application> {
  public readonly name = 'app/delivery';

  public override register(): void {
    this.app.container.singleton(
      deliveryServiceToken,
      (container) =>
        new DeliveryService(container.resolve(databaseManagerToken)),
    );
  }
}
