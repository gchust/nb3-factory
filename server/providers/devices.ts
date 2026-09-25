import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';

import { registerDeviceAuthorization } from '../devices/authorization.js';

/**
 * Registers the device inventory into the application's Authorization service.
 * It runs in `start`, after the database provider has applied the migrations
 * and seeds and after routes are registered, so the collection it names already
 * exists.
 */
export class DeviceAuthorizationProvider extends ServiceProvider<Application> {
  public readonly name: string = 'device-authorization';

  public override start(): Promise<void> {
    // A bare runtime may omit the authorization plugin; the device module has
    // no host to register into and nothing to authorize there.
    if (!this.app.container.has(authorizationToken)) {
      return Promise.resolve();
    }
    registerDeviceAuthorization(this.app.container.resolve(authorizationToken));
    return Promise.resolve();
  }
}
