import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

import { createCrmService } from './service.js';
import { crmServiceToken } from './token.js';

/**
 * Binds the CRM domain service to the application container. The service
 * resolves the database manager lazily, so registration order against
 * DatabaseProvider does not matter.
 */
export class CrmServiceProvider extends ServiceProvider<Application> {
  readonly name = 'app.crm';

  register(): void {
    this.app.container.singleton(crmServiceToken, (resolver) =>
      createCrmService(resolver.resolve(databaseManagerToken)),
    );
  }
}

export { crmServiceToken } from './token.js';
export { CrmService, createCrmService } from './service.js';
export * from './types.js';
