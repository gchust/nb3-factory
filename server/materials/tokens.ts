import { createServiceToken } from '@nocobase/service-provider';
import type { MaterialSearchService } from './search-service.js';

/**
 * Container binding for the actor-bound materials reader the assistant's tool
 * declares. `createServiceToken` keys the container by object identity, so the
 * provider and the tool must import this one token rather than recreate it.
 */
export const materialSearchServiceToken =
  createServiceToken<MaterialSearchService>('nb3-factory/materials/search');
