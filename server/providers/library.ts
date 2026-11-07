import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { registerLibraryAuthorization } from '../library-resources.js';
import {
  createLibraryService,
  type LibraryService,
} from '../library-service.js';

export const libraryServiceToken: ServiceToken<LibraryService> =
  createServiceToken<LibraryService>('app/library-service');

export default class LibraryProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/library-provider';

  public override register(): void {
    this.app.container.singleton(libraryServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const authorization = this.app.container.resolve(authorizationToken);
      return createLibraryService(database, authorization);
    });
  }

  public override async boot(): Promise<void> {
    // Runtime compositions used in tests may omit the authorization plugin. The library is then unavailable, but
    // starting the application must not require a service that composition never registered.
    if (!this.app.container.has(authorizationToken)) return;
    const authorization = this.app.container.resolve(authorizationToken);
    registerLibraryAuthorization(authorization);
  }
}
