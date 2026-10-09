import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { ServiceProvider } from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';

import {
  MATERIALS_COLLECTION,
  materialsResource,
} from '../materials/resources.js';
import { registerMaterialsRecordAccess } from '../materials/record-access.js';
import { MaterialSearchService } from '../materials/search-service.js';
import { materialSearchServiceToken } from '../materials/tokens.js';

/**
 * Declares the materials authorization model and binds the assistant's reader.
 *
 * Everything here is registration, never permission: the collection and the
 * composite resource describe what may be granted, the record access describes
 * the reusable non-confidential selection, and the search service is the
 * actor-bound reader the tool depends on. Who holds which grant is decided by
 * the access provider next to it, so a fresh installation and a restored one
 * take the same path.
 */
export class MaterialsProvider extends ServiceProvider<Application> {
  readonly name = 'nb3-factory/materials';

  async boot(): Promise<void> {
    // The authorization plugin owns this token. Without it there is no
    // authorization model to extend, and the application must still start.
    if (!this.app.container.has(authorizationToken)) return;
    const authorization = this.app.container.resolve(authorizationToken);
    const database = this.app.container.resolve(databaseManagerToken);

    authorization.database.collections.add({
      name: MATERIALS_COLLECTION,
      title: 'Materials',
    });
    // The record access must exist before the composite resolves its scope.
    registerMaterialsRecordAccess(authorization);
    authorization.compositeResources.define(materialsResource);
    authorization.ui.sections.add({
      name: 'materials',
      title: 'Materials',
      parent: 'business',
    });
    authorization.ui.place(materialsResource.reference(), {
      section: 'materials',
    });

    this.app.container.instance(
      materialSearchServiceToken,
      new MaterialSearchService(authorization, database),
    );
  }
}
