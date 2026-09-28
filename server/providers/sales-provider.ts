import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import {
  DatabaseSalesStore,
  SalesService,
  salesServiceToken,
} from './sales-service.js';

/** Only the pieces of the application this provider needs. */
export interface SalesServiceProviderApplication {
  readonly container: ServiceContainer;
}

/**
 * Binds the sales service to the application container, reading records
 * through the default database connection resolved on first use.
 */
export class SalesServiceProvider extends ServiceProvider<SalesServiceProviderApplication> {
  readonly name = 'sales';

  register(): void {
    const { container } = this.app;
    container.singleton(
      salesServiceToken,
      (resolver) =>
        new SalesService(
          new DatabaseSalesStore(resolver.resolve(databaseManagerToken)),
        ),
    );
  }
}
