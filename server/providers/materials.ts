import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import { registerMaterialsAuthorization } from '../authorization/materials.js';
import {
  MaterialsService,
  materialsServiceToken,
} from '../services/materials.js';

/**
 * Owns this application's materials: it registers the collection, record access and composite resource the permission
 * model is built from, and exposes the service the HTTP routes and the assistant tool share.
 *
 * Registration happens in `boot()` because the Authorization the plugins own is only complete once every plugin
 * provider has booted, and the registries reject a duplicate add.
 */
export class MaterialsProvider extends ServiceProvider<Application> {
  readonly name = 'materials';

  register(): void {
    this.app.container.singleton(materialsServiceToken, (resolver) => {
      const database = resolver.resolve(databaseManagerToken);
      const authorization = resolver.resolve(authorizationToken);
      return new MaterialsService({ database, authorization });
    });
  }

  async boot(): Promise<void> {
    // The registry this registers into belongs to the authorization plugin. An application assembled without that
    // plugin — a focused test or an embedded host that composes its own plugin list — has nowhere to register into,
    // so there is nothing to do rather than a missing service to crash on.
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    const authorization: AppAuthorization =
      this.app.container.resolve(authorizationToken);
    registerMaterialsAuthorization(authorization);
  }
}
