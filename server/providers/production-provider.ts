import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceResolver,
  type ServiceToken,
} from '@nocobase/service-provider';

import { ensureApplicationRoles } from './production-roles.js';
import {
  ProductionService,
  type RoleAssignmentReader,
} from './production-service.js';

export const productionServiceToken: ServiceToken<ProductionService> =
  createServiceToken<ProductionService>('app/production-service');

export default class ProductionProvider extends ServiceProvider<Application> {
  public readonly name = 'app/production';

  public override register(): void {
    if (!this.app.container.has(databaseManagerToken)) return;
    this.app.container.singleton(productionServiceToken, (container) => {
      return new ProductionService(
        container.resolve(databaseManagerToken),
        createRoleAssignmentReader(container),
      );
    });
  }

  public override async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    const authorization = this.app.container.resolve(authorizationToken);
    await ensureApplicationRoles(authorization);
  }
}

/**
 * Role membership is read from the authorization plugin's Permission Sets, which the built-in Users page
 * can also assign. A missing authorization plugin simply yields no assigned roles.
 */
function createRoleAssignmentReader(
  container: ServiceResolver,
): RoleAssignmentReader {
  if (!container.has(authorizationToken)) {
    return { listRoleKeys: async () => [] };
  }
  const authorization: Pick<AppAuthorization, 'permissionSets'> =
    container.resolve(authorizationToken);
  return {
    async listRoleKeys(userId: string) {
      const sets = await authorization.permissionSets.getEffective({
        principal: { type: 'user', id: userId },
      });
      return sets.map((set) => set.key);
    },
  };
}
