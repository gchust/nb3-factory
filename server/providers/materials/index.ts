import {
  AUTHORIZATION_SETTINGS_SECTION,
  authorizationToken,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

import {
  MATERIALS_COLLECTION,
  MATERIALS_NAMESPACE,
  SHARING_SETTINGS_ID,
} from '../../materials/constants.js';
import { defineMaterialRecordAccess } from '../../materials/record-access.js';
import { MaterialsService } from './service.js';

/** The token routes and out-of-tree consumers resolve the materials domain through. */
export const materialsServiceToken =
  createServiceToken<MaterialsService>('materials');

/**
 * Registers the materials model and binds the service that reads and writes it.
 *
 * The model is stated through the authorization plugin rather than in these routes: `materials` becomes a collection the
 * permission model knows, the two Record Access policies it is scoped by are defined here, and the administrator's
 * `materials.sharing` settings item is added. All of that runs in `boot()`, after the authorization plugin's own
 * provider has registered, and before any route factory runs.
 */
export class MaterialsProvider extends ServiceProvider<Application> {
  readonly name = '@nocobase/app-materials';

  register(): void {
    this.app.container.singleton(materialsServiceToken, (resolver) => {
      const authorization = resolver.resolve(authorizationToken);
      return new MaterialsService(
        resolver.resolve(databaseManagerToken),
        authorization.database,
      );
    });
  }

  async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    const authorization = this.app.container.resolve(authorizationToken);
    const database = this.app.container.resolve(databaseManagerToken);

    authorization.database.collections.add({
      name: MATERIALS_COLLECTION,
      title: { key: 'collections.materials', ns: MATERIALS_NAMESPACE },
      description: {
        key: 'collections.materialsDescription',
        ns: MATERIALS_NAMESPACE,
      },
    });

    const access = defineMaterialRecordAccess(database);
    authorization.recordAccess.define(access.readable);
    authorization.recordAccess.define(access.confidentiality);

    authorization.settings.add({
      id: SHARING_SETTINGS_ID,
      title: { key: 'settings.materialsSharing', ns: MATERIALS_NAMESPACE },
      actions: [
        {
          name: 'read',
          title: {
            key: 'settings.materialsSharing.read',
            ns: MATERIALS_NAMESPACE,
          },
        },
        {
          name: 'manage',
          title: {
            key: 'settings.materialsSharing.manage',
            ns: MATERIALS_NAMESPACE,
          },
        },
      ],
    });
    // Without a placement the permission workspace would list the sharing permission under the administration
    // section's "Other" and log a startup warning.
    authorization.ui.place(
      { type: 'settings', id: SHARING_SETTINGS_ID },
      { section: AUTHORIZATION_SETTINGS_SECTION },
    );
  }
}
