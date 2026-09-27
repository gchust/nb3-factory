import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { ServiceProvider } from '@nocobase/service-provider';

import { registerLibraryAuthorization } from '../library/documents.js';

/**
 * Registers the document library's authorization model once the application's
 * Authorization exists: its Collection, record accesses, composite actions,
 * permission workspace section and reader subject.
 */
export class LibraryAuthorizationProvider extends ServiceProvider<Application> {
  name = 'nb3-factory/library-authorization';

  async boot(): Promise<void> {
    // The authorization plugin owns the service this model extends. An
    // application that does not load it has no composite resources to extend.
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    const authz = this.app.container.resolve(authorizationToken);
    registerLibraryAuthorization(authz);
  }
}

export default LibraryAuthorizationProvider;
