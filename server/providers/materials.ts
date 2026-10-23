import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import type { AuthorizationTitle } from '@nocobase/authorization/core';
import type { SharingRulesAuthorizationApi } from '@nocobase/authorization/sharing-rules';
import { databaseManagerToken, type DatabaseConnection } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  APP_NS,
  MATERIALS_COLLECTION,
  MATERIALS_SECTION,
  materialsNonConfidential,
  materialsPublic,
  materialsResource,
} from '../materials/authorization.js';
import {
  createMaterialsService,
  materialsServiceToken,
} from './materials-service.js';

const text = (key: string): AuthorizationTitle => ({ key, ns: APP_NS });

/**
 * Registers the materials library with the application's authorization and
 * publishes the service its routes use.
 *
 * The declarations themselves live in `server/materials/authorization.ts`; this
 * provider turns them into a governed collection, the named record accesses and
 * the business operation the permission workspace lists, and composes the
 * service from the sharing-rules API and the Users plugin's directory.
 */
export class MaterialsProvider extends ServiceProvider<Application> {
  readonly name = 'app/materials';

  register(): void {
    this.app.container.singleton(materialsServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const users = this.app.container.resolve(userManagementServiceToken);
      const idGenerator = this.app.container.resolve(idGeneratorToken);
      const authz = this.app.container.resolve(authorizationToken);
      if (!('sharingRules' in authz)) {
        throw new Error(
          'The materials library needs the authorization sharing-rules plugin.',
        );
      }
      const sharing = (
        authz as AppAuthorization &
          SharingRulesAuthorizationApi<DatabaseConnection>
      ).sharingRules;
      return createMaterialsService({
        database,
        sharing: () => sharing,
        users: () => users,
        newId: () => idGenerator.generateString(),
      });
    });
  }

  async boot(): Promise<void> {
    // The library is governed by the authorization plugin. A composition that registers only the application's own
    // providers and no plugins still starts; the library is then simply not governed rather than taking the app down.
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);

    // Opt the collection into the permission model before anything selects a
    // record from it; an unregistered collection is denied to everyone.
    authz.database.collections.add({
      name: MATERIALS_COLLECTION,
      title: text('materials.collectionTitle'),
    });

    // The named record accesses a grant or a rule may choose.
    authz.recordAccess.define(materialsPublic);
    authz.recordAccess.define(materialsNonConfidential);

    // The business operation, listed under its own Business subsection.
    const reference = authz.compositeResources.define(materialsResource);
    authz.ui.sections.add({
      name: MATERIALS_SECTION,
      title: text('materials.sectionTitle'),
      parent: 'business',
    });
    authz.ui.place(reference, { section: MATERIALS_SECTION });
  }
}
