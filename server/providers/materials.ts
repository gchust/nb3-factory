import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  MATERIALS_COLLECTION,
  MATERIALS_NAMESPACE,
  MATERIALS_SECTION,
  materialsCompositeResource,
  materialsViewable,
} from '../materials/declaration.js';
import {
  MaterialsService,
  materialsServiceToken,
} from './materials-service.js';

/**
 * Registers the materials feature with the authorization model and binds the
 * service the routes and the assistant tool both use.
 *
 * Registration is not permission: this makes the Collection, its record access
 * and the `view`/`edit` composite available to the settings workspace and to
 * `authorizeRepository`-style checks. The permission sets that actually grant a
 * supervisor or a colleague access come from the installation seeds.
 */
export class MaterialsProvider extends ServiceProvider<Application> {
  public readonly name = 'app/materials';

  public override register(): void {
    this.app.container.singleton(
      materialsServiceToken,
      (container) =>
        new MaterialsService(
          container.resolve(databaseManagerToken),
          container.resolve(authorizationToken),
        ),
    );
  }

  public override async boot(): Promise<void> {
    // The runtime may be assembled without the authorization plugin (the
    // runtime-composition tests do). Nothing can be registered then, and no
    // route that needs the model is mounted either.
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    const authz = this.app.container.resolve(authorizationToken);
    authz.database.collections.add({
      name: MATERIALS_COLLECTION,
      title: { key: 'collection.title', ns: MATERIALS_NAMESPACE },
    });
    authz.recordAccess.define(materialsViewable);
    const reference = authz.compositeResources.define(
      materialsCompositeResource,
    );
    authz.ui.sections.add({
      name: MATERIALS_SECTION,
      title: { key: 'ui.section', ns: MATERIALS_NAMESPACE },
      parent: 'business',
    });
    authz.ui.place(reference, { section: MATERIALS_SECTION });
  }
}
