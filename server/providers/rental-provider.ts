import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { RentalService, rentalServiceToken } from './rental-service.js';

/** Makes the rental domain service available to the application routes. */
export default class RentalProvider extends ServiceProvider<Application> {
  public readonly name = 'app/rental-service';

  public override register(): void {
    if (!this.app.container.has(databaseManagerToken)) return;
    this.app.container.singleton(
      rentalServiceToken,
      () => new RentalService(this.app.container.resolve(databaseManagerToken)),
    );
  }
}
