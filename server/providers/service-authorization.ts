import type { Application } from '@nocobase/app-server/application';
import { loggingToken } from '@nocobase/app-server/logging';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { ServiceProvider } from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';

import { registerServiceAuthorization } from '../authorization/register.js';

/**
 * Registers the after-sales permission model with the application's
 * Authorization at boot: the business collections, the composite resources
 * the permission sets grant, and the order/knowledge record selections.
 *
 * Registration is imperative because a seed or a permission set may reference
 * the same builders through `.reference()`; see `server/authorization/`.
 */
export default class ServiceAuthorizationProvider extends ServiceProvider<Application> {
  public readonly name = 'app/service-authorization';

  public override async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) {
      this.app.container
        .resolve(loggingToken)
        .getLogger()
        .warn(
          'Authorization is not registered; the after-sales permission model was not loaded.',
        );
      return;
    }

    registerServiceAuthorization(
      this.app.container.resolve(authorizationToken),
      this.app.container.resolve(databaseManagerToken),
    );
  }
}
