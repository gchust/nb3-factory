import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { AIResourcesProvider } from './ai-resources-provider.js';
import { MaterialsAccessProvider } from './materials-access-provider.js';
import { MaterialsProvider } from './materials-provider.js';

/**
 * Application-owned providers, booted in this order after every plugin
 * provider: the materials model must be declared before the access provider
 * issues grants for it, and the AI resources are registered last so the
 * `materials` collection and the assistant's reader are already in place.
 */
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  MaterialsProvider,
  MaterialsAccessProvider,
  AIResourcesProvider,
];

export default serviceProviders;
