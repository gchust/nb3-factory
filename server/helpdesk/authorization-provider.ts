import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { registerHelpdeskAuthorization } from './resources.js';

/**
 * Declares the helpdesk business operation, its record-access selections and
 * the settings item for reminder policy. It grants nobody access: the seed
 * provides the initial permission sets an administrator can then change.
 */
export class HelpdeskAuthorizationProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/helpdesk-authorization-provider';

  public override async boot(): Promise<void> {
    // An embedded composition can run this application's providers without the
    // authorization plugin. The business operation matters only where that
    // plugin owns permissions, so skip instead of failing the whole app.
    if (!this.app.container.has(authorizationToken)) return;
    registerHelpdeskAuthorization(
      this.app.container.resolve(authorizationToken),
      this.app.container.resolve(databaseManagerToken),
    );
  }
}
