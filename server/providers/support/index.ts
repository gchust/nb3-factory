import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import { ServiceProvider } from '@nocobase/service-provider';

import { registerSupportAuthorization } from './authorization.js';

/**
 * Registers the support desk's authorization resources. The collections and
 * custom resources must exist before any request is authorized, so this runs
 * during boot next to the application's other role provider.
 */
export default class SupportTicketsProvider extends ServiceProvider<Application> {
  public readonly name = 'app/support-tickets';

  public override boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return Promise.resolve();
    const authorization =
      this.app.container.resolve<AppAuthorization>(authorizationToken);
    registerSupportAuthorization(authorization);
    return Promise.resolve();
  }
}
