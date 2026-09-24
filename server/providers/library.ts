import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';

import { registerLibraryAuthorization } from '../library/authorization.js';

/**
 * Registers the library business module into the application's Authorization
 * service. It runs in `start`, after the database provider has applied the
 * migrations and seeds and after routes are registered, so the collections it
 * names already exist.
 */
export class LibraryAuthorizationProvider extends ServiceProvider<Application> {
  public readonly name: string = 'library-authorization';

  public override start(): Promise<void> {
    // A bare runtime may omit the authorization plugin; the library module has
    // no host to register into and nothing to authorize there.
    if (!this.app.container.has(authorizationToken)) {
      return Promise.resolve();
    }
    registerLibraryAuthorization(
      this.app.container.resolve(authorizationToken),
    );
    return Promise.resolve();
  }
}
