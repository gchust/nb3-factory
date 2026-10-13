import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { LibraryService } from './service.js';

/**
 * The one `LibraryService` per application. Declared once here so the provider that binds it and the routes that
 * resolve it agree on the key; calling `createServiceToken` twice with the same name would create two.
 */
export const libraryServiceToken: ServiceToken<LibraryService> =
  createServiceToken<LibraryService>('libraryService');
