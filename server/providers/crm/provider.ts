import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';

import { CrmService } from './service.js';

/** The one CRM service, shared by every CRM route. */
export const crmServiceToken = createServiceToken<CrmService>(
  'nb3-factory/crm-service',
);

/**
 * Binds the CRM service to the database. The service resolves the database
 * manager lazily through the factory, so registration never touches the
 * connection and shutdown has nothing to release.
 */
export class CrmProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nb3-factory/crm';

  public override register(): void {
    this.app.container.singleton(crmServiceToken, () => {
      return new CrmService(this.app.container.resolve(databaseManagerToken));
    });
  }
}
