import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { ServiceProvider } from '@nocobase/service-provider';
import {
  LIBRARY_NAMESPACE,
  MATERIALS_COLLECTION,
  materials,
  nonConfidentialAccess,
  publishedAccess,
} from '../library/resources.js';

const title = (key: string) => ({ key, ns: LIBRARY_NAMESPACE });

/**
 * Registers the document library's authorization model.
 *
 * Every declaration is a pure builder, so the installation seeds can import the same action names, data-scope keys and
 * record-access keys without a running application. This provider is the only place the model is registered, and it
 * runs in `boot()`: plugin providers have already created the authorization instance, and every provider boots before
 * the authorization provider's `start()` validates workspace placement.
 */
export class LibraryProvider extends ServiceProvider<Application> {
  public readonly name = 'nb3-factory/library';

  public boot(): Promise<void> {
    // An application provider is registered even when the runtime was assembled without the authorization plugin —
    // the isolated runtime contribution tests do exactly that. There is nothing to register against then, so the
    // model is skipped rather than crashing startup; the real application always registers the plugin.
    if (!this.app.container.has(authorizationToken)) return Promise.resolve();

    const authz = this.app.container.resolve(authorizationToken);

    authz.database.collections.add({
      name: MATERIALS_COLLECTION,
      title: title('library.materials'),
      description: title('library.materialsDescription'),
    });

    authz.recordAccess.define(publishedAccess);
    authz.recordAccess.define(nonConfidentialAccess);

    const reference = authz.compositeResources.define(materials);

    authz.ui.sections.add({
      name: 'library',
      title: title('library.title'),
      parent: 'business',
    });
    authz.ui.place(reference, { section: 'library' });

    return Promise.resolve();
  }
}
