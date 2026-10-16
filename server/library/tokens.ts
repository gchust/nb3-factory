import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { DocumentLibrary } from './service.js';

/**
 * The document library, bound by `LibraryProvider` so the routes resolve the
 * domain logic without importing the implementation. Two `createServiceToken`
 * calls with the same name are different keys, so always import this one.
 */
export const documentLibraryToken: ServiceToken<DocumentLibrary> =
  createServiceToken<DocumentLibrary>('app/library');
