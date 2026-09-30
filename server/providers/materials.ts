import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  materialsLibrary,
  materialsPublicAccess,
} from '../materials-resources.js';
import {
  MaterialsLookupService,
  materialsLookupToken,
} from '../materials-service.js';

/** The locale namespace the application registers its own wording under. */
const NS = 'nb3-factory';

/**
 * Registers the `materials` collection, the public record selection and the
 * read-only assistant composite resource with the application authorization.
 *
 * This runs in the registration phase, before the authorization provider starts
 * and scans stored grants, so a permission set's `materials.library` grant is
 * already defined when startup validates it. Registering in `start()` would be
 * too late: the authorization provider's `start()` runs first.
 */
export class MaterialsProvider extends ServiceProvider<Application> {
  readonly name = 'materials';

  register(): void {
    // The lookup service is what lets an AI tool read materials for an actor
    // that has no HTTP request to authorize. Register it before the early
    // return so the token always resolves in an application container.
    this.app.container.singleton(
      materialsLookupToken,
      () => new MaterialsLookupService(this.app),
    );

    // An application assembled without the authorization plugin has no instance to
    // extend; registering nothing is the same as the platform's other providers.
    if (!this.app.container.has(authorizationToken)) {
      return;
    }

    const authz = this.app.container.resolve(authorizationToken);

    authz.database.collections.add({
      name: 'materials',
      title: { key: 'materials.resource.title', ns: NS },
    });
    authz.recordAccess.define(materialsPublicAccess);

    const reference = authz.compositeResources.define(materialsLibrary);
    authz.ui.sections.add({
      name: 'materials',
      title: { key: 'materials.resource.title', ns: NS },
      parent: 'business',
    });
    authz.ui.place(reference, { section: 'materials' });
  }
}
