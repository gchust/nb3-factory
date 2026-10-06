import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import { registerLibraryAuthorization } from '../library/registration.js';
import {
  LibraryService,
  type LibraryAuthorization,
} from '../library/service.js';

/** DI token for the library's domain service. */
export const libraryServiceToken =
  createServiceToken<LibraryService>('library.service');

/**
 * Owns the library service and declares the library to the authorization
 * subsystem.
 *
 * The declaration runs in `boot()` because every provider has registered by
 * then — including the authorization provider that binds `authorizationToken` —
 * while the authorization provider's own `start()`, which validates those
 * registrations, has not run yet.
 */
export class LibraryProvider extends ServiceProvider<Application> {
  readonly name = 'library';

  register(): void {
    this.app.container.singleton(libraryServiceToken, (container) => {
      return new LibraryService(
        container.resolve(databaseManagerToken),
        container.resolve(authorizationToken) as LibraryAuthorization,
      );
    });
  }

  async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    registerLibraryAuthorization(
      this.app.container.resolve(authorizationToken),
    );
  }
}
