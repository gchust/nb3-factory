import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { LibraryService } from '../library/service.js';
import { libraryServiceToken } from '../library/tokens.js';

/**
 * Binds the library service and teaches Authorization about the `library.document` resource type.
 *
 * The type is a plain record type: `read`, `create`, `update`, `delete` and `share` are the actions an administrator
 * can grant on the wildcard item `*`, and each request is judged by whether a matching grant exists. Which *records* a
 * granted person may see or change is decided by `server/library/service.ts`, because that rule depends on `ownerId`,
 * `published`, `confidential` and the share table rather than on a static grant.
 */
export class LibraryProvider extends ServiceProvider<Application> {
  readonly name = 'library';

  register(): void {
    this.app.container.singleton(libraryServiceToken, (resolver) => {
      return new LibraryService(resolver.resolve(databaseManagerToken));
    });
  }

  boot(): Promise<void> {
    // An application may be assembled without authorization; the library still works, it just has no grants to check.
    if (!this.app.container.has(authorizationToken)) return Promise.resolve();
    const authorization = this.app.container.resolve(authorizationToken);
    authorization.resourceTypes.add({
      type: 'library.document',
      actions: ['read', 'create', 'update', 'delete', 'share'],
    });
    return Promise.resolve();
  }
}
