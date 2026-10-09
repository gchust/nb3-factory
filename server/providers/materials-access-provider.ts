import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

import { provisionMaterialsAccess } from '../materials/demo-access.js';
import { registerMaterialsPermissionSets } from '../materials/permission-sets.js';

/**
 * Creates the materials Permission Sets and the two demonstration accounts.
 *
 * Both steps are existence-checked, so this runs identically on a fresh
 * installation and on one that already has them: an existing set is not
 * rewritten and an existing account keeps its password, profile and any later
 * administrator change. Permission and account configuration an administrator
 * makes afterwards therefore survives every restart.
 */
export class MaterialsAccessProvider extends ServiceProvider<Application> {
  readonly name = 'nb3-factory/materials-access';

  async boot(): Promise<void> {
    // Both services come from other plugins. Without them there is nothing to
    // provision against, and the application must still start.
    if (
      !this.app.container.has(authorizationToken) ||
      !this.app.container.has(userAdministrationServiceToken)
    ) {
      return;
    }
    const authorization = this.app.container.resolve(authorizationToken);
    const users = this.app.container.resolve(userAdministrationServiceToken);
    await registerMaterialsPermissionSets(authorization);
    await provisionMaterialsAccess({ authz: authorization, users });
  }
}
