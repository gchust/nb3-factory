import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';

import { provisionTestAccounts } from '../materials/provisioning.js';
import { registerMaterialsResources } from '../materials/resources.js';
import {
  MaterialsService,
  materialsServiceToken,
} from '../materials/service.js';

/**
 * Owns everything the materials feature needs at runtime: the service binding
 * the routes and the assistant tool resolve, the authorization declarations,
 * and the two sample accounts.
 */
export class MaterialsProvider extends ServiceProvider<Application> {
  readonly name = 'nb3-factory/materials';

  register(): void {
    this.app.container.singleton(
      materialsServiceToken,
      (resolver) =>
        new MaterialsService({
          databaseManager: resolver.resolve(databaseManagerToken),
          authz: resolver.resolve(authorizationToken),
        }),
    );
  }

  async boot(): Promise<void> {
    // The authorization and users plugins own these services; an embedded
    // runtime that mounts only this application's providers has neither, and
    // must still start.
    const authz = this.app.container.resolveIfCreated(authorizationToken);
    if (!authz) {
      return;
    }
    registerMaterialsResources(authz);

    const users = this.app.container.resolveIfCreated(
      userAdministrationServiceToken,
    );
    if (!users) {
      return;
    }
    await provisionTestAccounts(users, authz.permissionSets);
  }
}

export default MaterialsProvider;
